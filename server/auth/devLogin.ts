import type { Express, Request, Response } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import { salesReps, users } from "#shared/schema.js";
import { startSession } from "./phoneAuth.js";

/**
 * Development-only sign-in, so people and agents can open any screen on localhost without Google:
 *   GET /api/dev/login               → the first active super admin of the development database
 *   GET /api/dev/login?email=a@b.com → that person
 *   &to=/academy                     → where to land (same-site paths only)
 * Never registered outside NODE_ENV=development, and only answers requests from this computer.
 */
export function registerDevLogin(app: Express) {
  if (process.env.NODE_ENV !== "development") return;

  app.get("/api/dev/login", async (req: Request, res: Response) => {
    if (!isLoopback(req)) return res.status(404).end();
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    const [row] = await db
      .select({ user: users })
      .from(users)
      .innerJoin(salesReps, eq(salesReps.userId, users.id))
      .where(email ? eq(users.email, email) : and(eq(users.isAdmin, true), eq(salesReps.isActive, true), isNull(salesReps.blockedAt)))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!row) return res.status(404).json({ message: email ? `No person with ${email}` : "No active super admin in this database" });

    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    await startSession(req, row.user);
    const to = typeof req.query.to === "string" && req.query.to.startsWith("/") && !req.query.to.startsWith("//") ? req.query.to : "/";
    res.redirect(to);
  });
}

function isLoopback(req: Request) {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
