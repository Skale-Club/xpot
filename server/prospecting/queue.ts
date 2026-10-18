import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingJobs,
  prospectingRuns,
  salesLeads,
  type ProspectingJobStatus,
  type ProspectingRun,
} from "#shared/schema.js";
import {
  buildEngineInput,
  countEngineResultsSoFar,
  downloadEngineCsv,
  ENGINE_OVERDUE_GRACE_MS,
  getEngineJobStatus,
  getEngineSettings,
  isEngineConfigured,
  parseEngineResults,
  ProspectingEngineError,
  START_TIMEOUT_MS,
  startEngineJob,
  type NormalizedPlace,
} from "./google-maps-engine.js";
import { evaluateColdEligibility } from "./eligibility.js";
import { chooseExpansionArea } from "./expansion.js";
import { earliestStartedAt } from "./job-status.js";
import { sendPushNotification } from "../push-notifications.js";
import { processNextAutomaticRoute } from "./auto-route.js";
import { recordSystemEvent, reportSystemEvent } from "../observability/events.js";

const QUEUE_MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const STARTING_STALE_MS = START_TIMEOUT_MS + 2 * 60 * 1000;
const DISPATCH_LOCK_KEY = 7_424_002;
const CANCELLED_RUN_MESSAGE = "This search was cancelled.";
let ticking: Promise<void> | null = null;
let lastDispatchedRepId: number | null = null;

/** This process's worker loop, for Admin › System health. */
const workerHealth = {
  startedAt: null as Date | null,
  pollMs: 15_000,
  ticks: 0,
  lastTickStartedAt: null as Date | null,
  lastTickFinishedAt: null as Date | null,
  lastTickDurationMs: null as number | null,
  lastError: null as { message: string; at: Date } | null,
  lastSuccessAt: null as Date | null,
};
export function getProspectingWorkerHealth() {
  return { ...workerHealth, ticking: ticking !== null, engineConfigured: isEngineConfigured() };
}

function scorePlace(place: NormalizedPlace) {
  let score = 35;
  const reasons: string[] = ["new business in selected territory"];
  if (place.lat !== null && place.lng !== null) { score += 20; reasons.push("route-ready coordinates"); }
  if (place.phone) { score += 10; reasons.push("phone available"); }
  if (place.email) { score += 10; reasons.push("email available"); }
  if (place.website) { score += 5; reasons.push("website available"); }
  if ((place.rating ?? 0) >= 4) { score += 10; reasons.push("rating 4.0+"); }
  if ((place.reviewCount ?? 0) >= 25) { score += 10; reasons.push("established review volume"); }
  return { score: Math.min(100, score), reasons };
}
async function maybeQueueExpansion(jobId: number, runs: ProspectingRun[]) {
  if (!runs.length || !runs.every((run) => ["completed", "failed", "cancelled"].includes(run.status))) return false;
  const [job] = await db.select().from(prospectingJobs).where(eq(prospectingJobs.id, jobId)).limit(1);
  if (!job?.autoExpand || !runs.some((run) => run.status === "completed")) return false;
  const eligible = await db.select({
    city: prospectingCandidates.city,
    state: prospectingCandidates.state,
    lat: prospectingCandidates.lat,
    lng: prospectingCandidates.lng,
  })
    .from(prospectingCandidates)
    .where(and(eq(prospectingCandidates.jobId, jobId), ne(prospectingCandidates.status, "discarded")));
  // Only a place with coordinates can become a stop; a list padded with
  // unroutable results must not stop the search short of a full day.
  const routable = eligible.filter((candidate) => candidate.lat !== null && candidate.lng !== null);
  if (routable.length >= job.targetStops) return false;

  const nextWave = Math.max(...runs.map((run) => run.wave)) + 1;
  const area = chooseExpansionArea({
    anchor: job.location,
    searchedAreas: runs.map((run) => run.location),
    candidateCities: eligible.map((candidate) => candidate.city
      ? [candidate.city, candidate.state].filter(Boolean).join(", ")
      : null),
    nextWave,
  });
  if (!area) return false;

  const inserted = await db.insert(prospectingRuns).values(job.searches.map((search) => ({
    jobId: job.id,
    repId: job.repId,
    niche: search.niche,
    query: search.query,
    location: area.location,
    requestedMaxResults: job.maxResultsPerSearch,
    wave: nextWave,
    expansionReason: area.reason,
  }))).onConflictDoNothing().returning({ id: prospectingRuns.id });
  if (!inserted.length) return false;
  await db.update(prospectingJobs).set({
    status: "queued",
    expansionState: {
      wave: nextWave,
      currentArea: area.location,
      reason: area.reason,
      eligibleCandidates: routable.length,
      targetStops: job.targetStops,
    },
    completedAt: null,
    updatedAt: new Date(),
  }).where(and(eq(prospectingJobs.id, job.id), ne(prospectingJobs.status, "cancelled")));
  return true;
}

