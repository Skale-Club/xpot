import { describe, expect, it, vi } from "vitest";
import { createReadinessProbe } from "../server/observability/readiness.js";

describe("production readiness facts", () => {
  it("reports a successful query and exact release without provider details", async () => {
    let time = 10;
    const probe = createReadinessProbe(async () => { time += 12; }, () => "abc123", () => time);
    expect(await probe()).toEqual({ ok: true, status: "ok", checks: { database: { ok: true, latency_ms: 12 } }, commit: "abc123" });
  });

  it("distinguishes degraded latency from database failure and redacts errors", async () => {
    let time = 0;
    const slow = createReadinessProbe(async () => { time += 1501; }, () => null, () => time);
    expect((await slow()).status).toBe("degraded");
    const failed = createReadinessProbe(async () => { throw new Error("postgres://secret-password@private-host"); }, () => "sha");
    const result = await failed();
    expect(result.ok).toBe(false); expect(result.status).toBe("down");
    expect(JSON.stringify(result)).not.toContain("secret-password");
  });

  it("shares concurrent work and caches both health and failure results", async () => {
    let time = 0;
    let release: () => void = () => {};
    const query = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const probe = createReadinessProbe(query, () => "sha", () => time);
    const first = probe(), second = probe();
    expect(query).toHaveBeenCalledTimes(1);
    release(); await Promise.all([first, second]);
    await probe(); expect(query).toHaveBeenCalledTimes(1);
    time = 10_001;
    const next = probe(); expect(query).toHaveBeenCalledTimes(2); release(); await next;
  });

  it("does not query again during a cached database outage", async () => {
    const query = vi.fn(async () => { throw new Error("offline"); });
    const probe = createReadinessProbe(query, () => null);
    await probe(); await probe(); expect(query).toHaveBeenCalledTimes(1);
  });
});
