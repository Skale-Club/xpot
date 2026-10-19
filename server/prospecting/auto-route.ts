import { and, asc, desc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingJobs,
  prospectingRoutes,
  prospectingRouteStops,
  salesVisits,
  type ProspectingJob,
} from "#shared/schema.js";
import type { RouteCandidate } from "./route-optimizer.js";
import { optimizeRouteWithGoogle } from "./google-route-optimizer.js";
import { openWindowsOn, secondsUntilDayEnd } from "./opening-hours.js";
import { sendPushNotification } from "../push-notifications.js";
import { publishProspectingRouteForRep } from "./route-publisher.js";
import { MAX_DAILY_PROSPECTING_SESSIONS } from "#shared/prospecting.js";
import { recordSystemEvent, reportSystemEvent } from "../observability/events.js";

const RECENT_JOB_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_BUILD_MS = 15 * 60 * 1000;

class NoAutomaticRouteCandidatesError extends Error {}
class NoAutomaticRouteStopsError extends Error {}
class DailyRouteLimitError extends Error {}

function utcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function routeDateForJob(job: ProspectingJob) {
  const configured = typeof job.filters?.routeDate === "string" ? job.filters.routeDate : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : utcDateKey(job.completedAt ?? job.createdAt);
}

/**
 * Older automatic routes stored the drive from the rep's live position as the
 * first route leg. Keep the current-location marker, but remove that leg from
 * the work schedule and route line, including already-planned visits.
 */
async function repairPublishedAutomaticRouteFirstLeg() {
  return db.transaction(async (tx) => {
    const today = utcDateKey(new Date());
    const [route] = await tx.select().from(prospectingRoutes).where(and(
      isNotNull(prospectingRoutes.jobId),
      eq(prospectingRoutes.status, "published"),
      sql`${prospectingRoutes.routeDate} >= ${today}`,
      sql`exists (
        select 1 from ${prospectingRouteStops}
        where ${prospectingRouteStops.routeId} = ${prospectingRoutes.id}
          and ${prospectingRouteStops.position} = 1
          and ${prospectingRouteStops.travelDurationSeconds} > 0
      )`,
    )).orderBy(desc(prospectingRoutes.routeDate), desc(prospectingRoutes.id))
      .limit(1).for("update", { skipLocked: true });
    if (!route) return null;

    const stops = await tx.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));
    const first = stops[0];
    const removedSeconds = first?.travelDurationSeconds ?? 0;
    if (!first || removedSeconds <= 0) return null;

    const visitIds = stops.flatMap((stop) => stop.visitId ? [stop.visitId] : []);
    const visits = visitIds.length
      ? await tx.select({ id: salesVisits.id, status: salesVisits.status }).from(salesVisits)
          .where(and(inArray(salesVisits.id, visitIds), eq(salesVisits.repId, route.repId)))
      : [];
    const canRebuild = stops.every((stop) => stop.status === "planned")
      && visits.length === visitIds.length
      && visits.every((visit) => visit.status === "planned");
    if (canRebuild && route.jobId) {
      const candidateIds = stops.flatMap((stop) => stop.candidateId ? [stop.candidateId] : []);
      await tx.delete(prospectingRoutes).where(eq(prospectingRoutes.id, route.id));
      if (visitIds.length) await tx.delete(salesVisits).where(inArray(salesVisits.id, visitIds));
      if (candidateIds.length) {
        await tx.update(prospectingCandidates).set({ status: "discovered", updatedAt: new Date() })
          .where(inArray(prospectingCandidates.id, candidateIds));
      }
      await tx.update(prospectingJobs).set({
        routePlanningStatus: "pending",
        routeErrorMessage: null,
        updatedAt: new Date(),
      }).where(eq(prospectingJobs.id, route.jobId));
      return route.id;
    }

    const now = new Date();
    for (const stop of stops) {
      const estimatedArrivalAt = stop.estimatedArrivalAt
        ? new Date(new Date(stop.estimatedArrivalAt).getTime() - removedSeconds * 1000)
        : null;
      await tx.update(prospectingRouteStops).set({
        ...(stop.id === first.id ? { travelDistanceMeters: 0, travelDurationSeconds: 0 } : {}),
        estimatedArrivalAt,
        updatedAt: now,
      }).where(eq(prospectingRouteStops.id, stop.id));
      if (stop.visitId && estimatedArrivalAt) {
        await tx.update(salesVisits).set({ scheduledAt: estimatedArrivalAt, updatedAt: now })
          .where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.repId, route.repId)));
      }
    }

    const optimizationMeta = { ...(route.optimizationMeta ?? {}) } as Record<string, unknown>;
    delete optimizationMeta.encodedPolyline;
    Object.assign(optimizationMeta, {
      excludesTravelToFirstVisit: true,
      automaticOrigin: "first_visit",
      legacyFirstLegRemoved: true,
    });
    await tx.update(prospectingRoutes).set({
      startAddress: first.address,
      startLat: first.lat,
      startLng: first.lng,
      totalDistanceMeters: Math.max(0, route.totalDistanceMeters - first.travelDistanceMeters),
      totalDurationSeconds: Math.max(0, route.totalDurationSeconds - removedSeconds),
      plannedEndAt: route.plannedEndAt
        ? new Date(new Date(route.plannedEndAt).getTime() - removedSeconds * 1000)
        : null,
      optimizationMeta,
      updatedAt: now,
    }).where(eq(prospectingRoutes.id, route.id));
    return route.id;
  });
}

