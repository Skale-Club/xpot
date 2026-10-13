import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db.js";
import { salesDailyRoutes, salesRouteGenerationAttempts } from "#shared/schema.js";
import {
  xpotDailyRouteCreateSchema,
  xpotDailyRouteRegenerateSchema,
  xpotDailyRouteStopUpdateSchema,
  xpotPushSubscriptionSchema,
} from "#shared/xpot.js";
import { organizationIdForRep } from "../../organizations/service.js";
import {
  generateDailyRoute,
  getDailyRoute,
  getDailyRouteBundle,
  listNotifications,
  markNotificationRead,
  regenerateDailyRoute,
  resumeDailyRouteGeneration,
  updateRouteStop,
} from "../../daily-routes.js";
import { dailyRouteDate } from "#shared/daily-route.js";
import { ensureXpotRep, requireSuperAdmin, requireXpotUser } from "./middleware.js";
import { pushPublicKey, savePushSubscription } from "../../push-notifications.js";

export function createDailyRoutesRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/daily-route/today", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const { routeDate } = dailyRouteDate(new Date(), process.env.XPOT_OPERATION_TIMEZONE);
    const organizationId = await organizationIdForRep(actor.rep.id);
    const route = await getDailyRoute(actor.rep.id, organizationId, routeDate);
    if (route) resumeDailyRouteGeneration(route);
    res.json(await getDailyRouteBundle(route));
  });

  router.post("/daily-route", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = xpotDailyRouteCreateSchema.parse(req.body);
    const operationalDay = dailyRouteDate(new Date(), process.env.XPOT_OPERATION_TIMEZONE);
    const organizationId = await organizationIdForRep(actor.rep.id);
    const existing = await getDailyRoute(actor.rep.id, organizationId, operationalDay.routeDate);
    if (existing) return res.status(409).json({ code: "daily_route_exists", ...(await getDailyRouteBundle(existing)) });

    const estimatedReadyAt = new Date(Date.now() + 60_000);
    const result = await db.transaction(async (tx) => {
      const [created] = await tx.insert(salesDailyRoutes).values({
        organizationId,
        repId: actor.rep.id,
        routeDate: operationalDay.routeDate,
        timezone: operationalDay.timezone,
        industry: input.industry,
        city: input.city,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        status: "queued",
        generationStage: "queued",
        estimatedReadyAt,
        idempotencyKey: input.idempotencyKey,
      }).onConflictDoNothing({
        target: [salesDailyRoutes.repId, salesDailyRoutes.routeDate],
      }).returning();
      if (!created) {
        const [concurrent] = await tx.select().from(salesDailyRoutes).where(and(
          eq(salesDailyRoutes.repId, actor.rep.id),
          eq(salesDailyRoutes.routeDate, operationalDay.routeDate),
        ));
        return { route: concurrent, existed: true };
      }
      await tx.insert(salesRouteGenerationAttempts).values({
        routeId: created.id,
        version: created.version,
        idempotencyKey: input.idempotencyKey,
        initiatedByUserId: actor.user.userId,
        status: "queued",
      });
      return { route: created, existed: false };
    });

    if (!result.route) return res.status(409).json({ code: "daily_route_exists", message: "A route already exists for today" });
    if (result.existed) return res.status(409).json({ code: "daily_route_exists", ...(await getDailyRouteBundle(result.route)) });

    setImmediate(() => void generateDailyRoute(result.route.id));
    res.status(202).json(await getDailyRouteBundle(result.route));
  });

  router.post("/daily-route/:id/retry", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = Number(req.params.id);
    const [route] = await db.select().from(salesDailyRoutes).where(and(
      eq(salesDailyRoutes.id, routeId),
      eq(salesDailyRoutes.repId, actor.rep.id),
    ));
    if (!route) return res.status(404).json({ message: "Route not found" });
    if (route.status !== "failed") return res.status(409).json({ code: "route_not_failed", message: "Only a failed route can be retried" });
    await db.update(salesDailyRoutes).set({
      status: "queued",
      generationStage: "queued",
      errorMessage: null,
      estimatedReadyAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    }).where(eq(salesDailyRoutes.id, route.id));
    await db.update(salesRouteGenerationAttempts).set({
      status: "queued",
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }).where(and(
      eq(salesRouteGenerationAttempts.routeId, route.id),
      eq(salesRouteGenerationAttempts.version, route.version),
    ));
    setImmediate(() => void generateDailyRoute(route.id));
    res.status(202).json(await getDailyRouteBundle({ ...route, status: "queued", generationStage: "queued", errorMessage: null }));
  });

  router.patch("/daily-route/stops/:id", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const stopId = Number(req.params.id);
    if (!Number.isFinite(stopId) || stopId <= 0) return res.status(400).json({ message: "Invalid stop id" });
    const input = xpotDailyRouteStopUpdateSchema.parse(req.body);
    const updated = await updateRouteStop(actor.rep.id, stopId, input);
    if (!updated) return res.status(404).json({ message: "Route stop not found" });
    res.json(updated);
  });

  router.post("/daily-route/:id/regenerate", requireSuperAdmin, async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const routeId = Number(req.params.id);
    const input = xpotDailyRouteRegenerateSchema.parse(req.body);
    const [route] = await db.select().from(salesDailyRoutes).where(eq(salesDailyRoutes.id, routeId));
    if (!route) return res.status(404).json({ message: "Route not found" });
    const updated = await regenerateDailyRoute(route, actor.user.userId, input.reason, input.idempotencyKey);
    res.status(202).json(await getDailyRouteBundle(updated));
  });

  router.get("/notifications", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    res.json(await listNotifications(actor.rep.id));
  });

  router.get("/notifications/push/public-key", (_req, res) => {
    res.json({ publicKey: pushPublicKey() });
  });

  router.post("/notifications/push/subscribe", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const input = xpotPushSubscriptionSchema.parse(req.body);
    const subscription = await savePushSubscription(actor.rep.id, input, req.get("user-agent"));
    res.status(201).json(subscription);
  });

  router.post("/notifications/:id/read", async (req, res) => {
    const actor = (req as any).xpotActor as NonNullable<Awaited<ReturnType<typeof ensureXpotRep>>>;
    const updated = await markNotificationRead(actor.rep.id, Number(req.params.id));
    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json(updated);
  });

  return router;
}
