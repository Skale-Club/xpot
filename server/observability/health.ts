import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import { prospectingJobs, prospectingRuns, salesReps, systemEvents } from "#shared/schema.js";
import type { ActiveRunHealth, HealthReasonCode, HealthVerdict, RecentRun, StuckJob, SystemHealthSnapshot } from "#shared/system-health.js";
import type { ProspectingRun } from "#shared/schema.js";
import { ENGINE_OVERDUE_GRACE_MS, getEngineSettings } from "../prospecting/google-maps-engine.js";
import { getProspectingWorkerHealth } from "../prospecting/queue.js";
import { median } from "../prospecting/job-status.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Without history, a single search past this is called slow. */
const DEFAULT_SLOW_MS = 15 * 60 * 1000;
/** A run "starting" without an engine id for this long never reached the engine. */
const STARTING_STALL_MS = 2 * 60 * 1000;
/** auto-route.ts takes a "building" route back after 15 min; past that it is stuck. */
const ROUTE_STUCK_MS = 20 * 60 * 1000;

const RANK: Record<HealthVerdict, number> = { idle: 0, healthy: 1, slow: 2, stalled: 3, down: 4 };
export function worstVerdict(verdicts: HealthVerdict[]): HealthVerdict {
  return verdicts.reduce<HealthVerdict>((worst, v) => (RANK[v] > RANK[worst] ? v : worst), "healthy");
}

/**
 * A verdict with its reason: `reasonCode` is stable, for the screen to word in
 * the admin's language with a "what to do" line; `reason` is the English
 * sentence, kept for logs and API clients.
 */
type Assessment = { verdict: HealthVerdict; reasonCode: HealthReasonCode; reason: string };

/**
 * Is one engine search moving? The worker touches a running run's updated_at on
 * every poll, so a run nobody touched for three polls is not being watched at all;
 * a run past the median of past searches is slow but alive.
 */
export function assessRun(input: {
  status: "starting" | "running";
  engineJobId: string | null;
  elapsedMs: number;
  sinceUpdateMs: number;
  pollMs: number;
  maxTimeMs: number;
  typicalMs: number | null;
}): Assessment {
  const { status, engineJobId, elapsedMs, sinceUpdateMs, pollMs, maxTimeMs, typicalMs } = input;
  if (status === "starting" && !engineJobId && elapsedMs > STARTING_STALL_MS) {
    return { verdict: "stalled", reasonCode: "engine_never_confirmed", reason: "The engine never confirmed this search." };
  }
  if (sinceUpdateMs > pollMs * 3) {
    return { verdict: "stalled", reasonCode: "run_not_checked", reason: "The worker has not checked this search for several polls." };
  }
  if (elapsedMs > maxTimeMs) {
    return { verdict: "stalled", reasonCode: "past_time_limit", reason: "Past the engine's time limit; it will be failed soon." };
  }
  const slowAfter = typicalMs ? Math.max(typicalMs * 2, 5 * 60 * 1000) : DEFAULT_SLOW_MS;
  if (elapsedMs > slowAfter) {
    return { verdict: "slow", reasonCode: "slower_than_usual", reason: "Taking longer than usual, but the engine is still answering." };
  }
  return { verdict: "healthy", reasonCode: "running_normally", reason: "Running normally." };
}

