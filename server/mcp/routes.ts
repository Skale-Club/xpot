import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireTagAdmin } from "../tags/access.js";
import { TagError } from "../tags/errors.js";
import { handleMcpRequest } from "./server.js";
import { bearerSecret, createMcpToken, findActiveMcpToken, looksLikeMcpSecret, listMcpTokens, revokeMcpToken, touchMcpToken } from "./tokens.js";

// POST /mcp (the MCP endpoint, Bearer token) and the admin API that issues
// the tokens: /api/xpot/admin/mcp-tokens*. Registered before the Xpot routers
// (see server/routes.ts), whose admin router guards every path it sees.

const tokenCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
}).strict();

function userIdOf(req: Request): string | null {
  return (req.session as { userId?: string } | undefined)?.userId ?? null;
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof TagError) return res.status(err.status).json({ message: err.message });
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.issues[0]?.message ?? "Validation error", errors: err.errors });
  }
  console.error(`[mcp] ${fallback}:`, err);
  return res.status(500).json({ message: fallback });
}

export function registerMcpRoutes(app: Express) {
  const tokens = "/api/xpot/admin/mcp-tokens";

  app.get(tokens, requireTagAdmin, async (_req, res) => {
    try {
      res.json(await listMcpTokens());
    } catch (err) {
      fail(res, err, "Failed to load tokens");
    }
  });

  // The secret is in this response only; the database keeps its hash.
  app.post(tokens, requireTagAdmin, async (req, res) => {
    try {
      const { name } = tokenCreateSchema.parse(req.body);
      res.status(201).json(await createMcpToken(name, userIdOf(req)));
    } catch (err) {
      fail(res, err, "Failed to create token");
    }
  });

  app.post(`${tokens}/:id/revoke`, requireTagAdmin, async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(404).json({ message: "Not found" });
    try {
      res.json(await revokeMcpToken(id.data));
    } catch (err) {
      fail(res, err, "Failed to revoke token");
    }
  });

  // ─── MCP endpoint ───────────────────────────────────────────────────────────
  // Stateless: only POST carries a conversation. GET (a standalone SSE stream)
  // and DELETE (ending a session) have nothing to serve, so they answer 405.
  const unauthorized = (res: Response, message: string) =>
    res.set("WWW-Authenticate", "Bearer").status(401).json({ message });

  app.post("/mcp", async (req, res) => {
    const secret = bearerSecret(req.headers.authorization);
    if (!secret) return unauthorized(res, "Authorization: Bearer <token> required");
    if (!looksLikeMcpSecret(secret)) return unauthorized(res, "Invalid or revoked MCP token");
    let token;
    try {
      token = await findActiveMcpToken(secret);
    } catch (err) {
      return fail(res, err, "Failed to verify token");
    }
    if (!token) return unauthorized(res, "Invalid or revoked MCP token");

    // Fire-and-forget: a failed timestamp must not fail the call.
    touchMcpToken(token.id).catch((err) => console.error("[mcp] touch token:", err instanceof Error ? err.message : err));

    try {
      await handleMcpRequest(req, res, { tokenId: token.id, tokenPrefix: token.tokenPrefix });
    } catch (err) {
      console.error("[mcp] request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  app.all("/mcp", (_req, res) => {
    res.set("Allow", "POST").status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed: use POST" },
      id: null,
    });
  });
}
