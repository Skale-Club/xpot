/** Bounded read-only health facts; no credentials, SQL text or provider errors escape. */
export interface ReadinessResult {
  ok: boolean;
  status: "ok" | "degraded" | "down";
  checks: { database: { ok: boolean; latency_ms: number } };
  commit: string | null;
}

export function createReadinessProbe(
  query: () => Promise<unknown>,
  commit: () => string | null,
  now: () => number = Date.now,
  ttlMs = 10_000,
): () => Promise<ReadinessResult> {
  let cached: { at: number; result: ReadinessResult } | undefined;
  let inFlight: Promise<ReadinessResult> | undefined;
  return () => {
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.result);
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const started = now();
      let ok = false;
      try { await query(); ok = true; } catch { /* Keep database details private. */ }
      const latency = Math.max(0, now() - started);
      const result: ReadinessResult = {
        ok,
        status: !ok ? "down" : latency > 1500 ? "degraded" : "ok",
        checks: { database: { ok, latency_ms: latency } },
        commit: commit(),
      };
      cached = { at: now(), result };
      return result;
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };
}
