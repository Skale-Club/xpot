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

const QUEUE_MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const STARTING_STALE_MS = START_TIMEOUT_MS + 2 * 60 * 1000;
const DISPATCH_LOCK_KEY = 7_424_002;
let ticking: Promise<void> | null = null;
let lastDispatchedRepId: number | null = null;

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
  }).where(eq(prospectingJobs.id, job.id));
  return true;
}

async function updateJobStatus(jobId: number) {
  const [previousJob] = await db.select({ repId: prospectingJobs.repId, status: prospectingJobs.status })
    .from(prospectingJobs).where(eq(prospectingJobs.id, jobId)).limit(1);
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
  }).where(eq(prospectingJobs.id, jobId));
  if (previousJob && previousJob.status !== status && ["completed", "failed"].includes(status)) {
    const ready = status === "completed";
    void sendPushNotification(previousJob.repId, {
      title: ready ? "Xpot is optimizing your route" : "Prospecting needs attention",
      body: ready ? "The search is complete. Xpot is now selecting and ordering today's stops." : "Open Leads to review the failed search and retry it.",
      href: `/route?jobId=${jobId}`,
    }).catch((error) => console.error("[prospecting push] delivery failed:", error));
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
    await tx.update(prospectingRuns).set({
      status: "completed",
      progress: 100,
      resultCount: places.length,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(prospectingRuns.id, run.id), eq(prospectingRuns.status, "running")));
  });
  await updateJobStatus(run.jobId);
}

async function failRun(run: ProspectingRun, errorMessage: string) {
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
    await db.update(prospectingRuns).set({ progress: state.progress, updatedAt: new Date() }).where(eq(prospectingRuns.id, run.id));
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
    await db.update(prospectingRuns).set({ status: "failed", errorMessage: message, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(prospectingRuns.id, run.id));
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
  ticking = tick().catch((error) => console.error("[prospecting queue]", error)).finally(() => { ticking = null; });
  return ticking;
}

/** Explicit user retry: reset only failed physical runs, never successful work. */
export async function retryFailedProspectingRuns(jobId: number, repId: number) {
  return db.transaction(async (tx) => {
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

export function startProspectingWorker() {
  void tickProspectingQueueSafely();
  const pollMs = positivePollMs(process.env.PROSPECTING_ENGINE_POLL_MS);
  const timer = setInterval(() => void tickProspectingQueueSafely(), pollMs);
  timer.unref();
  return () => clearInterval(timer);
}

function positivePollMs(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 10_000 ? parsed : 30_000;
}
