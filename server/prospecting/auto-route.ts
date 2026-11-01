import { and, asc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingJobs,
  prospectingRoutes,
  prospectingRouteStops,
  type ProspectingJob,
} from "#shared/schema.js";
import type { RouteCandidate } from "./route-optimizer.js";
import { optimizeRouteWithGoogle } from "./google-route-optimizer.js";
import { openWindowsOn, secondsUntilDayEnd } from "./opening-hours.js";
import { sendPushNotification } from "../push-notifications.js";
import { publishProspectingRouteForRep } from "./route-publisher.js";
import { MAX_DAILY_PROSPECTING_SESSIONS, ROUTE_MAX_STOPS } from "#shared/prospecting.js";
import { lockRepDay, repDay } from "./daily-sessions.js";
import { recordSystemEvent, reportSystemEvent } from "../observability/events.js";

const RECENT_JOB_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_BUILD_MS = 15 * 60 * 1000;

class NoAutomaticRouteCandidatesError extends Error {}
class NoAutomaticRouteStopsError extends Error {}
class DailyRouteLimitError extends Error {}
class OtherActiveRouteError extends Error {}

/** A job may still get its route while it is this recent (or was just retried). */
const recentJob = (since: Date) => or(
  sql`${prospectingJobs.completedAt} >= ${since}`,
  sql`${prospectingJobs.createdAt} >= ${since}`,
);

function utcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Jobs carry the rep's local date; the UTC fallback only serves jobs from before that rule. */
function routeDateForJob(job: ProspectingJob) {
  const configured = typeof job.filters?.routeDate === "string" ? job.filters.routeDate : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(configured)
    ? configured
    : utcDateKey(job.completedAt ?? job.createdAt);
}

async function claimNextCompletedJob() {
  return db.transaction(async (tx) => {
    const staleBefore = new Date(Date.now() - STALE_BUILD_MS);
    const recentSince = new Date(Date.now() - RECENT_JOB_WINDOW_MS);
    // Recover routes created by the older workflow, which marked planning as
    // ready but left the route in draft waiting for a manual "Use this route".
    // Only for recent jobs, the ones the claim below can still pick up: an old
    // job put back to "pending" would sit there forever.
    await tx.update(prospectingJobs).set({
      routePlanningStatus: "pending",
      routeErrorMessage: null,
      updatedAt: new Date(),
    }).where(and(
      eq(prospectingJobs.status, "completed"),
      eq(prospectingJobs.routePlanningStatus, "ready"),
      recentJob(recentSince),
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
      recentJob(recentSince),
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
  // Only this job's own route is "already built". Another active route of the
  // day (a past route reused meanwhile) must not silently swallow the search.
  const settled = (day: Awaited<ReturnType<typeof repDay>>) => {
    if (day.activeRoute?.jobId === job.id) return { route: day.activeRoute, reused: true as const };
    if (day.activeRoute) throw new OtherActiveRouteError();
    if (day.limitReached(job.id)) throw new DailyRouteLimitError();
    return null;
  };
  const before = settled(await repDay(db, job.repId, routeDate));
  if (before) return before;

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
      // Negative like every discovered business's id in the optimizer.
      missingCoordinates.push(-candidate.id);
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
    await lockRepDay(tx, job.repId, routeDate, { wait: true });
    const locked = settled(await repDay(tx, job.repId, routeDate));
    if (locked) return locked;

    const optimized = await optimizeRouteWithGoogle({
      plannedStartAt,
      shiftDurationSeconds,
      maxStops: ROUTE_MAX_STOPS,
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
      maxStops: ROUTE_MAX_STOPS,
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
        : error instanceof OtherActiveRouteError
          ? "Another route is already active today. Finish or cancel it, then build this one again."
        : error instanceof Error ? error.message : "The automatic route could not be built.";
    await db.update(prospectingJobs).set({
      routePlanningStatus: "failed",
      routeErrorMessage: message.slice(0, 2000),
      updatedAt: new Date(),
    }).where(eq(prospectingJobs.id, job.id));
    // No candidates / no room / daily limit are outcomes the rep sees, not faults.
    const expected = error instanceof NoAutomaticRouteCandidatesError
      || error instanceof NoAutomaticRouteStopsError
      || error instanceof DailyRouteLimitError
      || error instanceof OtherActiveRouteError;
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

export type RetryAutomaticRouteResult =
  | { outcome: "retried"; job: ProspectingJob }
  | { outcome: "expired" }
  | { outcome: "not_retryable" };

/**
 * Builds a search's route again after it failed. Only for a recent search:
 * routes are same-day, and the worker never picks up an older one, so a
 * retry there would answer "accepted" and then do nothing.
 */
export async function retryAutomaticRoute(jobId: number, repId: number): Promise<RetryAutomaticRouteResult> {
  const retryable = and(
    eq(prospectingJobs.id, jobId),
    eq(prospectingJobs.repId, repId),
    eq(prospectingJobs.status, "completed"),
    inArray(prospectingJobs.routePlanningStatus, ["failed", "pending"]),
  );
  const [job] = await db.update(prospectingJobs).set({
    routePlanningStatus: "pending",
    routeErrorMessage: null,
    updatedAt: new Date(),
  }).where(and(retryable, recentJob(new Date(Date.now() - RECENT_JOB_WINDOW_MS)))).returning();
  if (job) return { outcome: "retried", job };
  const [old] = await db.select({ id: prospectingJobs.id }).from(prospectingJobs).where(retryable).limit(1);
  return old ? { outcome: "expired" } : { outcome: "not_retryable" };
}
