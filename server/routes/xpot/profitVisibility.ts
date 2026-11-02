// What a product costs and what a sale leaves over belong to whoever owns the business (the plan: "a seller sees
// neither profit nor cost"). The app hides them with useShowProfit, but a hidden number is still in the response,
// so the server takes it out for a member before it leaves: products, sales and consignments.

import type { NextFunction, Request, Response } from "express";
import { profileOf } from "#shared/profiles.js";
import { listOrganizations } from "../../organizations/service.js";
import { accessDenial, ensureXpotRep, type XpotActor } from "./middleware.js";

/** Every field of these APIs that carries a cost or a profit. */
const PROFIT_KEYS: ReadonlySet<string> = new Set([
  "costCents",
  "unitCostCents",
  "costBasisCents",
  "profitCents",
  "grossProfitCents",
  "lifetimeProfitCents",
  // The Sales summary's { todayCents, periodCents, monthToDateCents } of profit.
  "profit",
]);

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** A copy of `value` without any cost or profit field, at any depth. Dates and other objects pass through as they are. */
export function withoutProfit<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutProfit) as unknown as T;
  if (!isPlain(value)) return value;
  const kept: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) if (!PROFIT_KEYS.has(key)) kept[key] = withoutProfit(inner);
  return kept as T;
}

/** The same rule the app uses (useShowProfit): everyone but a member, whom the panels call "someone selling". */
export async function actorSeesProfit(actor: XpotActor): Promise<boolean> {
  if (actor.user.isAdmin) return true;
  return profileOf({ user: actor.user, organizations: await listOrganizations(actor) }) !== "member";
}

/**
 * Takes cost and profit out of every JSON answer for a member. Anonymous and switched-off accounts pass through
 * untouched, so each route answers them with its own 401/403.
 */
export async function hideProfitFromMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = await ensureXpotRep(req);
    if (!actor || accessDenial(actor.rep) || (await actorSeesProfit(actor))) return next();
    const send = res.json.bind(res);
    res.json = (body?: unknown) => send(withoutProfit(body));
    next();
  } catch (err) {
    console.error("[hideProfitFromMembers]", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
