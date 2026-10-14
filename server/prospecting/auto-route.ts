import { and, asc, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
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
import { sendPushNotification } from "../push-notifications.js";
import { publishProspectingRouteForRep } from "./route-publisher.js";
import { MAX_DAILY_PROSPECTING_SESSIONS } from "#shared/prospecting.js";

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
    }).from(prospectingCandidates).where(and(
      eq(prospectingCandidates.jobId, job.id),
      eq(prospectingCandidates.repId, job.repId),
      notInArray(prospectingCandidates.status, ["discarded", "visited"]),
    )).orderBy(sql`${prospectingCandidates.score} desc`, asc(prospectingCandidates.id));

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
    });
    if (candidate.leadId) seenLeadIds.add(candidate.leadId);
    if (candidate.googlePlaceId) seenPlaceIds.add(candidate.googlePlaceId);
  }
  if (!candidates.length) throw new NoAutomaticRouteCandidatesError();

  const plannedStartAt = new Date();
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
      shiftDurationSeconds: job.shiftDurationMinutes * 60,
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
    }).catch((error) => console.error("[automatic route push] delivery failed:", error));
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
    console.error(`[automatic route] job ${job.id}:`, error);
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
