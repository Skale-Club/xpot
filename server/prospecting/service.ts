import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingJobs,
  prospectingRoutes,
  prospectingRuns,
} from "#shared/schema.js";
import {
  MAX_DAILY_PROSPECTING_SESSIONS,
  TODAY_PROSPECTING_POLICY,
  targetStopsForShift,
  type ProspectingJobCreateInput,
} from "#shared/prospecting.js";
import { isEngineConfigured } from "./google-maps-engine.js";
import { tickProspectingQueueSafely } from "./queue.js";
import { median } from "./job-status.js";

export class ProspectingServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProspectingServiceError";
  }
}

const TYPICAL_RUN_TTL_MS = 60_000;
let typicalRunCache: { at: number; value: number | null } | null = null;

/**
 * How long one engine search usually takes: the median of the last 20 that
 * finished. The engine itself only says "working", so the Route screen turns
 * elapsed time against this into its progress. Cached briefly because every
 * open Route screen polls the job.
 */
export async function typicalRunDurationMs(now = Date.now()) {
  if (typicalRunCache && now - typicalRunCache.at < TYPICAL_RUN_TTL_MS) return typicalRunCache.value;
  const recent = await db.select({ startedAt: prospectingRuns.startedAt, completedAt: prospectingRuns.completedAt })
    .from(prospectingRuns)
    .where(and(eq(prospectingRuns.status, "completed"), isNotNull(prospectingRuns.startedAt), isNotNull(prospectingRuns.completedAt)))
    .orderBy(desc(prospectingRuns.completedAt))
    .limit(20);
  const value = median(recent.map((run) => run.completedAt!.getTime() - run.startedAt!.getTime()).filter((ms) => ms > 0));
  typicalRunCache = { at: now, value };
  return value;
}

export async function prospectingJobDetails(jobId: number, repId: number) {
  const [job] = await db.select().from(prospectingJobs).where(and(
    eq(prospectingJobs.id, jobId),
    eq(prospectingJobs.repId, repId),
  )).limit(1);
  if (!job) return null;
  const [runs, typicalRunMs, candidates] = await Promise.all([
    db.select().from(prospectingRuns).where(eq(prospectingRuns.jobId, job.id)).orderBy(asc(prospectingRuns.createdAt)),
    typicalRunDurationMs(),
    db.select({
      id: prospectingCandidates.id,
      jobId: prospectingCandidates.jobId,
      runId: prospectingCandidates.runId,
      repId: prospectingCandidates.repId,
      leadId: prospectingCandidates.leadId,
      status: prospectingCandidates.status,
      sourceId: prospectingCandidates.sourceId,
      googlePlaceId: prospectingCandidates.googlePlaceId,
      name: prospectingCandidates.name,
      address: prospectingCandidates.address,
      city: prospectingCandidates.city,
      state: prospectingCandidates.state,
      postalCode: prospectingCandidates.postalCode,
      country: prospectingCandidates.country,
      lat: prospectingCandidates.lat,
      lng: prospectingCandidates.lng,
      phone: prospectingCandidates.phone,
      email: prospectingCandidates.email,
      website: prospectingCandidates.website,
      industry: prospectingCandidates.industry,
      ratingPermille: prospectingCandidates.ratingPermille,
      reviewCount: prospectingCandidates.reviewCount,
      score: prospectingCandidates.score,
      scoreReasons: prospectingCandidates.scoreReasons,
      exclusionReason: prospectingCandidates.exclusionReason,
      createdAt: prospectingCandidates.createdAt,
      updatedAt: prospectingCandidates.updatedAt,
    }).from(prospectingCandidates).where(eq(prospectingCandidates.jobId, job.id)).orderBy(desc(prospectingCandidates.score)),
  ]);
  return {
    job,
    runs,
    candidates,
    summary: {
      eligible: candidates.filter((candidate) => candidate.status !== "discarded").length,
      excluded: candidates.filter((candidate) => candidate.status === "discarded").length,
    },
    engine: { configured: isEngineConfigured() },
    // serverNow lets the client measure elapsed time on the server's clock.
    timing: { typicalRunMs, serverNow: new Date().toISOString() },
  };
}

