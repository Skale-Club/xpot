import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db.js";
import { prospectingRuns, salesReps, systemEvents, type SystemEvent } from "#shared/schema.js";
import type { SystemEventDetail, SystemEventRow } from "#shared/system-health.js";
import { getCurrentSessionUser, requireSuperAdmin, requireXpotManager } from "./middleware.js";
import { systemHealthSnapshot, toRecentRun } from "../../observability/health.js";
import { recordSystemEvent } from "../../observability/events.js";
import { rateLimit } from "../../tags/rateLimit.js";
import { storage } from "../../storage.js";

const eventsQuery = z.object({
  source: z.string().trim().max(60).optional(),
  level: z.enum(["error", "warn"]).optional(),
  fingerprint: z.string().trim().regex(/^[0-9a-f]{16}$/).optional(),
  /** Events about one engine search (context.runId), from the timeline. */
  runId: z.coerce.number().int().positive().optional(),
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
    if (query.runId) where.push(sql`(${systemEvents.context}->>'runId')::int = ${query.runId}`);
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
    const events = rows.map(({ event, repName }) => toEventRow(event, repName));
    res.set("Cache-Control", "no-store").json({ events, nextBefore: events.length === query.limit ? events[events.length - 1].id : null });
  });

  router.get("/admin/system-events/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid event id" });
    const [row] = await db.select({ event: systemEvents, repName: salesReps.displayName })
      .from(systemEvents).leftJoin(salesReps, eq(salesReps.id, systemEvents.repId))
      .where(eq(systemEvents.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "Event not found" });
    const { event } = row;
    const runId = Number(event.context?.runId);
    const [group, occurrences, run] = await Promise.all([
      db.select({
        count: sql<number>`(count(*) + coalesce(sum((${systemEvents.context}->>'repeatsSinceLastRow')::int), 0))::int`,
        firstSeenAt: sql<Date>`min(${systemEvents.createdAt})`,
        lastSeenAt: sql<Date>`max(${systemEvents.createdAt})`,
      }).from(systemEvents).where(eq(systemEvents.fingerprint, event.fingerprint)),
      db.select({
        id: systemEvents.id,
        createdAt: systemEvents.createdAt,
        repName: salesReps.displayName,
        repeats: sql<number>`coalesce((${systemEvents.context}->>'repeatsSinceLastRow')::int, 0)`,
      }).from(systemEvents).leftJoin(salesReps, eq(salesReps.id, systemEvents.repId))
        .where(eq(systemEvents.fingerprint, event.fingerprint))
        .orderBy(desc(systemEvents.id)).limit(20),
      Number.isInteger(runId) && runId > 0
        ? db.select({ run: prospectingRuns, repName: salesReps.displayName }).from(prospectingRuns)
          .leftJoin(salesReps, eq(salesReps.id, prospectingRuns.repId))
          .where(eq(prospectingRuns.id, runId)).limit(1)
        : Promise.resolve([]),
    ]);
    const detail: SystemEventDetail = {
      event: toEventRow(event, row.repName),
      group: {
        count: group[0]?.count ?? 1,
        firstSeenAt: new Date(group[0]?.firstSeenAt ?? event.createdAt).toISOString(),
        lastSeenAt: new Date(group[0]?.lastSeenAt ?? event.createdAt).toISOString(),
      },
      occurrences: occurrences.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), repName: item.repName ?? null })),
      run: run[0] ? toRecentRun(run[0].run, run[0].repName ?? null) : null,
    };
    res.set("Cache-Control", "no-store").json(detail);
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

function toEventRow(event: SystemEvent, repName: string | null): SystemEventRow {
  return { ...event, createdAt: event.createdAt.toISOString(), repName: repName ?? null };
}