export function assessWorker(input: {
  engineConfigured: boolean;
  startedAt: Date | null;
  lastTickFinishedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: { message: string; at: Date } | null;
  ticking: boolean;
  pollMs: number;
  now: number;
}): Assessment {
  if (!input.engineConfigured) return { verdict: "down", reasonCode: "engine_not_configured", reason: "PROSPECTING_ENGINE_URL is not configured." };
  if (!input.startedAt) return { verdict: "down", reasonCode: "worker_not_running", reason: "The worker is not running in this process." };
  const lastBeat = input.lastTickFinishedAt?.getTime() ?? input.startedAt.getTime();
  if (input.now - lastBeat > input.pollMs * 3 && !input.ticking) {
    return { verdict: "down", reasonCode: "worker_not_ticking", reason: "The worker has not ticked for several polls." };
  }
  if (input.ticking && input.now - lastBeat > input.pollMs * 4) {
    return { verdict: "stalled", reasonCode: "tick_running_long", reason: "A worker tick has been running for several polls." };
  }
  const lastErrorAt = input.lastError?.at.getTime() ?? 0;
  if (lastErrorAt && lastErrorAt > (input.lastSuccessAt?.getTime() ?? 0)) {
    return { verdict: "stalled", reasonCode: "last_tick_failed", reason: `The last tick failed: ${input.lastError!.message}` };
  }
  return { verdict: "healthy", reasonCode: "ticking_normally", reason: "Ticking normally." };
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** How many searches the timeline shows. */
export const RECENT_RUNS = 60;

export function toRecentRun(run: ProspectingRun, repName: string | null): RecentRun {
  return {
    runId: run.id,
    jobId: run.jobId,
    repName,
    status: run.status,
    query: run.query,
    location: run.location,
    wave: run.wave,
    createdAt: run.createdAt.toISOString(),
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    durationMs: run.startedAt && run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : null,
    resultCount: run.resultCount,
    errorMessage: run.errorMessage,
  };
}

export async function systemHealthSnapshot(now = Date.now()): Promise<SystemHealthSnapshot> {
  const worker = getProspectingWorkerHealth();
  const { maxTimeSeconds } = getEngineSettings();
  const maxTimeMs = maxTimeSeconds * 1000;
  const since24h = new Date(now - DAY_MS);
  const since7d = new Date(now - 7 * DAY_MS);

  const [active, queued, recentCompleted, recent, runTotals, openJobs, routeCandidates, failedRoutes, bySource, groups, reps] = await Promise.all([
    db.select().from(prospectingRuns).where(inArray(prospectingRuns.status, ["starting", "running"])),
    db.select({ count: sql<number>`count(*)::int`, oldest: sql<Date | null>`min(${prospectingRuns.createdAt})` })
      .from(prospectingRuns).where(eq(prospectingRuns.status, "queued")),
    db.select({ startedAt: prospectingRuns.startedAt, completedAt: prospectingRuns.completedAt }).from(prospectingRuns)
      .where(and(eq(prospectingRuns.status, "completed"), isNotNull(prospectingRuns.startedAt), isNotNull(prospectingRuns.completedAt)))
      .orderBy(desc(prospectingRuns.completedAt)).limit(20),
    db.select().from(prospectingRuns).orderBy(desc(prospectingRuns.createdAt), desc(prospectingRuns.id)).limit(RECENT_RUNS),
    db.select({ status: prospectingRuns.status, count: sql<number>`count(*)::int` }).from(prospectingRuns)
      .where(gte(prospectingRuns.updatedAt, since24h)).groupBy(prospectingRuns.status),
    db.select({ count: sql<number>`count(*)::int` }).from(prospectingJobs).where(inArray(prospectingJobs.status, ["queued", "running"])),
    db.select().from(prospectingJobs).where(and(
      eq(prospectingJobs.status, "completed"),
      inArray(prospectingJobs.routePlanningStatus, ["pending", "building"]),
      // auto-route.ts only builds routes for jobs from the last 24 hours; older
      // pending jobs expired by design and are not stuck.
      or(gte(prospectingJobs.completedAt, since24h), gte(prospectingJobs.createdAt, since24h)),
    )),
    db.select({ count: sql<number>`count(*)::int` }).from(prospectingJobs)
      .where(and(eq(prospectingJobs.routePlanningStatus, "failed"), gte(prospectingJobs.updatedAt, since24h))),
    db.select({ source: systemEvents.source, level: systemEvents.level, count: sql<number>`count(*)::int` })
      .from(systemEvents).where(gte(systemEvents.createdAt, since24h)).groupBy(systemEvents.source, systemEvents.level),
    db.select({
      fingerprint: systemEvents.fingerprint,
      source: sql<string>`max(${systemEvents.source})`,
      level: sql<"error" | "warn">`(array_agg(${systemEvents.level} order by ${systemEvents.id} desc))[1]`,
      message: sql<string>`(array_agg(${systemEvents.message} order by ${systemEvents.id} desc))[1]`,
      count: sql<number>`(count(*) + coalesce(sum((${systemEvents.context}->>'repeatsSinceLastRow')::int), 0))::int`,
      firstSeenAt: sql<Date>`min(${systemEvents.createdAt})`,
      lastSeenAt: sql<Date>`max(${systemEvents.createdAt})`,
      lastEventId: sql<number>`max(${systemEvents.id})`,
    }).from(systemEvents).where(gte(systemEvents.createdAt, since7d))
      .groupBy(systemEvents.fingerprint).orderBy(sql`max(${systemEvents.createdAt}) desc`).limit(30),
    db.select({ id: salesReps.id, displayName: salesReps.displayName }).from(salesReps),
  ]);

  const repName = new Map(reps.map((rep) => [rep.id, rep.displayName]));
  const typicalMs = median(recentCompleted.map((run) => run.completedAt!.getTime() - run.startedAt!.getTime()));

  const activeRuns: ActiveRunHealth[] = active.map((run) => {
    const elapsedMs = run.startedAt ? now - run.startedAt.getTime() : 0;
    const sinceUpdateMs = now - run.updatedAt.getTime();
    const status = run.status as "starting" | "running";
    const assessed = assessRun({ status, engineJobId: run.engineJobId, elapsedMs, sinceUpdateMs, pollMs: worker.pollMs, maxTimeMs, typicalMs });
    return {
      runId: run.id,
      jobId: run.jobId,
      repId: run.repId,
      repName: repName.get(run.repId) ?? null,
      status,
      query: run.query,
      location: run.location,
      wave: run.wave,
      engineJobId: run.engineJobId,
      startedAt: iso(run.startedAt),
      updatedAt: run.updatedAt.toISOString(),
      elapsedMs,
      sinceUpdateMs,
      deadlineMs: maxTimeMs + ENGINE_OVERDUE_GRACE_MS,
      typicalMs,
      ...assessed,
    };
  });

  const stuckJobs: StuckJob[] = routeCandidates
    .filter((job) => now - job.updatedAt.getTime() > ROUTE_STUCK_MS)
    .map((job) => ({
      jobId: job.id,
      repId: job.repId,
      repName: repName.get(job.repId) ?? null,
      location: job.location,
      status: job.status,
      routePlanningStatus: job.routePlanningStatus,
      updatedAt: job.updatedAt.toISOString(),
      ...(job.routePlanningStatus === "building"
        ? { reasonCode: "route_building_stuck" as const, reason: "Route building has not finished." }
        : { reasonCode: "route_not_built" as const, reason: "Search finished but no route was built." }),
    }));

  const workerAssessed = assessWorker({
    engineConfigured: worker.engineConfigured,
    startedAt: worker.startedAt,
    lastTickFinishedAt: worker.lastTickFinishedAt,
    lastSuccessAt: worker.lastSuccessAt,
    lastError: worker.lastError,
    ticking: worker.ticking,
    pollMs: worker.pollMs,
    now,
  });

  const oldest = queued[0]?.oldest ? new Date(queued[0].oldest) : null;
  const queuedRuns = queued[0]?.count ?? 0;
  const runCount = (status: string) => runTotals.find((row) => row.status === status)?.count ?? 0;
  const errors24h = bySource.filter((row) => row.level === "error").reduce((sum, row) => sum + row.count, 0);
  const warnings24h = bySource.filter((row) => row.level === "warn").reduce((sum, row) => sum + row.count, 0);

  const verdicts: HealthVerdict[] = [workerAssessed.verdict, ...activeRuns.map((run) => run.verdict)];
  if (stuckJobs.length) verdicts.push("stalled");
  // Waiting runs with nothing running means the dispatcher is not picking them up.
  if (queuedRuns && !activeRuns.length && oldest && now - oldest.getTime() > worker.pollMs * 3) verdicts.push("stalled");

  return {
    generatedAt: new Date(now).toISOString(),
    overall: worstVerdict(verdicts),
    worker: {
      ...workerAssessed,
      engineConfigured: worker.engineConfigured,
      pollMs: worker.pollMs,
      startedAt: iso(worker.startedAt),
      ticks: worker.ticks,
      ticking: worker.ticking,
      lastTickFinishedAt: iso(worker.lastTickFinishedAt),
      lastTickDurationMs: worker.lastTickDurationMs,
      lastSuccessAt: iso(worker.lastSuccessAt),
      lastError: worker.lastError ? { message: worker.lastError.message, at: worker.lastError.at.toISOString() } : null,
    },
    queue: {
      queuedRuns,
      oldestQueuedMs: oldest ? now - oldest.getTime() : null,
      activeRuns,
      openJobs: openJobs[0]?.count ?? 0,
      stuckJobs,
      recentRuns: recent.map((run) => toRecentRun(run, repName.get(run.repId) ?? null)),
      failedRuns24h: runCount("failed"),
      completedRuns24h: runCount("completed"),
      failedRoutes24h: failedRoutes[0]?.count ?? 0,
    },
    events: {
      errors24h,
      warnings24h,
      bySource24h: bySource,
      groups: groups.map((group) => ({
        ...group,
        firstSeenAt: new Date(group.firstSeenAt).toISOString(),
        lastSeenAt: new Date(group.lastSeenAt).toISOString(),
      })),
    },
  };
}
