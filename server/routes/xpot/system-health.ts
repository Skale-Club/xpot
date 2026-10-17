import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { db } from "../../db.js";
import { salesReps, systemEvents } from "#shared/schema.js";
import type { SystemEventRow } from "#shared/system-health.js";
import { getCurrentSessionUser, requireSuperAdmin, requireXpotManager } from "./middleware.js";
import { systemHealthSnapshot } from "../../observability/health.js";
import { recordSystemEvent } from "../../observability/events.js";
import { rateLimit } from "../../tags/rateLimit.js";
import { storage } from "../../storage.js";

const eventsQuery = z.object({
  source: z.string().trim().max(60).optional(),
  level: z.enum(["error", "warn"]).optional(),
  fingerprint: z.string().trim().regex(/^[0-9a-f]{16}$/).optional(),
  q: z.string().trim().max(200).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(4000).optional(),
  kind: z.enum(["error", "unhandledrejection", "render"]),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(400).optional(),
});

/** Admin › System health: the app's own errors and whether the prospecting pipeline is moving. */
export function createSystemHealthRouter() {
  const router = Router();
  router.use("/admin/system-health", requireXpotManager, requireSuperAdmin);
  router.use("/admin/system-events", requireXpotManager, requireSuperAdmin);

  router.get("/admin/system-health", async (_req, res) => {
    res.set("Cache-Control", "no-store").json(await systemHealthSnapshot());
  });

  router.get("/admin/system-events", async (req, res) => {
    const query = eventsQuery.parse(req.query);
    const where: SQL[] = [];
    if (query.source) where.push(eq(systemEvents.source, query.source));
    if (query.level) where.push(eq(systemEvents.level, query.level));
    if (query.fingerprint) where.push(eq(systemEvents.fingerprint, query.fingerprint));
    if (query.before) where.push(lt(systemEvents.id, query.before));
    if (query.q) {
      const like = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      where.push(or(ilike(systemEvents.message, like), ilike(systemEvents.detail, like))!);
    }
    const rows = await db.select({ event: systemEvents, repName: salesReps.displayName })
      .from(systemEvents)
      .leftJoin(salesReps, eq(salesReps.id, systemEvents.repId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(systemEvents.id))
      .limit(query.limit);
    const events: SystemEventRow[] = rows.map(({ event, repName }) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
      repName: repName ?? null,
    }));
    res.set("Cache-Control", "no-store").json({ events, nextBefore: events.length === query.limit ? events[events.length - 1].id : null });
  });

  // The browser's own crashes. Signed-in people only, and throttled: the page can loop.
  router.post("/client-errors", async (req, res) => {
    const user = await getCurrentSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    if (rateLimit(`client-errors:${user.userId}`, { limit: 30, windowMs: 10 * 60_000 })) {
      return res.status(429).json({ message: "Too many reports" });
    }
    const input = clientErrorSchema.parse(req.body);
    const rep = await storage.getSalesRepByUserId(user.userId);
    await recordSystemEvent({
      source: "client",
      message: input.message,
      repId: rep?.id ?? null,
      context: {
        kind: input.kind,
        url: input.url ?? null,
        userAgent: input.userAgent ?? req.get("user-agent")?.slice(0, 400) ?? null,
        ...(input.componentStack ? { componentStack: input.componentStack } : {}),
      },
      error: input.stack ? Object.assign(new Error(input.message), { stack: input.stack }) : undefined,
    });
    res.status(204).end();
  });

  return router;
}