async function updateJobStatus(jobId: number) {
  const [previousJob] = await db.select({ repId: prospectingJobs.repId, status: prospectingJobs.status })
    .from(prospectingJobs).where(eq(prospectingJobs.id, jobId)).limit(1);
  // A cancelled job is final: no expansion wave, no status from its runs.
  if (!previousJob || previousJob.status === "cancelled") return;
  const runs = await db.select().from(prospectingRuns).where(eq(prospectingRuns.jobId, jobId));
  const expanded = await maybeQueueExpansion(jobId, runs);
  if (expanded) return;
  let status: ProspectingJobStatus = "queued";
  if (runs.length && runs.every((run) => run.status === "completed")) status = "completed";
  else if (runs.length && runs.every((run) => ["completed", "failed", "cancelled"].includes(run.status))) {
    status = runs.some((run) => run.status === "completed") ? "completed" : "failed";
  } else if (runs.some((run) => ["starting", "running"].includes(run.status))) status = "running";
  const resultCount = runs.reduce((sum, run) => sum + run.resultCount, 0);
  const errors = runs.map((run) => run.errorMessage).filter(Boolean);
  await db.update(prospectingJobs).set({
    status,
    resultCount,
    errorMessage: errors.length ? errors.join("; ").slice(0, 2000) : null,
    // Use the already decoded Date values. A raw SQL MIN(timestamp) is returned
    // as a string by postgres-js and Drizzle's timestamp encoder then rejects it.
    startedAt: earliestStartedAt(runs.map((run) => run.startedAt)),
    completedAt: ["completed", "failed", "cancelled"].includes(status) ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(prospectingJobs.id, jobId), ne(prospectingJobs.status, "cancelled")));
  if (previousJob.status !== status && ["completed", "failed"].includes(status)) {
    const ready = status === "completed";
    void sendPushNotification(previousJob.repId, {
      title: ready ? "Xpot is optimizing your route" : "Prospecting needs attention",
      body: ready ? "The search is complete. Xpot is now selecting and ordering today's stops." : "Open Leads to review the failed search and retry it.",
      href: `/route?jobId=${jobId}`,
    }).catch((error) => reportSystemEvent({ level: "warn", source: "push", message: "Prospecting push delivery failed.", error, repId: previousJob.repId, context: { jobId } }));
  }
}

async function saveResults(run: ProspectingRun, places: NormalizedPlace[]) {
  const existingLeads = await db.select({
    id: salesLeads.id,
    name: salesLeads.name,
    googlePlaceId: salesLeads.googlePlaceId,
    phone: salesLeads.phone,
    website: salesLeads.website,
    status: salesLeads.status,
    lastVisitAt: salesLeads.lastVisitAt,
  }).from(salesLeads).where(eq(salesLeads.ownerRepId, run.repId));
  await db.transaction(async (tx) => {
    // Claim the run first: one cancelled (or failed) while the CSV downloaded
    // keeps its status, and its results are dropped.
    const [saved] = await tx.update(prospectingRuns).set({
      status: "completed",
      progress: 100,
      resultCount: places.length,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(prospectingRuns.id, run.id), eq(prospectingRuns.status, "running"))).returning({ id: prospectingRuns.id });
    if (!saved) return;
    if (places.length) {
      await tx.insert(prospectingCandidates).values(places.map((place) => {
        const scored = scorePlace(place);
        const eligibility = evaluateColdEligibility(place, existingLeads);
        return {
          jobId: run.jobId,
          runId: run.id,
          repId: run.repId,
          leadId: eligibility.leadId,
          status: eligibility.eligible ? "discovered" as const : "discarded" as const,
          sourceId: place.sourceId,
          googlePlaceId: place.googlePlaceId,
          name: place.name,
          address: place.address,
          city: place.city,
          state: place.state,
          postalCode: place.postalCode,
          country: place.country || "US",
          lat: place.lat === null ? null : String(place.lat),
          lng: place.lng === null ? null : String(place.lng),
          phone: place.phone,
          email: place.email,
          website: place.website,
          industry: place.industry,
          ratingPermille: place.rating === null ? null : Math.round(place.rating * 1000),
          reviewCount: place.reviewCount === null ? null : Math.round(place.reviewCount),
          score: scored.score,
          scoreReasons: scored.reasons,
          exclusionReason: eligibility.exclusionReason,
          rawPayload: place.rawPayload,
        };
      })).onConflictDoNothing();
    }
  });
  await updateJobStatus(run.jobId);
}

