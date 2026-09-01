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

  // SEG-01: this used to hand every authenticated account a live rep profile,
  // so the Xpot perimeter was whatever the Supabase project allowed to sign up.
  // A new profile is now created dormant; requireXpotUser rejects it with 403
  // until an admin activates it in Admin › Reps. Platform admins are trusted
  // (they are the ones who would do the activating).
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Xpot Rep";
  const rep = await storage.upsertSalesRep({
    userId: user.userId,
    displayName,
    email: user.email,
    role: user.isAdmin ? "admin" : "rep",
    isActive: Boolean(user.isAdmin),
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
      return res.status(403).json({
        message: "Your Xpot access is not active yet. An administrator needs to approve your account.",
      });
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
    if (!actor.rep.isActive) {
      return res.status(403).json({
        message: "Your Xpot access is not active yet. An administrator needs to approve your account.",
      });
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

// ─── Resource-level authorization ────────────────────────────────────────────
//
// Ownership rule for lead-scoped resources (sales, consignments, visits):
// a rep works only on leads they own; managers and admins see everything.
// The sales module goes through this instead of re-copying the predicate.

export type XpotActor = NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;

export function canAccessLead(actor: XpotActor, lead: { ownerRepId: number | null }): boolean {
  return isManagerOrAdmin(actor) || lead.ownerRepId === actor.rep.id;
}

/** Load a lead and enforce access. Returns null after writing the error response. */
export async function loadAccessibleLead(req: Request, res: Response, leadId: number) {
  const actor = (req as any).xpotActor as XpotActor;
  if (!Number.isFinite(leadId) || leadId <= 0) {
    res.status(400).json({ message: "Invalid lead id" });
    return null;
  }
  const lead = await storage.getSalesLead(leadId);
  if (!lead) {
    res.status(404).json({ message: "Lead not found" });
    return null;
  }
  if (!canAccessLead(actor, lead)) {
    res.status(403).json({ message: "Access denied" });
    return null;
  }
  return lead;
}
