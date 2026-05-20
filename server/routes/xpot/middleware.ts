import type { NextFunction, Request, Response } from "express";
import { storage } from "../../storage.js";

export type SessionUser = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
};

export async function getCurrentSessionUser(req: Request): Promise<SessionUser | null> {
  const sess = req.session as any;
  if (!sess?.userId) {
    return null;
  }

  return {
    userId: sess.userId,
    email: sess.email ?? null,
    firstName: sess.firstName ?? null,
    lastName: sess.lastName ?? null,
    isAdmin: Boolean(sess.isAdmin),
  };
}

export async function ensureXpotRep(req: Request) {
  const user = await getCurrentSessionUser(req);
  if (!user) {
    return null;
  }

  const existingRep = await storage.getSalesRepByUserId(user.userId);
  if (existingRep) {
    return { user, rep: existingRep };
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Xpot Rep";
  const rep = await storage.upsertSalesRep({
    userId: user.userId,
    displayName,
    email: user.email,
    role: user.isAdmin ? "admin" : "rep",
    isActive: true,
  });

  return { user, rep };
}

export async function requireXpotUser(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await ensureXpotRep(req);
    if (!actor) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!actor.rep.isActive) {
      return res.status(403).json({ message: "Xpot access disabled" });
    }
    (req as any).xpotActor = actor;
    next();
  } catch (err) {
    console.error("[requireXpotUser]", err);
    res.status(500).json({ message: (err as Error).message || "Internal server error" });
  }
}

export function isManagerOrAdmin(actor: { user: SessionUser; rep: { role: string } }): boolean {
  return actor.user.isAdmin || actor.rep.role === "manager" || actor.rep.role === "admin";
}

export async function requireXpotManager(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await ensureXpotRep(req);
    if (!actor) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!actor.user.isAdmin && !["manager", "admin"].includes(actor.rep.role)) {
      return res.status(403).json({ message: "Manager access required" });
    }
    (req as any).xpotActor = actor;
    next();
  } catch (err) {
    console.error("[requireXpotManager]", err);
    res.status(500).json({ message: (err as Error).message || "Internal server error" });
  }
}