async function failRun(run: ProspectingRun, errorMessage: string) {
  await recordSystemEvent({
    source: "prospecting.engine",
    message: errorMessage,
    repId: run.repId,
    context: { jobId: run.jobId, runId: run.id, query: run.query, location: run.location, engineJobId: run.engineJobId, previousStatus: run.status },
  });
  await db.update(prospectingRuns).set({ status: "failed", progress: 0, errorMessage, completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(prospectingRuns.id, run.id), inArray(prospectingRuns.status, ["starting", "running"])));
  await updateJobStatus(run.jobId);
}

async function refreshActiveRun() {
  const [run] = await db.select().from(prospectingRuns)
    .where(inArray(prospectingRuns.status, ["starting", "running"]))
    .orderBy(asc(prospectingRuns.createdAt)).limit(1);
  if (!run) return;
  const deadlineMs = getEngineSettings().maxTimeSeconds * 1000 + ENGINE_OVERDUE_GRACE_MS;
  if (run.startedAt && Date.now() - run.startedAt.getTime() > deadlineMs) {
    await failRun(run, "Prospecting engine job exceeded its time limit.");
    return;
  }
  if (!run.engineJobId) {
    // A process that died between claiming the run and recording the engine's
    // answer leaves it "starting" forever, and the single slot blocks every
    // account's queue. The start may or may not have reached the engine, so it
    // is failed (never resent automatically) and the rep can retry it.
    if (run.status === "starting" && run.startedAt && Date.now() - run.startedAt.getTime() > STARTING_STALE_MS) {
      await failRun(run, "The prospecting engine did not confirm this search. Try again.");
    }
    return;
  }
  let state;
  try {
    state = await getEngineJobStatus(run.engineJobId);
  } catch (error) {
    if (error instanceof ProspectingEngineError && error.code === "not_found") {
      await failRun(run, "The prospecting engine lost this search. Try again.");
      return;
    }
    throw error;
  }
  if (state.status === "running") {
    // Businesses found so far, from the engine's partial CSV: the Route screen
    // shows "12 of 30" instead of a bar that sits still for the whole search.
    // The final count replaces it when the run completes.
    const found = await countEngineResultsSoFar(run.engineJobId);
    await db.update(prospectingRuns).set({
      progress: state.progress,
      ...(found === null ? {} : { resultCount: Math.min(found, run.requestedMaxResults) }),
      updatedAt: new Date(),
    }).where(and(eq(prospectingRuns.id, run.id), inArray(prospectingRuns.status, ["starting", "running"])));
    return;
  }
  if (state.status === "failed") {
    await failRun(run, "Prospecting engine job failed.");
    return;
  }
  const places = parseEngineResults(await downloadEngineCsv(run.engineJobId), run.requestedMaxResults);
  await saveResults(run, places);
}

