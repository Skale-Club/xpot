export const MAX_PROSPECTING_SECTORS = 5;
export const MAX_ROUTE_CANDIDATES = 60;

export type RouteDropPlacement = "before" | "after";

export function reorderIdsAroundTarget(
  ids: number[],
  sourceId: number,
  targetId: number,
  placement: RouteDropPlacement,
) {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const reordered = ids.filter((id) => id !== sourceId);
  const targetIndex = reordered.indexOf(targetId);
  reordered.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceId);
  return reordered;
}

export function moveIdByOffset(ids: number[], sourceId: number, offset: -1 | 1) {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= ids.length) return ids;
  const reordered = [...ids];
  [reordered[sourceIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[sourceIndex]];
  return reordered;
}

export type SectorSearch = { query: string; niche: string };

function sectorNiche(query: string) {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function parseSectorSearches(value: string) {
  const parsed = value
    .split(/[,;\n]/)
    .map((sector) => sector.trim())
    .filter(Boolean)
    .map((query) => ({ query, niche: sectorNiche(query) }))
    .filter((search) => search.niche.length >= 2);
  const unique = parsed.filter(
    (search, index) => parsed.findIndex((other) => other.niche === search.niche) === index,
  );
  return {
    searches: unique.slice(0, MAX_PROSPECTING_SECTORS),
    total: unique.length,
    overflow: Math.max(0, unique.length - MAX_PROSPECTING_SECTORS),
    duplicateCount: parsed.length - unique.length,
  };
}

type RunProgress = { status: string; progress: number; wave: number };

export type ProspectingProgressStage = "queued" | "searching" | "filtering" | "review" | "route" | "failed";

type PersistentProspectingJob = {
  id: number;
  status: string;
  createdAt: string;
  routePlanningStatus?: string;
};

/**
 * The search worth keeping in the global shell. Running work always wins; a
 * completed search stays visible while the server is building its route. Once
 * route planning is ready, the route itself becomes the destination.
 */
export function persistentProspectingJob<
  T extends PersistentProspectingJob,
  R extends { id: number; jobId: number | null; status: string; createdAt?: string | Date | null },
>(
  jobs: T[],
  routes: R[],
  now = new Date(),
): { job: T; route: R | null } | null {
  const recentCutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  if (activeJob) return { job: activeJob, route: routes.find((route) => route.jobId === activeJob.id) ?? null };

  const recentJob = jobs.find((job) => job.status === "completed" && new Date(job.createdAt).getTime() >= recentCutoff);
  if (!recentJob) return null;
  const route = routes.find((candidate) => candidate.jobId === recentJob.id
    && !["completed", "cancelled"].includes(candidate.status)) ?? null;
  if (route) return { job: recentJob, route };
  return recentJob.routePlanningStatus !== "ready" ? { job: recentJob, route: null } : null;
}

export function prospectingProgress(input: {
  jobStatus: string;
  runs: RunProgress[];
  eligibleCount: number;
  hasRoute: boolean;
  routePlanningStatus?: string;
}) {
  if (input.hasRoute) return { stage: "route" as const, percent: 100 };
  if (input.routePlanningStatus === "failed") return { stage: "failed" as const, percent: 100 };
  if (input.jobStatus === "failed") return { stage: "failed" as const, percent: 100 };
  if (input.jobStatus === "completed") {
    return { stage: "review" as const, percent: input.routePlanningStatus === "building" ? 94 : 88 };
  }
  if (input.jobStatus === "queued") return { stage: "queued" as const, percent: 8 };

  const runs = input.runs;
  const average = runs.length
    ? runs.reduce((sum, run) => {
        if (run.status === "completed") return sum + 100;
        if (run.status === "failed" || run.status === "cancelled") return sum;
        return sum + Math.max(5, Math.min(95, run.progress || 0));
      }, 0) / runs.length
    : 10;
  const searchingPercent = Math.round(14 + average * 0.5);
  if (input.eligibleCount > 0 || runs.some((run) => run.status === "completed")) {
    return { stage: "filtering" as const, percent: Math.max(58, Math.min(76, searchingPercent)) };
  }
  return { stage: "searching" as const, percent: Math.max(14, Math.min(56, searchingPercent)) };
}

export function exclusionCounts(candidates: Array<{ status: string; exclusionReason?: string | null }>) {
  return candidates.reduce<Record<string, number>>((counts, candidate) => {
    if (candidate.status !== "discarded") return counts;
    const reason = candidate.exclusionReason || "other";
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});
}

export function selectableCandidateIds(candidates: Array<{ id: number; status: string }>) {
  return candidates
    .filter((candidate) => candidate.status !== "discarded" && candidate.status !== "visited")
    .slice(0, MAX_ROUTE_CANDIDATES)
    .map((candidate) => candidate.id);
}

export function routeDateLabel(routeDate: string, locale: string, referenceDate = new Date()) {
  const date = new Date(`${routeDate}T12:00:00`);
  const includeYear = date.getFullYear() !== referenceDate.getFullYear();
  return date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: includeYear ? "numeric" : undefined });
}

export function routeDisplayName(route: { name: string; routeDate: string }, locale: string, referenceDate = new Date()) {
  const generatedNames = [`Prospecting — ${route.routeDate}`, `Route — ${route.routeDate}`];
  return generatedNames.includes(route.name.trim()) ? routeDateLabel(route.routeDate, locale, referenceDate) : route.name;
}