async function claimNextCompletedJob() {
  return db.transaction(async (tx) => {
    const staleBefore = new Date(Date.now() - STALE_BUILD_MS);
    // Recover routes created by the older workflow, which marked planning as
    // ready but left the route in draft waiting for a manual "Use this route".
    await tx.update(prospectingJobs).set({
      routePlanningStatus: "pending",
      routeErrorMessage: null,
      updatedAt: new Date(),
    }).where(and(
      eq(prospectingJobs.status, "completed"),
      eq(prospectingJobs.routePlanningStatus, "ready"),
      sql`exists (
        select 1 from ${prospectingRoutes}
        where ${prospectingRoutes.jobId} = ${prospectingJobs.id}
          and ${prospectingRoutes.status} = 'draft'
      )`,
    ));
    await tx.update(prospectingJobs).set({
      routePlanningStatus: "pending",
      routeErrorMessage: "Route planning was interrupted and has been queued again.",
      updatedAt: new Date(),
    }).where(and(
      eq(prospectingJobs.status, "completed"),
      eq(prospectingJobs.routePlanningStatus, "building"),
      sql`${prospectingJobs.updatedAt} < ${staleBefore}`,
    ));

    const [job] = await tx.select().from(prospectingJobs).where(and(
      eq(prospectingJobs.status, "completed"),
      eq(prospectingJobs.routePlanningStatus, "pending"),
      or(
        sql`${prospectingJobs.completedAt} >= ${new Date(Date.now() - RECENT_JOB_WINDOW_MS)}`,
        sql`${prospectingJobs.createdAt} >= ${new Date(Date.now() - RECENT_JOB_WINDOW_MS)}`,
      ),
    )).orderBy(asc(prospectingJobs.completedAt), asc(prospectingJobs.id)).limit(1).for("update", { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx.update(prospectingJobs).set({
      routePlanningStatus: "building",
      routeErrorMessage: null,
      updatedAt: new Date(),
    }).where(and(
      eq(prospectingJobs.id, job.id),
      eq(prospectingJobs.routePlanningStatus, "pending"),
    )).returning();
    return claimed ?? null;
  });
}

async function buildAutomaticRoute(job: ProspectingJob) {
  const routeDate = routeDateForJob(job);
  const dailyRoutes = await db.select().from(prospectingRoutes).where(and(
    eq(prospectingRoutes.repId, job.repId),
    eq(prospectingRoutes.routeDate, routeDate),
  )).orderBy(desc(prospectingRoutes.createdAt));
  const activeRoute = dailyRoutes.find((route) => ["draft", "published", "in_progress"].includes(route.status));
  if (activeRoute) return { route: activeRoute, reused: true as const };
  if (dailyRoutes.length >= MAX_DAILY_PROSPECTING_SESSIONS) throw new DailyRouteLimitError();

  const discovered = await db.select({
      id: prospectingCandidates.id,
      leadId: prospectingCandidates.leadId,
      status: prospectingCandidates.status,
      googlePlaceId: prospectingCandidates.googlePlaceId,
      name: prospectingCandidates.name,
      address: prospectingCandidates.address,
      lat: prospectingCandidates.lat,
      lng: prospectingCandidates.lng,
      score: prospectingCandidates.score,
      scoreReasons: prospectingCandidates.scoreReasons,
      openHours: sql<string | null>`${prospectingCandidates.rawPayload}->>'open_hours'`,
      timeZone: sql<string | null>`${prospectingCandidates.rawPayload}->>'timezone'`,
    }).from(prospectingCandidates).where(and(
      eq(prospectingCandidates.jobId, job.id),
      eq(prospectingCandidates.repId, job.repId),
      notInArray(prospectingCandidates.status, ["discarded", "visited"]),
    )).orderBy(sql`${prospectingCandidates.score} desc`, asc(prospectingCandidates.id));

  const plannedStartAt = new Date();
  const missingCoordinates: number[] = [];
  const seenLeadIds = new Set<number>();
  const seenPlaceIds = new Set<string>();
  const candidates: RouteCandidate[] = [];
  for (const candidate of discovered) {
    if (candidate.leadId && seenLeadIds.has(candidate.leadId)) continue;
    if (candidate.googlePlaceId && seenPlaceIds.has(candidate.googlePlaceId)) continue;
    const lat = candidate.lat == null ? NaN : Number(candidate.lat);
    const lng = candidate.lng == null ? NaN : Number(candidate.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      missingCoordinates.push(candidate.id);
      continue;
    }
    candidates.push({
      id: -candidate.id,
      leadId: candidate.leadId,
      candidateId: candidate.id,
      name: candidate.name,
      address: candidate.address,
      lat,
      lng,
      score: candidate.score,
      scoreReasons: candidate.scoreReasons,
      serviceDurationSeconds: job.defaultVisitMinutes * 60,
      openWindows: openWindowsOn(candidate, plannedStartAt),
    });
    if (candidate.leadId) seenLeadIds.add(candidate.leadId);
    if (candidate.googlePlaceId) seenPlaceIds.add(candidate.googlePlaceId);
  }
  if (!candidates.length) throw new NoAutomaticRouteCandidatesError();
  // Same-day routes end by 10 PM where the businesses are.
  const dayLeftSeconds = secondsUntilDayEnd(discovered.find((candidate) => candidate.timeZone)?.timeZone, plannedStartAt);
  const shiftDurationSeconds = Math.min(job.shiftDurationMinutes * 60, dayLeftSeconds ?? Infinity);
  return db.transaction(async (tx) => {
    // Keep the paid optimizer idempotent across workers and browser retries.
    await tx.execute(sql`select pg_advisory_xact_lock(${job.repId}, hashtext(${routeDate}))`);
    const lockedRoutes = await tx.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.repId, job.repId),
      eq(prospectingRoutes.routeDate, routeDate),
    )).orderBy(desc(prospectingRoutes.createdAt));
    const lockedActiveRoute = lockedRoutes.find((route) => ["draft", "published", "in_progress"].includes(route.status));
    if (lockedActiveRoute) return { route: lockedActiveRoute, reused: true as const };
    if (lockedRoutes.length >= MAX_DAILY_PROSPECTING_SESSIONS) throw new DailyRouteLimitError();

    const optimized = await optimizeRouteWithGoogle({
      plannedStartAt,
      shiftDurationSeconds,
      maxStops: 60,
      candidates,
    });
    if (!optimized.stops.length) throw new NoAutomaticRouteStopsError();
    const routeStart = optimized.stops[0];

    const [route] = await tx.insert(prospectingRoutes).values({
      repId: job.repId,
      jobId: job.id,
      name: `Route — ${routeDate}`,
      routeDate,
      plannedStartAt,
      plannedEndAt: new Date(plannedStartAt.getTime() + optimized.totalDurationSeconds * 1000),
      startAddress: routeStart.address ?? null,
      startLat: String(routeStart.lat),
      startLng: String(routeStart.lng),
      maxStops: 60,
      defaultVisitMinutes: job.defaultVisitMinutes,
      optimizer: optimized.optimizer,
      totalDistanceMeters: optimized.totalDistanceMeters,
      totalDurationSeconds: optimized.totalDurationSeconds,
      optimizationMeta: {
        shiftDurationMinutes: job.shiftDurationMinutes,
        returnHome: false,
        automaticOrigin: "first_visit",
        excludesTravelToFirstVisit: true,
        missingCoordinates,
        excludedByBudget: optimized.excludedCandidateIds,
        distanceModel: optimized.optimizer === "google_route_optimization_v1" ? "google_road_network" : "haversine",
        trafficAware: optimized.trafficAware ?? false,
        encodedPolyline: optimized.encodedPolyline,
      },
    }).returning();
    await tx.insert(prospectingRouteStops).values(optimized.stops.map((stop) => ({
      routeId: route.id,
      candidateId: stop.candidateId ?? null,
      leadId: stop.leadId,
      position: stop.position,
      name: stop.name,
      address: stop.address,
      lat: String(stop.lat),
      lng: String(stop.lng),
      score: stop.score,
      scoreReasons: stop.scoreReasons,
      serviceDurationSeconds: stop.serviceDurationSeconds,
      travelDistanceMeters: stop.travelDistanceMeters,
      travelDurationSeconds: stop.travelDurationSeconds,
      estimatedArrivalAt: stop.estimatedArrivalAt,
    }))).returning();
    return { route, reused: false as const };
  });
}

