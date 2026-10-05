import type { NextFunction, Request, Response } from "express";
import { repModules } from "#shared/modules.js";
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
  // Resellers sell Skale Club's pieces under Xpot, so signing up alone grants
  // nothing: a new account starts switched off until an admin enables it in
  // Admin → Reps. Global admins are the exception.
  const rep = await storage.upsertSalesRep({
    userId: user.userId,
    displayName,
    email: user.email,
    role: user.isAdmin ? "admin" : "rep",
    isActive: user.isAdmin,
  });

  return { user, rep };
}

/** Why a rep can't use the app yet (or anymore), for the 403 the client shows. */
export function accessDenial(rep: { isActive: boolean; blockedAt?: Date | null }): { code: "pending" | "blocked"; message: string } | null {
  if (rep.blockedAt) return { code: "blocked", message: "Your Xpot access is turned off. Contact Skale Club." };
  if (!rep.isActive) return { code: "pending", message: "Your sign-up is being reviewed. Skale Club will turn on your access." };
  return null;
}

export async function requireXpotUser(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await ensureXpotRep(req);
    if (!actor) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const denial = accessDenial(actor.rep);
    if (denial) return res.status(403).json(denial);
    (req as any).xpotActor = actor;
    next();
  } catch (err) {
    console.error("[requireXpotUser]", err);
    res.status(500).json({ message: (err as Error).message || "Internal server error" });
  }
}

/**
 * API paths that belong to the Visits module alone. Leads and place search stay
 * out: they are the businesses both modules sell to (Tags picks and creates its
 * customers there). Mounted in front of the routers in ./index.ts.
 */
export const VISITS_ONLY_PATHS = [
  "/dashboard",
  "/metrics",
  "/visits",
  "/opportunities",
  "/tasks",
  "/sync",
  "/map",
  "/xphere",
  "/products",
  "/sales",
  "/consignments",
] as const;

/**
 * Refuses a rep whose account has Visits switched off (a Tags-only reseller).
 * The client already hides those screens; this is the server side of the same
 * rule, like requireTagUser does for Tags. Anonymous and inactive requests go
 * through untouched so each route answers them with its own 401/403.
 */
export async function requireVisitsModule(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await ensureXpotRep(req);
    if (!actor || accessDenial(actor.rep) || isManagerOrAdmin(actor)) return next();
    if (!repModules(actor.rep).includes("visits")) {
      return res.status(403).json({ code: "module_off", message: "Visits are not enabled for your account." });
    }
    next();
  } catch (err) {
    console.error("[requireVisitsModule]", err);
    res.status(500).json({ message: "Failed to verify access" });
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
    // A blocked or not-yet-approved manager is out like anyone else
    // (global admins excepted, so the owner can't lock themselves out).
    const denial = actor.user.isAdmin ? null : accessDenial(actor.rep);
    if (denial) return res.status(403).json(denial);
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