async function claimNextRun() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK_KEY})`);
    await tx.update(prospectingRuns).set({
      status: "failed",
      errorMessage: "This search expired after waiting 24 hours in the prospecting queue.",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(prospectingRuns.status, "queued"), sql`${prospectingRuns.createdAt} < ${new Date(Date.now() - QUEUE_MAX_WAIT_MS)}`));
    // A job cancelled while an expansion wave was being added must not send it.
    await tx.update(prospectingRuns).set({
      status: "cancelled",
      errorMessage: CANCELLED_RUN_MESSAGE,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(prospectingRuns.status, "queued"),
      sql`${prospectingRuns.jobId} IN (SELECT ${prospectingJobs.id} FROM ${prospectingJobs} WHERE ${prospectingJobs.status} = 'cancelled')`,
    ));
    const [active] = await tx.select({ id: prospectingRuns.id }).from(prospectingRuns)
      .where(inArray(prospectingRuns.status, ["starting", "running"])).limit(1);
    if (active) return null;
    const [fairNext] = lastDispatchedRepId === null ? [] : await tx.select().from(prospectingRuns).where(and(
      eq(prospectingRuns.status, "queued"),
      ne(prospectingRuns.repId, lastDispatchedRepId),
    )).orderBy(asc(prospectingRuns.createdAt), asc(prospectingRuns.id)).limit(1).for("update", { skipLocked: true });
    const [fallback] = fairNext ? [] : await tx.select().from(prospectingRuns).where(eq(prospectingRuns.status, "queued"))
      .orderBy(asc(prospectingRuns.createdAt), asc(prospectingRuns.id)).limit(1).for("update", { skipLocked: true });
    const next = fairNext ?? fallback;
    if (!next) return null;
    const input = buildEngineInput(next.query, next.location, next.requestedMaxResults);
    const [claimed] = await tx.update(prospectingRuns).set({ status: "starting", engineInput: input, startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(prospectingRuns.id, next.id), eq(prospectingRuns.status, "queued"))).returning();
    return claimed ?? null;
  });
}

async function dispatchNextRun() {
  const run = await claimNextRun();
  if (!run) return;
  lastDispatchedRepId = run.repId;
  try {
    const engineJobId = await startEngineJob(run.engineInput);
    await db.update(prospectingRuns).set({ status: "running", engineJobId, progress: 10, updatedAt: new Date() })
      .where(and(eq(prospectingRuns.id, run.id), eq(prospectingRuns.status, "starting")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The prospecting engine could not start the search.";
    await recordSystemEvent({
      source: "prospecting.engine",
      message: `Could not start a search: ${message}`,
      error,
      repId: run.repId,
      context: { jobId: run.jobId, runId: run.id, query: run.query, location: run.location },
    });
    await db.update(prospectingRuns).set({ status: "failed", errorMessage: message, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(prospectingRuns.id, run.id), eq(prospectingRuns.status, "starting")));
  }
  await updateJobStatus(run.jobId);
}

async function tick() {
  if (isEngineConfigured()) {
    await refreshActiveRun();
    await dispatchNextRun();
    const openJobs = await db.select({ id: prospectingJobs.id }).from(prospectingJobs)
      .where(inArray(prospectingJobs.status, ["queued", "running"]));
    for (const job of openJobs) await updateJobStatus(job.id);
  }
  await processNextAutomaticRoute();
}

export function tickProspectingQueueSafely() {
  if (ticking) return ticking;
  const started = new Date();
  workerHealth.ticks += 1;
  workerHealth.lastTickStartedAt = started;
  ticking = tick()
    .then(() => { workerHealth.lastSuccessAt = new Date(); })
    .catch(async (error) => {
      workerHealth.lastError = { message: error instanceof Error ? error.message : String(error), at: new Date() };
      await recordSystemEvent({ source: "prospecting.worker", message: "The prospecting queue tick failed.", error });
    })
    .finally(() => {
      workerHealth.lastTickFinishedAt = new Date();
      workerHealth.lastTickDurationMs = Date.now() - started.getTime();
      ticking = null;
    });
  return ticking;
}

/** Explicit user retry: reset only failed physical runs, never successful work. */
export async function retryFailedProspectingRuns(jobId: number, repId: number) {
  return db.transaction(async (tx) => {
    // A cancelled job stays cancelled; the rep starts a new search instead.
    const [job] = await tx.select({ status: prospectingJobs.status }).from(prospectingJobs)
      .where(and(eq(prospectingJobs.id, jobId), eq(prospectingJobs.repId, repId))).limit(1);
    if (!job || job.status === "cancelled") return 0;
    const failed = await tx.select({ id: prospectingRuns.id }).from(prospectingRuns).where(and(
      eq(prospectingRuns.jobId, jobId),
      eq(prospectingRuns.repId, repId),
      eq(prospectingRuns.status, "failed"),
    ));
    if (!failed.length) return 0;
    const ids = failed.map((run) => run.id);
    await tx.update(prospectingRuns).set({
      status: "queued",
      engineJobId: null,
      engineInput: {},
      progress: 0,
      resultCount: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      // Back of the FIFO line, with a fresh 24-hour queue allowance: the
      // original creation time would jump other accounts or expire at once.
      createdAt: new Date(),
      updatedAt: new Date(),
    }).where(inArray(prospectingRuns.id, ids));
    await tx.update(prospectingJobs).set({
      status: "queued",
      errorMessage: null,
      routePlanningStatus: "pending",
      routeErrorMessage: null,
      completedAt: null,
      updatedAt: new Date(),
    }).where(and(eq(prospectingJobs.id, jobId), eq(prospectingJobs.repId, repId)));
    return ids.length;
  });
}

export type ProspectingCancelResult =
  | { outcome: "not_found" }
  | { outcome: "not_cancellable"; status: ProspectingJobStatus; routePlanningStatus: string }
  | { outcome: "cancelled"; jobId: number; repId: number; status: ProspectingJobStatus; routePlanningStatus: string; cancelledRuns: number };

/**
 * Stops a search that is still running or waiting, or a finished search whose
 * route was never built. Its waiting and running searches become "cancelled"
 * and the worker never picks them up again (claimNextRun, updateJobStatus and
 * saveResults leave a cancelled job alone); the route is marked failed, so
 * nothing keeps the rep from rebuilding it (a finished search) or starting a
 * new search. The engine's API has no cancel: Xpot only stops waiting for it,
 * and whatever it still returns for that search is dropped.
 * `repId` limits it to one person's own searches (the Route screen).
 */
export async function cancelProspectingJob(jobId: number, repId?: number): Promise<ProspectingCancelResult> {
  const result = await db.transaction(async (tx): Promise<ProspectingCancelResult> => {
    // The dispatcher claims runs under this lock: a run is never started after it was cancelled.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${DISPATCH_LOCK_KEY})`);
    const [job] = await tx.select().from(prospectingJobs).where(and(
      eq(prospectingJobs.id, jobId),
      ...(repId === undefined ? [] : [eq(prospectingJobs.repId, repId)]),
    )).limit(1).for("update");
    if (!job) return { outcome: "not_found" };
    const searching = ["draft", "queued", "running"].includes(job.status);
    const routing = job.status === "completed" && ["pending", "building"].includes(job.routePlanningStatus);
    if (!searching && !routing) {
      return { outcome: "not_cancellable", status: job.status, routePlanningStatus: job.routePlanningStatus };
    }
    const now = new Date();
    const runs = searching
      ? await tx.update(prospectingRuns).set({
          status: "cancelled",
          errorMessage: CANCELLED_RUN_MESSAGE,
          completedAt: now,
          updatedAt: now,
        }).where(and(
          eq(prospectingRuns.jobId, job.id),
          inArray(prospectingRuns.status, ["queued", "starting", "running"]),
        )).returning({ id: prospectingRuns.id })
      : [];
    const [updated] = await tx.update(prospectingJobs).set({
      ...(searching ? { status: "cancelled" as const, errorMessage: CANCELLED_RUN_MESSAGE, completedAt: now } : {}),
      routePlanningStatus: "failed",
      routeErrorMessage: searching ? CANCELLED_RUN_MESSAGE : "Route planning was cancelled.",
      updatedAt: now,
    }).where(eq(prospectingJobs.id, job.id)).returning();
    return {
      outcome: "cancelled",
      jobId: updated.id,
      repId: updated.repId,
      status: updated.status,
      routePlanningStatus: updated.routePlanningStatus,
      cancelledRuns: runs.length,
    };
  });
  // The engine's single slot is free again: send the next search in line.
  if (result.outcome === "cancelled") void tickProspectingQueueSafely();
  return result;
}

export function startProspectingWorker() {
  const pollMs = positivePollMs(process.env.PROSPECTING_ENGINE_POLL_MS);
  workerHealth.startedAt = new Date();
  workerHealth.pollMs = pollMs;
  void tickProspectingQueueSafely();
  const timer = setInterval(() => void tickProspectingQueueSafely(), pollMs);
  timer.unref();
  return () => clearInterval(timer);
}

function positivePollMs(value: string | undefined) {
  const parsed = Number(value);
  // 15 s: each tick also reads the running search's partial results, and the
  // Route screen's "found so far" should not lag half a minute behind.
  return Number.isInteger(parsed) && parsed >= 10_000 ? parsed : 15_000;
}