/** Builds at most one route per queue tick so discovery work remains responsive. */
export async function processNextAutomaticRoute() {
  await repairPublishedAutomaticRouteFirstLeg();
  const job = await claimNextCompletedJob();
  if (!job) return null;
  try {
    const result = await buildAutomaticRoute(job);
    const publishedRoute = await publishProspectingRouteForRep(result.route.id, job.repId);
    if (!publishedRoute) throw new Error("The automatic route disappeared before it could be published.");
    await db.update(prospectingJobs).set({
      routePlanningStatus: "ready",
      routeErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(prospectingJobs.id, job.id));
    void sendPushNotification(job.repId, {
      title: "Today's route is ready",
      body: "Xpot selected the best opportunities and optimized their visit order.",
      href: `/route?routeId=${publishedRoute.id}`,
    }).catch((error) => reportSystemEvent({ level: "warn", source: "push", message: "Route-ready push delivery failed.", error, repId: job.repId, context: { jobId: job.id } }));
    return { ...result, route: publishedRoute };
  } catch (error) {
    const message = error instanceof NoAutomaticRouteCandidatesError
      ? "No eligible business has usable coordinates for an automatic route."
      : error instanceof NoAutomaticRouteStopsError
        ? "No eligible business fits in today's route window."
        : error instanceof DailyRouteLimitError
          ? `The daily limit of ${MAX_DAILY_PROSPECTING_SESSIONS} routes has been reached.`
        : error instanceof Error ? error.message : "The automatic route could not be built.";
    await db.update(prospectingJobs).set({
      routePlanningStatus: "failed",
      routeErrorMessage: message.slice(0, 2000),
      updatedAt: new Date(),
    }).where(eq(prospectingJobs.id, job.id));
    // No candidates / no room / daily limit are outcomes the rep sees, not faults.
    const expected = error instanceof NoAutomaticRouteCandidatesError
      || error instanceof NoAutomaticRouteStopsError
      || error instanceof DailyRouteLimitError;
    await recordSystemEvent({
      level: expected ? "warn" : "error",
      source: "prospecting.route",
      message,
      error,
      repId: job.repId,
      context: { jobId: job.id, location: job.location },
    });
    return null;
  }
}

export async function retryAutomaticRoute(jobId: number, repId: number) {
  const [job] = await db.update(prospectingJobs).set({
    routePlanningStatus: "pending",
    routeErrorMessage: null,
    updatedAt: new Date(),
  }).where(and(
    eq(prospectingJobs.id, jobId),
    eq(prospectingJobs.repId, repId),
    eq(prospectingJobs.status, "completed"),
    inArray(prospectingJobs.routePlanningStatus, ["failed", "pending"]),
  )).returning();
  return job ?? null;
}
