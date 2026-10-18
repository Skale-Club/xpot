// Pure rules shared by the Integrations hub and Status, kept apart so they are
// unit-tested. Both screens read one list, GET /api/xpot/admin/integrations/services.

import type { ServiceStatus } from "@shared/integrations-registry";
import type { HealthVerdict, SystemHealthSnapshot } from "@shared/system-health";

export const SERVICES_KEY = ["/api/xpot/admin/integrations/services"] as const;
export const SYNC_PROBLEMS_KEY = ["/api/xpot/admin/system-health/sync-problems"] as const;

/** The element id of a service on the Integrations hub (and the #hash Status links to). */
export function serviceAnchor(id: string): string {
  return `service-${id}`;
}

/** Where Status sends someone to fix a service: its card on the Integrations hub. */
export function serviceHref(id: string): string {
  return `/admin/integrations#${serviceAnchor(id)}`;
}

/** The services that need a step from the admin: switched on but incomplete. */
export function servicesNeedingAttention(services: readonly ServiceStatus[]): ServiceStatus[] {
  return services.filter((service) => service.status === "broken");
}

/** For a job with a primary and a fallback: the one doing the work, or null when none is usable. */
export function activeInChain(services: readonly ServiceStatus[], ids: readonly string[]): ServiceStatus | null {
  return services.find((service) => ids.includes(service.id) && service.active) ?? null;
}

export type StatusCause = "worker" | "runs" | "stuck" | "services" | "sync";

/** The section of the Status page each cause points at. */
export const CAUSE_ANCHOR: Record<StatusCause, string> = {
  worker: "status-worker",
  runs: "status-runs",
  stuck: "status-runs",
  services: "status-services",
  sync: "status-sync",
};

const RANK: Record<HealthVerdict, number> = { idle: 0, healthy: 1, slow: 2, stalled: 3, down: 4 };

/**
 * The overall verdict of the Status page and what causes it, worst first: the
 * prospecting pipeline as the server judged it, plus an incomplete service
 * (down) and records that did not reach the CRM (slow: work still goes on).
 */
export function statusOverview(
  snapshot: Pick<SystemHealthSnapshot, "overall" | "worker" | "queue">,
  services: readonly ServiceStatus[],
  syncProblems: number,
): { verdict: HealthVerdict; causes: StatusCause[] } {
  const found: { cause: StatusCause; verdict: HealthVerdict }[] = [];
  if (RANK[snapshot.worker.verdict] > RANK.healthy) found.push({ cause: "worker", verdict: snapshot.worker.verdict });
  const runs = snapshot.queue.activeRuns.filter((run) => RANK[run.verdict] > RANK.healthy);
  if (runs.length) found.push({ cause: "runs", verdict: runs.reduce<HealthVerdict>((w, r) => (RANK[r.verdict] > RANK[w] ? r.verdict : w), "slow") });
  if (snapshot.queue.stuckJobs.length) found.push({ cause: "stuck", verdict: "stalled" });
  if (servicesNeedingAttention(services).length) found.push({ cause: "services", verdict: "down" });
  if (syncProblems > 0) found.push({ cause: "sync", verdict: "slow" });

  let verdict = snapshot.overall;
  for (const item of found) if (RANK[item.verdict] > RANK[verdict]) verdict = item.verdict;
  // "Nothing running" only while nothing else needs a look.
  if (verdict === "idle" && found.length) verdict = "slow";
  const causes = found.sort((a, b) => RANK[b.verdict] - RANK[a.verdict]).map((item) => item.cause);
  return { verdict, causes };
}

/** The path of the screen an event happened on, from its context's url; null when it has none. */
export function eventScreenPath(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url, "http://xpot.local");
    return parsed.pathname || null;
  } catch {
    return null;
  }
}
