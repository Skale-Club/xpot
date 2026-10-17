// The shape of Admin › System health (GET /api/xpot/admin/system-health), shared
// by the server that assesses it and the screen that shows it.

import type { SystemEventLevel } from "./schema/observability.js";

/** healthy → slow → stalled/down: "slow" still moves, "stalled" has stopped moving. */
export type HealthVerdict = "healthy" | "slow" | "stalled" | "down" | "idle";

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
  reason: string;
};

export type StuckJob = {
  jobId: number;
  repId: number;
  repName: string | null;
  location: string;
  status: string;
  routePlanningStatus: string;
  updatedAt: string;
  reason: string;
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
