import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/**
 * The last word on any error a route did not answer itself (app.ts mounts it
 * after every route; express-async-errors brings async throws here).
 *
 * - A ZodError is the caller's input: 400 with the first issue, like the Tags API.
 * - An error that carries its own 4xx status and is safe to show (http-errors'
 *   `expose`, e.g. express.json's 413 for a body over its limit or 400 for
 *   malformed JSON) keeps that status and message.
 * - Anything else is ours: 500 "Internal server error", with the cause only in the
 *   log, because a 500's own text can carry SQL or library internals.
 */
export function apiErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: err.issues[0]?.message ?? "Validation error", errors: err.errors });
  }
  const http = err as { status?: unknown; statusCode?: unknown; expose?: unknown; message?: unknown };
  const status = Number(http.status ?? http.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500 && http.expose === true) {
    return res.status(status).json({ message: typeof http.message === "string" ? http.message : "Bad request" });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
}
