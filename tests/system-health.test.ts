// Admin › System health has to say "stuck" only when something stopped moving:
// a long search that the engine still answers is slow, not stuck, and a repeat
// of the same failure every worker tick must not flood the log.

import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db.js", () => ({ db: {} }));
import { assessRun, assessWorker, toRecentRun, worstVerdict } from "../server/observability/health.js";
import { median } from "../server/prospecting/job-status.js";
import { describeError, fingerprintOf, REPEAT_WINDOW_MS, takeRepeat } from "../server/observability/events.js";

const MIN = 60_000;
const base = { status: "running" as const, engineJobId: "e1", pollMs: 30_000, maxTimeMs: 30 * MIN, typicalMs: 6 * MIN };

describe("assessRun", () => {
  it("calls a search inside its usual time healthy", () => {
    expect(assessRun({ ...base, elapsedMs: 5 * MIN, sinceUpdateMs: 10_000 }).verdict).toBe("healthy");
  });
  it("calls a long search the worker still checks slow, not stuck", () => {
    expect(assessRun({ ...base, elapsedMs: 14 * MIN, sinceUpdateMs: 10_000 }).verdict).toBe("slow");
  });
  it("calls a search nobody checked for three polls stuck", () => {
    expect(assessRun({ ...base, elapsedMs: 5 * MIN, sinceUpdateMs: 2 * MIN }).verdict).toBe("stalled");
  });
  it("calls a start the engine never confirmed stuck", () => {
    expect(assessRun({ ...base, status: "starting", engineJobId: null, elapsedMs: 3 * MIN, sinceUpdateMs: 10_000 }).verdict).toBe("stalled");
  });
  it("calls a search past the engine's limit stuck", () => {
    expect(assessRun({ ...base, elapsedMs: 31 * MIN, sinceUpdateMs: 10_000 }).verdict).toBe("stalled");
  });
  it("falls back to 15 minutes without history", () => {
    expect(assessRun({ ...base, typicalMs: null, elapsedMs: 14 * MIN, sinceUpdateMs: 1000 }).verdict).toBe("healthy");
    expect(assessRun({ ...base, typicalMs: null, elapsedMs: 16 * MIN, sinceUpdateMs: 1000 }).verdict).toBe("slow");
  });
});

describe("assessWorker", () => {
  const now = Date.now();
  const worker = {
    engineConfigured: true,
    startedAt: new Date(now - 60 * MIN),
    lastTickFinishedAt: new Date(now - 10_000),
    lastSuccessAt: new Date(now - 10_000),
    lastError: null,
    ticking: false,
    pollMs: 30_000,
    now,
  };
  it("is healthy while ticking", () => expect(assessWorker(worker).verdict).toBe("healthy"));
  it("is down without an engine", () => expect(assessWorker({ ...worker, engineConfigured: false }).verdict).toBe("down"));
  it("is down when the ticks stop", () => expect(assessWorker({ ...worker, lastTickFinishedAt: new Date(now - 5 * MIN) }).verdict).toBe("down"));
  it("is stuck when the last tick failed", () => {
    expect(assessWorker({ ...worker, lastSuccessAt: new Date(now - 40_000), lastError: { message: "boom", at: new Date(now - 10_000) } }).verdict).toBe("stalled");
  });
});

