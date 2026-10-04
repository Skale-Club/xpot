import type { NextFunction, Request, Response } from "express";
import type { TagActor } from "#shared/tagAccess.js";
import { repModules } from "#shared/modules.js";
import { accessDenial, ensureXpotRep, isManagerOrAdmin } from "../routes/xpot/middleware.js";

// Who is acting on the Tags API. Built from Xpot's own rep identity, read from
// the database on every request, so switching a reseller off takes effect at
// once. Unlike requireXpotManager, managers must also be active here.

export type { TagActor };

async function loadActor(req: Request, res: Response): Promise<TagActor | null> {
  const found = await ensureXpotRep(req);
  if (!found) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  const denial = accessDenial(found.rep);
  if (denial) {
    res.status(403).json(denial);
    return null;
  }
  const isManager = isManagerOrAdmin(found);
  if (!isManager && !repModules(found.rep).includes("tags")) {
    res.status(403).json({ message: "Tags are not enabled for your account." });
    return null;
  }
  return { userId: found.user.userId, repId: found.rep.id, isManager };
}

/** Any active rep (reseller, manager or admin); the actor is then `actorOf(req)`. */
export async function requireTagUser(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await loadActor(req, res);
    if (!actor) return;
    (req as Request & { tagActor?: TagActor }).tagActor = actor;
    next();
  } catch (err) {
    console.error("[tags] requireTagUser", err);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

/** Active manager or admin. */
export async function requireTagManager(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await loadActor(req, res);
    if (!actor) return;
    if (!actor.isManager) return res.status(403).json({ message: "Manager access required" });
    (req as Request & { tagActor?: TagActor }).tagActor = actor;
    next();
  } catch (err) {
    console.error("[tags] requireTagManager", err);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

export function actorOf(req: Request): TagActor {
  const actor = (req as Request & { tagActor?: TagActor }).tagActor;
  if (!actor) throw new Error("requireTagUser/requireTagManager must run before actorOf");
  return actor;
}
