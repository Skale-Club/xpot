// The shape of Admin › System health (GET /api/xpot/admin/system-health), shared
// by the server that assesses it and the screen that shows it.

import type { SystemEventLevel } from "./schema/observability.js";

/** healthy → slow → stalled/down: "slow" still moves, "stalled" has stopped moving. */
export type HealthVerdict = "healthy" | "slow" | "stalled" | "down" | "idle";

/** Why a verdict was given, stable across languages (the screen words it and says what to do). */
export type HealthReasonCode =
  // one search
  | "engine_never_confirmed"
  | "run_not_checked"
  | "past_time_limit"
  | "slower_than_usual"
  | "running_normally"
  // the worker
  | "engine_not_configured"
  | "worker_not_running"
  | "worker_not_ticking"
  | "tick_running_long"
  | "last_tick_failed"
  | "ticking_normally"
  // a finished search with no route
  | "route_building_stuck"
  | "route_not_built";

export type ActiveRunHealth = {
  runId: number;
  jobId: number;
  repId: number;
  repName: string | null;
  status: "starting" | "running";
  query: string;
  location: string;
  wave: number;
  engineJobId: string | null;
  startedAt: string | null;
  updatedAt: string;
  elapsedMs: number;
  sinceUpdateMs: number;
  /** The engine fails the run past this (max_time + grace). */
  deadlineMs: number;
  /** Median duration of recent completed runs, the "normal" to compare against. */
  typicalMs: number | null;
  verdict: HealthVerdict;
  reasonCode: HealthReasonCode;
  reason: string;
};

/** One engine search in the "recent searches" timeline, newest first. */
export type RecentRun = {
  runId: number;
  jobId: number;
  repName: string | null;
  status: "queued" | "starting" | "running" | "completed" | "failed" | "cancelled";
  query: string;
  location: string;
  wave: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  resultCount: number;
  errorMessage: string | null;
};

export type StuckJob = {
  jobId: number;
  repId: number;
  repName: string | null;
  location: string;
  status: string;
  routePlanningStatus: string;
  updatedAt: string;
  reasonCode: HealthReasonCode;
  reason: string;
  /** Status can ask for the route again (POST /admin/system-health/jobs/:id/retry-route). */
  canRetry: boolean;
};

export type EventGroup = {
  fingerprint: string;
  source: string;
  level: SystemEventLevel;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastEventId: number;
};

export type SystemHealthSnapshot = {
  generatedAt: string;
  overall: HealthVerdict;
  worker: {
    verdict: HealthVerdict;
    reasonCode: HealthReasonCode;
    reason: string;
    engineConfigured: boolean;
    pollMs: number;
    startedAt: string | null;
    ticks: number;
    ticking: boolean;
    lastTickFinishedAt: string | null;
    lastTickDurationMs: number | null;
    lastSuccessAt: string | null;
    lastError: { message: string; at: string } | null;
  };
  queue: {
    queuedRuns: number;
    oldestQueuedMs: number | null;
    activeRuns: ActiveRunHealth[];
    openJobs: number;
    stuckJobs: StuckJob[];
    /** The last searches, newest first, for the red/green timeline. */
    recentRuns: RecentRun[];
    failedRuns24h: number;
    completedRuns24h: number;
    failedRoutes24h: number;
  };
  events: {
    errors24h: number;
    warnings24h: number;
    bySource24h: Array<{ source: string; level: SystemEventLevel; count: number }>;
    /** The same problem grouped (fingerprint), last 7 days, most recent first. */
    groups: EventGroup[];
  };
};

/** GET /api/xpot/admin/system-events/:id — one occurrence and what surrounds it. */
export type SystemEventDetail = {
  event: SystemEventRow;
  /** Every occurrence of the same problem (fingerprint), repeats included. */
  group: { count: number; firstSeenAt: string; lastSeenAt: string };
  /** The latest occurrences of the same problem, this one included. */
  occurrences: Array<{ id: number; createdAt: string; repName: string | null; repeats: number }>;
  /** The engine search the event is about, when its context names one. */
  run: RecentRun | null;
};

export type SystemEventRow = {
  id: number;
  createdAt: string;
  level: SystemEventLevel;
  source: string;
  message: string;
  detail: string | null;
  context: Record<string, unknown>;
  repId: number | null;
  repName: string | null;
  fingerprint: string;
};

/**
 * A record that did not reach the CRM (Admin › Status › CRM sync): the latest
 * sync attempt of one entity with one provider, when it failed or needs review.
 */
export type SyncProblem = {
  /** sales_sync_events.id of that latest attempt. */
  id: number;
  /** "xphere" or "gohighlevel" (legacy). */
  provider: string;
  entityType: string;
  entityId: string;
  /** The company, the visit's or sale's company, or the task title; null when the record is gone. */
  entityName: string | null;
  /** Where the record opens in the app, when it has a page. */
  href: string | null;
  repName: string | null;
  status: "failed" | "needs_review";
  lastError: string | null;
  attemptCount: number;
  at: string | null;
  /** POST /api/xpot/sync/retry takes this entity type. */
  retryable: boolean;
};

/** The entity types POST /api/xpot/sync/retry can send again (server/routes/xpot/sync.ts). */
export const RETRYABLE_SYNC_ENTITIES: readonly string[] = ["sales_visit", "sales_lead", "sales_sale", "sales_task"];