describe("reason codes", () => {
  const now = Date.now();
  const worker = {
    engineConfigured: true,
    startedAt: new Date(now - 60 * MIN),
    lastTickFinishedAt: new Date(now - 10_000),
    lastSuccessAt: new Date(now - 10_000),
    lastError: null,
    ticking: false,
    pollMs: 30_000,
    now,
  };
  const codes = [
    assessRun({ ...base, elapsedMs: 5 * MIN, sinceUpdateMs: 10_000 }),
    assessRun({ ...base, elapsedMs: 14 * MIN, sinceUpdateMs: 10_000 }),
    assessRun({ ...base, elapsedMs: 5 * MIN, sinceUpdateMs: 2 * MIN }),
    assessRun({ ...base, status: "starting", engineJobId: null, elapsedMs: 3 * MIN, sinceUpdateMs: 10_000 }),
    assessRun({ ...base, elapsedMs: 31 * MIN, sinceUpdateMs: 10_000 }),
    assessWorker(worker),
    assessWorker({ ...worker, engineConfigured: false }),
    assessWorker({ ...worker, startedAt: null }),
    assessWorker({ ...worker, lastTickFinishedAt: new Date(now - 5 * MIN) }),
    assessWorker({ ...worker, ticking: true, lastTickFinishedAt: new Date(now - 5 * MIN) }),
    assessWorker({ ...worker, lastSuccessAt: new Date(now - 40_000), lastError: { message: "boom", at: new Date(now - 10_000) } }),
  ].map((a) => a.reasonCode);

  it("name each verdict with a stable code, not only English text", () => {
    expect(codes).toEqual([
      "running_normally",
      "slower_than_usual",
      "run_not_checked",
      "engine_never_confirmed",
      "past_time_limit",
      "ticking_normally",
      "engine_not_configured",
      "worker_not_running",
      "worker_not_ticking",
      "tick_running_long",
      "last_tick_failed",
    ]);
  });

  it("are all worded on screen, with a what-to-do line for each problem", async () => {
    const { systemHealthMessages } = await import("../client/src/i18n/messages/systemHealth");
    const all = [...codes, "route_building_stuck", "route_not_built"];
    const healthy = new Set(["running_normally", "ticking_normally"]);
    for (const code of all) {
      expect(systemHealthMessages.en, code).toHaveProperty(`reason_${code}`);
      if (!healthy.has(code)) expect(systemHealthMessages.en, code).toHaveProperty(`todo_${code}`);
    }
  });
});

describe("helpers", () => {
  it("picks the worst verdict", () => {
    expect(worstVerdict(["healthy", "slow", "healthy"])).toBe("slow");
    expect(worstVerdict(["slow", "down", "stalled"])).toBe("down");
  });
  it("takes the median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
  it("groups the same failure despite ids in the message", () => {
    expect(fingerprintOf("api", "Run 12 failed")).toBe(fingerprintOf("api", "Run 98 failed"));
    expect(fingerprintOf("api", "Run 12 failed")).not.toBe(fingerprintOf("push", "Run 12 failed"));
  });
  it("writes one row per window and counts the repeats", () => {
    const fp = `test-${Math.random()}`;
    const t0 = 1_000_000;
    expect(takeRepeat(fp, t0)).toEqual({ write: true, suppressed: 0 });
    expect(takeRepeat(fp, t0 + 1000).write).toBe(false);
    expect(takeRepeat(fp, t0 + 2000).write).toBe(false);
    expect(takeRepeat(fp, t0 + REPEAT_WINDOW_MS + 1)).toEqual({ write: true, suppressed: 2 });
  });
  it("describes errors and non-errors", () => {
    expect(describeError(new Error("x")).message).toBe("x");
    expect(describeError("plain").message).toBe("plain");
    expect(describeError({ a: 1 }).detail).toBe('{"a":1}');
  });
});

describe("toRecentRun", () => {
  const run = {
    id: 7, jobId: 3, repId: 1, status: "failed", query: "Barber shop", location: "Buffalo, NY", wave: 0,
    createdAt: new Date("2026-10-17T13:55:00Z"), startedAt: new Date("2026-10-17T13:55:56Z"),
    completedAt: new Date("2026-10-17T14:01:08Z"), resultCount: 0, errorMessage: "Prospecting engine job failed.",
  } as never;

  it("gives the timeline a duration and the reason a search failed", () => {
    expect(toRecentRun(run, "Rep")).toMatchObject({
      runId: 7, jobId: 3, repName: "Rep", status: "failed", durationMs: 312_000,
      startedAt: "2026-10-17T13:55:56.000Z", errorMessage: "Prospecting engine job failed.",
    });
  });

  it("has no duration while a search is still running", () => {
    expect(toRecentRun({ ...(run as object), status: "running", completedAt: null } as never, null).durationMs).toBeNull();
  });
});