export async function latestProspectingJobDetails(repId: number) {
  const [job] = await db.select({ id: prospectingJobs.id }).from(prospectingJobs)
    .where(eq(prospectingJobs.repId, repId))
    .orderBy(desc(prospectingJobs.createdAt), desc(prospectingJobs.id))
    .limit(1);
  return job ? prospectingJobDetails(job.id, repId) : null;
}

/** Shared mutation used by the signed-in HTTP API and the account-bound MCP tool. */
export async function createProspectingJobForRep(repId: number, input: ProspectingJobCreateInput) {
  if (input.idempotencyKey) {
    const [existing] = await db.select({ id: prospectingJobs.id }).from(prospectingJobs).where(and(
      eq(prospectingJobs.repId, repId),
      eq(prospectingJobs.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (existing) return { details: await prospectingJobDetails(existing.id, repId), reused: true };
  }
  if (!isEngineConfigured()) {
    throw new ProspectingServiceError("The prospecting engine is not configured.", 503);
  }
  const [recent] = await db.select({ count: sql<number>`count(*)::int` }).from(prospectingJobs).where(and(
    eq(prospectingJobs.repId, repId),
    sql`${prospectingJobs.createdAt} >= ${new Date(Date.now() - 60 * 60 * 1000)}`,
  ));
  if ((recent?.count ?? 0) >= 6) {
    throw new ProspectingServiceError("You have started several searches recently. Please wait before starting another.", 429);
  }

  const locations = input.locations?.length ? input.locations : [input.location];
  const routeDate = input.routeDate;

  const job = await db.transaction(async (tx) => {
    if (routeDate) {
      // Serialize the limit check with automatic route creation. This makes the
      // rule hold even across double-clicks, multiple tabs and queue workers.
      await tx.execute(sql`select pg_advisory_xact_lock(${repId}, hashtext(${routeDate}))`);
      const [dailyRoutes, dailyJobs] = await Promise.all([
        tx.select({ status: prospectingRoutes.status }).from(prospectingRoutes).where(and(
          eq(prospectingRoutes.repId, repId),
          eq(prospectingRoutes.routeDate, routeDate),
        )),
        tx.select({
          id: prospectingJobs.id,
          status: prospectingJobs.status,
          routePlanningStatus: prospectingJobs.routePlanningStatus,
        }).from(prospectingJobs).where(and(
          eq(prospectingJobs.repId, repId),
          sql`${prospectingJobs.filters}->>'routeDate' = ${routeDate}`,
        )),
      ]);
      if (dailyRoutes.some((route) => ["draft", "published", "in_progress"].includes(route.status))) {
        throw new ProspectingServiceError("Finish your current route before creating another one.", 409);
      }
      if (dailyJobs.some((existing) => ["draft", "queued", "running"].includes(existing.status)
        || ["pending", "building"].includes(existing.routePlanningStatus))) {
        throw new ProspectingServiceError("Your current route is still being prepared.", 409);
      }
      if (dailyJobs.length >= MAX_DAILY_PROSPECTING_SESSIONS) {
        throw new ProspectingServiceError(`You can create up to ${MAX_DAILY_PROSPECTING_SESSIONS} routes per day.`, 429);
      }
    }
    const [created] = await tx.insert(prospectingJobs).values({
      repId,
      location: input.location,
      searches: input.searches,
      maxResultsPerSearch: TODAY_PROSPECTING_POLICY.maxResultsPerSearch,
      targetStops: targetStopsForShift(input.shiftDurationMinutes),
      shiftDurationMinutes: input.shiftDurationMinutes,
      defaultVisitMinutes: TODAY_PROSPECTING_POLICY.defaultVisitMinutes,
      autoExpand: TODAY_PROSPECTING_POLICY.autoExpand,
      maxExpansionKm: TODAY_PROSPECTING_POLICY.maxExpansionKm,
      filters: { ...input.filters, locations, ...(routeDate ? { routeDate } : {}) },
      hypothesis: input.hypothesis ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      status: "queued",
    }).returning();
    await tx.insert(prospectingRuns).values(locations.flatMap((location) => input.searches.map((search) => ({
      jobId: created.id,
      repId,
      niche: search.niche,
      query: search.query,
      location,
      requestedMaxResults: TODAY_PROSPECTING_POLICY.maxResultsPerSearch,
    }))));
    return created;
  });
  void tickProspectingQueueSafely();
  return { details: await prospectingJobDetails(job.id, repId), reused: false };
}
