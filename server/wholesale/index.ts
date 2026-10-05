import { randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { salesReps } from "#shared/schema.js";
import { formatWholesaleCode, generateWholesaleCode, normalizeWholesaleCode, wholesaleUrl } from "#shared/wholesale.js";
import { normalizeIpKey, rateLimit } from "../tags/rateLimit.js";
import { accessDenial, ensureXpotRep, isManagerOrAdmin, requireXpotManager } from "../routes/xpot/middleware.js";
import { repModules } from "#shared/modules.js";

// Wholesale prices live in the Stuscle store; Xpot decides who gets them.
// Every approved rep has a personal code. Stuscle asks Xpot whether a code is
// good (server to server, shared secret) when the reseller enters it and again
// at checkout, so blocking someone here closes wholesale there at once.
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
  | { valid: false; reason: "unknown" | "inactive" };

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

  // The signed-in rep's own code and store link (Tags home → "Buy kits").
  app.get("/api/xpot/wholesale", async (req: Request, res: Response) => {
    try {
      const actor = await ensureXpotRep(req);
      if (!actor) return res.status(401).json({ message: "Authentication required" });
      const denial = accessDenial(actor.rep);
      if (denial) return res.status(403).json(denial);
      // The code buys Tags kits at wholesale: only for reps who sell Tags (managers always do).
      if (!isManagerOrAdmin(actor) && !repModules(actor.rep).includes("tags")) {
        return res.status(403).json({ message: "Tags are not enabled for your account." });
      }
      const code = await ensureWholesaleCode(actor.rep.id);
      res.json({ code: formatWholesaleCode(code), url: wholesaleUrl(storeBaseUrl(), code) });
    } catch (err) {
      console.error("[wholesale] code", err);
      res.status(500).json({ message: "Failed to load your wholesale code" });
    }
  });

  // Admin: issue a new code (the old one stops working), e.g. when one leaked.
  app.post("/api/xpot/admin/reps/:id/wholesale-code", requireXpotManager, async (req: Request, res: Response) => {
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
