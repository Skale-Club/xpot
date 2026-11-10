import { randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { salesReps } from "#shared/schema.js";
import { formatWholesaleCode, generateWholesaleCode, normalizeWholesaleCode, WHOLESALE_OPEN_PATH, wholesaleUrl } from "#shared/wholesale.js";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";
import { accessDenial, ensureXpotRep, isPlatformAdmin, requirePlatformAdmin } from "../routes/xpot/middleware.js";
import { repModules } from "#shared/modules.js";
import { stuscleWholesaleOrderSchema } from "#shared/tagSales.js";
import { recordStuscleOrder } from "../tags/acquisitions.js";
import { TagSaleError } from "../tags/sales.js";
import { ordersReachXpot } from "../tags/distribution.js";
import { distributionForRep } from "../organizations/links.js";
import { parseHandoffQuery, signWholesaleHandoff, wholesaleHandoffSecret } from "./handoff.js";

// Wholesale prices live in the Stuscle store; Xpot decides who gets them.
// Every approved rep has a personal code. Stuscle asks Xpot whether a code is
// good (server to server, shared secret) when the reseller enters it and again
// at checkout, so blocking someone here closes wholesale there at once.
//
// The code never travels in a link. A click in the Shop goes to Xpot's own
// open route, which signs a two-minute, single-use ticket for the signed-in
// rep's code and redirects to the store (handoff.ts); Stuscle accepts only that.
//
//   XPOT_WHOLESALE_SECRET  shared with Stuscle (its XPOT_WHOLESALE_SECRET)
//   STUSCLE_PUBLIC_URL     the store, for the "Buy kits" link (default https://stuscle.com)

const STORE_DEFAULT_URL = "https://stuscle.com";

export function storeBaseUrl(): string {
  return process.env.STUSCLE_PUBLIC_URL || STORE_DEFAULT_URL;
}

/** The rep's code, created the first time it's needed. */
export async function ensureWholesaleCode(repId: number): Promise<string> {
  const [rep] = await db.select({ code: salesReps.wholesaleCode }).from(salesReps).where(eq(salesReps.id, repId)).limit(1);
  if (rep?.code) return rep.code;
  return assignWholesaleCode(repId, { onlyIfMissing: true });
}

/** A new code (the old one stops working). Retries on the rare collision. */
export async function assignWholesaleCode(repId: number, opts: { onlyIfMissing?: boolean } = {}): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateWholesaleCode((n) => randomBytes(n));
    try {
      const where = opts.onlyIfMissing ? and(eq(salesReps.id, repId), isNull(salesReps.wholesaleCode)) : eq(salesReps.id, repId);
      const [updated] = await db.update(salesReps).set({ wholesaleCode: code, updatedAt: new Date() }).where(where).returning({ code: salesReps.wholesaleCode });
      if (updated?.code) return updated.code;
      // Someone else filled it in between the read and the write.
      const [current] = await db.select({ code: salesReps.wholesaleCode }).from(salesReps).where(eq(salesReps.id, repId)).limit(1);
      if (current?.code) return current.code;
      throw new Error(`Rep ${repId} not found`);
    } catch (err) {
      if ((err as { code?: string; cause?: { code?: string } })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505") continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique wholesale code");
}

export type WholesaleVerdict =
  | { valid: true; reseller: { id: number; name: string } }
  // `own_distribution`: the buyer's partner handles its own orders (organizations.distribution), so the store is not theirs.
  | { valid: false; reason: "unknown" | "inactive" | "own_distribution" };

/** Whether a code may buy at wholesale right now. */
export async function verifyWholesaleCode(input: string): Promise<WholesaleVerdict> {
  const code = normalizeWholesaleCode(input);
  if (!code) return { valid: false, reason: "unknown" };
  const [rep] = await db.select().from(salesReps).where(eq(salesReps.wholesaleCode, code)).limit(1);
  if (!rep) return { valid: false, reason: "unknown" };
  if (accessDenial(rep)) return { valid: false, reason: "inactive" };
  // The code buys Tags kits: a rep whose Tags module was switched off keeps the code row but may not use
  // it. "inactive" is the reason Stuscle already handles; a new one could break its side.
  if (!repModules(rep).includes("tags")) return { valid: false, reason: "inactive" };
  // Orders of people whose partner distributes on its own are not Stuscle's to take, nor ours to fulfil (server/tags/distribution.ts).
  if (!ordersReachXpot((await distributionForRep(rep.id)).path)) return { valid: false, reason: "own_distribution" };
  return { valid: true, reseller: { id: rep.id, name: rep.displayName } };
}

function secretMatches(req: Request): boolean {
  const secret = process.env.XPOT_WHOLESALE_SECRET ?? "";
  const header = req.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return secret.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

const verifySchema = z.object({ code: z.string().max(40) }).strict();

type StoreAccess =
  | { ok: true; repId: number; storeOpen: true }
  | { ok: true; repId: number; storeOpen: false; partner: string | null }
  | { ok: false; status: 401 | 403; body: unknown };

/**
 * Whether the signed-in person may buy at wholesale, the one check behind the card and the open route: an active rep
 * with Tags (managers always have it), and a store only when their partner does not handle its own distribution.
 */
async function storeAccess(req: Request): Promise<StoreAccess> {
  const actor = await ensureXpotRep(req);
  if (!actor) return { ok: false, status: 401, body: { message: "Authentication required" } };
  const denial = accessDenial(actor.rep);
  if (denial) return { ok: false, status: 403, body: denial };
  // The code buys Tags kits at wholesale: only for reps who sell Tags (managers always do).
  if (!isPlatformAdmin(actor) && !repModules(actor.rep).includes("tags")) {
    return { ok: false, status: 403, body: { message: "Tags are not enabled for your account." } };
  }
  // People whose partner handles its own distribution have no store: their pieces come from the partner.
  const distribution = await distributionForRep(actor.rep.id);
  if (!ordersReachXpot(distribution.path)) return { ok: true, repId: actor.rep.id, storeOpen: false, partner: distribution.partner?.name ?? null };
  return { ok: true, repId: actor.rep.id, storeOpen: true };
}

/** A browser navigating here (the button opened a tab), rather than the app's fetch: it gets pages, not JSON. */
function isNavigation(req: Request): boolean {
  return req.get("sec-fetch-mode") === "navigate" || req.accepts(["json", "html"]) === "html";
}

export function registerWholesaleRoutes(app: Express) {
  // Stuscle → Xpot: is this code good for wholesale?
  app.post("/api/integrations/stuscle/wholesale/verify", async (req: Request, res: Response) => {
    if (!process.env.XPOT_WHOLESALE_SECRET) return res.status(503).json({ message: "Wholesale is not configured" });
    if (rateLimit(`wholesale-verify:${normalizeIpKey(req.ip)}`, { limit: 120, windowMs: 60_000 })) {
      return res.status(429).json({ message: "Too many requests" });
    }
    if (!secretMatches(req)) return res.status(401).json({ message: "Unauthorized" });
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    try {
      res.set("Cache-Control", "no-store");
      res.json(await verifyWholesaleCode(parsed.data.code));
    } catch (err) {
      console.error("[wholesale] verify", err);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Stuscle → Xpot: a paid wholesale order becomes the partner's cost basis.
  // Physical codes may arrive now or be fulfilled later by an admin.
  app.post("/api/integrations/stuscle/wholesale/orders", async (req: Request, res: Response) => {
    if (!process.env.XPOT_WHOLESALE_SECRET) return res.status(503).json({ message: "Wholesale is not configured" });
    if (!secretMatches(req)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const input = stuscleWholesaleOrderSchema.parse(req.body);
      const verdict = await verifyWholesaleCode(input.wholesaleCode);
      if (!verdict.valid) return res.status(403).json({ code: `wholesale_${verdict.reason}`, message: "Wholesale code is not active" });
      const result = await recordStuscleOrder(input, verdict.reseller.id);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ code: "validation_error", message: err.issues[0]?.message ?? "Invalid input", details: err.errors });
      if (err instanceof TagSaleError) return res.status(err.status).json({ code: err.code, message: err.message });
      console.error("[wholesale] order", err);
      res.status(500).json({ message: "Order import failed" });
    }
  });

  // The signed-in rep's own code (shown, never in a link) and the store link: Xpot's open route (Tags home → "Buy kits").
  app.get("/api/xpot/wholesale", async (req: Request, res: Response) => {
    try {
      const access = await storeAccess(req);
      if (!access.ok) return res.status(access.status).json(access.body);
      if (!access.storeOpen) return res.json({ code: null, url: null, partner: access.partner });
      const code = await ensureWholesaleCode(access.repId);
      res.json({ code: formatWholesaleCode(code), url: wholesaleUrl() });
    } catch (err) {
      console.error("[wholesale] code", err);
      res.status(500).json({ message: "Failed to load your wholesale code" });
    }
  });

  // A click in the Shop → the store, signed in as this rep. Mints a two-minute, single-use ticket for the signed-in
  // rep's own code (never one from the query) and 303s to Stuscle's /wholesale/kit with it. ?items=SKU:qty,…
  // fills the cart, ?product=<handle> lands on that product, ?lang= is Stuscle's language name. A link copied out of
  // the app is worth nothing to anyone else: they are asked to sign in, and then it opens their own code or nothing.
  app.get(WHOLESALE_OPEN_PATH, async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    if (rateLimit(`wholesale-open:ip:${normalizeIpKey(req.ip)}`, { limit: 120, windowMs: 60_000 })) {
      return res.status(429).json({ message: "Too many requests" });
    }
    // Another site bouncing a signed-in rep through here: the click must come from Xpot (or be typed in).
    if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ message: "Open the store from Xpot's Shop" });
    const secret = wholesaleHandoffSecret();
    if (!secret) return res.status(503).json({ message: "Wholesale is not configured" });
    const target = parseHandoffQuery(req.query as Record<string, unknown>);
    if (!target) return res.status(400).json({ message: "Invalid input" });
    try {
      const access = await storeAccess(req);
      if (!access.ok) {
        // The tab the button opened, signed out: through sign-in and back here, as /oauth/authorize does.
        if (access.status === 401 && isNavigation(req)) return res.redirect(303, `/?signin=1&next=${encodeURIComponent(req.originalUrl)}`);
        return res.status(access.status).json(access.body);
      }
      if (!access.storeOpen) return res.status(403).json({ code: "own_distribution", message: "Your pieces come from your partner", partner: access.partner });
      if (rateLimit(`wholesale-open:rep:${access.repId}`, { limit: 30, windowMs: 60_000 })) {
        return res.status(429).json({ message: "Too many requests" });
      }
      const ticket = signWholesaleHandoff({ code: await ensureWholesaleCode(access.repId), ...target }, secret);
      res.redirect(303, `${storeBaseUrl().replace(/\/+$/, "")}/wholesale/kit?ticket=${encodeURIComponent(ticket)}`);
    } catch (err) {
      console.error("[wholesale] open", err);
      res.status(500).json({ message: "Could not open the store" });
    }
  });

  // Admin: issue a new code (the old one stops working), e.g. when one leaked.
  app.post("/api/xpot/admin/reps/:id/wholesale-code", requirePlatformAdmin, async (req: Request, res: Response) => {
    const repId = Number(req.params.id);
    if (!Number.isInteger(repId) || repId <= 0) return res.status(400).json({ message: "Invalid rep id" });
    try {
      const [target] = await db.select().from(salesReps).where(eq(salesReps.id, repId)).limit(1);
      if (!target) return res.status(404).json({ message: "Rep not found" });
      if (!repModules(target).includes("tags")) return res.status(400).json({ message: "This person does not sell Tags" });
      const code = await assignWholesaleCode(repId);
      res.json({ code: formatWholesaleCode(code) });
    } catch (err) {
      console.error("[wholesale] regenerate", err);
      res.status(500).json({ message: "Could not issue a new code" });
    }
  });
}
