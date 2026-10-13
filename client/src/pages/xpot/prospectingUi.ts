export const MAX_PROSPECTING_SECTORS = 5;
export const MAX_ROUTE_CANDIDATES = 60;

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

export function prospectingProgress(input: {
  jobStatus: string;
  runs: RunProgress[];
  eligibleCount: number;
  hasRoute: boolean;
}) {
  if (input.hasRoute) return { stage: "route" as const, percent: 100 };
  if (input.jobStatus === "failed") return { stage: "failed" as const, percent: 100 };
  if (input.jobStatus === "completed") return { stage: "review" as const, percent: 82 };
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
