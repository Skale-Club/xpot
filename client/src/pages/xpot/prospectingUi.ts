import type { LucideIcon } from "lucide-react";
import { CheckCircle2, PencilLine, PlayCircle, ShieldCheck, XCircle } from "lucide-react";
import { ROUTE_STATUS_TONE, STOP_STATUS_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";

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

type RunProgress = {
  status: string;
  progress: number;
  wave: number;
  startedAt?: string | null;
  /** While running: businesses the engine has found so far (its partial CSV). */
  resultCount?: number;
  requestedMaxResults?: number;
};

/** From the job details API: the usual length of one engine search, and the server's clock. */
export type ProspectingTiming = { typicalRunMs: number | null; serverNow: string };

/**
 * The server's "now" for a details response fetched at `fetchedAt` (local ms):
 * run start times are server timestamps, so a phone with a wrong clock would
 * otherwise show a search running for minutes before it began.
 */
export function serverNowMs(timing: ProspectingTiming | undefined, fetchedAt: number, localNow = Date.now()) {
  const serverAtFetch = timing ? Date.parse(timing.serverNow) : NaN;
  return Number.isFinite(serverAtFetch) && fetchedAt > 0 ? serverAtFetch + (localNow - fetchedAt) : localNow;
}

/**
 * The engine only says "working", so a search's progress is its elapsed time
 * against the usual duration: about 82% at the usual time, easing toward 95%
 * and never reaching it, so a slow search still moves without claiming done.
 */
export function estimatedRunPercent(elapsedMs: number, typicalMs: number) {
  if (elapsedMs <= 0 || typicalMs <= 0) return 0;
  return Math.min(95, Math.round(95 * (1 - Math.exp((-2 * elapsedMs) / typicalMs))));
}

/** Businesses found against the run's target, up to 90%: the engine still reads their sites after the last one. */
export function foundRunPercent(run: Pick<RunProgress, "resultCount" | "requestedMaxResults">) {
  if (!run.resultCount || !run.requestedMaxResults) return 0;
  return Math.min(90, Math.round((run.resultCount / run.requestedMaxResults) * 90));
}

/** Elapsed and usual time of the search running now, for "3 of ~6 min", and what it found so far. */
export function activeRunTiming(runs: RunProgress[], typicalRunMs: number | null | undefined, nowMs: number) {
  const run = runs.find((candidate) => candidate.status === "running" && candidate.startedAt);
  if (!run?.startedAt) return null;
  const elapsedMs = Math.max(0, nowMs - Date.parse(run.startedAt));
  return {
    elapsedMs,
    typicalMs: typicalRunMs ?? null,
    found: run.resultCount ?? 0,
    target: run.requestedMaxResults ?? null,
  };
}

/**
 * What a running search is doing, in the engine's own order: it opens Maps,
 * scrolls the results, then opens each business and its website. Shown as the
 * "Now" line so a long search keeps naming a smaller step.
 */
export type SearchPhase = "opening" | "scrolling" | "collecting" | "contacts";
export function searchPhase(timing: { elapsedMs: number; typicalMs: number | null; found: number; target: number | null }): SearchPhase {
  if (timing.found === 0) return timing.elapsedMs < 25_000 ? "opening" : "scrolling";
  if (timing.target && timing.found >= timing.target) return "contacts";
  if (timing.typicalMs && timing.elapsedMs > timing.typicalMs * 0.8) return "contacts";
  return "collecting";
}

/** Whole minutes for the timing line, never "0". */
export function wholeMinutes(ms: number) {
  return Math.max(1, Math.round(ms / 60_000));
}

export type ProspectingProgressStage = "queued" | "searching" | "filtering" | "review" | "route" | "failed";

type PersistentProspectingJob = {
  id: number;
  status: string;
  createdAt: string;
  routePlanningStatus?: string;
};

/** The rep's calendar day ("2026-10-24") on this device: the key a route's routeDate is stored in. */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The search worth keeping in the global shell. Running work always wins; a
 * completed search stays visible while the server is building its route. Once
 * route planning is ready, the route itself becomes the destination. Routes are
 * same-day, so yesterday's search and route never show: they are history.
 */
export function persistentProspectingJob<
  T extends PersistentProspectingJob,
  R extends { id: number; jobId: number | null; status: string; routeDate: string },
>(
  jobs: T[],
  routes: R[],
  now = new Date(),
): { job: T; route: R | null } | null {
  const today = localDateKey(now);
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  if (activeJob) return { job: activeJob, route: routes.find((route) => route.jobId === activeJob.id) ?? null };

  const recentJob = jobs.find((job) => job.status === "completed" && localDateKey(new Date(job.createdAt)) === today);
  if (!recentJob) return null;
  const route = routes.find((candidate) => candidate.jobId === recentJob.id
    && candidate.routeDate === today
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
  /** With both, a running search's progress is estimated from its elapsed time. */
  typicalRunMs?: number | null;
  nowMs?: number;
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
        if (run.status !== "running") return sum + Math.max(5, Math.min(95, run.progress || 0));
        // Whichever says more: what the engine has found, or the time spent against the usual.
        const byTime = run.startedAt && input.typicalRunMs && input.nowMs
          ? estimatedRunPercent(input.nowMs - Date.parse(run.startedAt), input.typicalRunMs)
          : run.progress || 0;
        return sum + Math.max(5, Math.min(95, Math.max(byTime, foundRunPercent(run))));
      }, 0) / runs.length
    : 10;
  // The engine search is almost all of the wall time (minutes, against seconds
  // for filtering and routing), so it gets most of the bar.
  const searchingPercent = Math.round(8 + average * 0.75);
  // Filtering is what happens after the last search: with searches still to go
  // (more sectors, or an expansion wave) the bar keeps climbing as "searching".
  const searchesLeft = runs.some((run) => ["queued", "starting", "running"].includes(run.status));
  if (!searchesLeft && (input.eligibleCount > 0 || runs.some((run) => run.status === "completed"))) {
    return { stage: "filtering" as const, percent: Math.max(80, Math.min(86, searchingPercent)) };
  }
  return { stage: "searching" as const, percent: Math.max(8, Math.min(80, searchingPercent)) };
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
  return eligibleCandidates(candidates)
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

const ACTIVE_ROUTE_STATUSES = ["draft", "published", "in_progress"];

/**
 * "Today's route": the day's open route (draft, published or in progress),
 * the one the Route screen opens. The Dashboard falls back to a route already
 * completed today so a finished day still shows its progress.
 */
export function todayRouteOf<T extends { routeDate: string; status: string }>(
  routes: T[] | undefined,
  day: string,
  { includeCompleted = false } = {},
): T | undefined {
  const ofDay = (routes ?? []).filter((route) => route.routeDate === day);
  return ofDay.find((route) => ACTIVE_ROUTE_STATUSES.includes(route.status))
    ?? (includeCompleted ? ofDay.find((route) => route.status === "completed") : undefined);
}

/**
 * Whether a route was used: at least one of its stops got a check-in. The
 * routes list carries the counts (GET /prospecting/routes).
 */
export function routeUsage(route: { stopCount?: number; visitedStopCount?: number }) {
  const visited = route.visitedStopCount ?? 0;
  return { used: visited > 0, visited, total: route.stopCount ?? 0 };
}

/** Routes grouped by day, newest first, keeping the list's order inside a day. */
export function routesByDay<T extends { routeDate: string }>(routes: T[]) {
  const days: Array<{ day: string; routes: T[] }> = [];
  for (const route of [...routes].sort((a, b) => b.routeDate.localeCompare(a.routeDate))) {
    const last = days[days.length - 1];
    if (last?.day === route.routeDate) last.routes.push(route);
    else days.push({ day: route.routeDate, routes: [route] });
  }
  return days;
}

/**
 * The route built from a search (job). No job, no route: a route whose job is
 * gone (the link is cleared when a job is deleted) or that was built without
 * one has jobId null, and must not count as the route of "no job", or it
 * would open itself every time the Route screen shows its list.
 */
export function routeOfJob<T extends { jobId: number | null }>(routes: T[] | undefined, jobId: number | null): T | undefined {
  if (jobId === null) return undefined;
  return (routes ?? []).find((route) => route.jobId === jobId);
}

/** Stops behind the rep: visited or skipped (a cancelled visit skips its stop). */
export function isStopDone(status: string) {
  return status === "completed" || status === "skipped";
}

export function routeStopProgress(stops: { status: string }[]) {
  const done = stops.filter((stop) => isStopDone(stop.status)).length;
  return { done, total: stops.length, percent: stops.length ? Math.round((done / stops.length) * 100) : 0 };
}

export type StopMarkerTone = { background: string; border: string; text: string; glyph: string | null };

/** Marker colours per stop state; the map legend draws its swatches from the same table. */
export const STOP_MARKER_TONES = {
  done: { background: "#0f172a", border: "#065f46", text: "#34d399", glyph: "✓" },
  skipped: { background: "#0f172a", border: "#334155", text: "#64748b", glyph: "↷" },
  current: { background: "#3b82f6", border: "#93c5fd", text: "#ffffff", glyph: null },
  next: { background: "#172554", border: "#60a5fa", text: "#bfdbfe", glyph: null },
  planned: { background: "#1f2937", border: "#475569", text: "#94a3b8", glyph: null },
} as const satisfies Record<string, StopMarkerTone>;

/** The other points on the route map: where the route starts, the rep's home and the rep now. */
export const MAP_POINT_TONES = {
  start: { background: "#e2e8f0", border: "#0f172a", text: "#0f172a" },
  home: { background: "#0f172a", border: "#e2e8f0", text: "#e2e8f0" },
  you: { background: "#2563eb", border: "#ffffff", text: "#ffffff" },
} as const;

/**
 * How a route stop looks on the map, in the list rail and in its preview:
 * done and skipped stops are muted with a check / skip glyph so they never
 * pass for a future stop; the current stop is solid blue and the next one a
 * lighter blue outline (violet is the Tags accent, not used in Visits).
 */
export function stopMarkerTone(
  stop: { id: number; status: string },
  currentStopId: number | null,
  nextStopId: number | null,
): StopMarkerTone {
  if (stop.status === "completed") return STOP_MARKER_TONES.done;
  if (stop.status === "skipped") return STOP_MARKER_TONES.skipped;
  if (stop.id === currentStopId) return STOP_MARKER_TONES.current;
  if (stop.id === nextStopId) return STOP_MARKER_TONES.next;
  return STOP_MARKER_TONES.planned;
}

// ─── Route and stop status ────────────────────────────────────────────────────
// One label, tone and icon per route status, so the Route screen, its history
// and the Dashboard card say the same thing in the same colour. The tones live
// with the other pill maps (components/xpot/StatusPill.tsx).

export { ROUTE_STATUS_TONE, STOP_STATUS_TONE };

export type RouteStatus = "draft" | "published" | "in_progress" | "completed" | "cancelled";

/** Keys of prospectingMessages that name a route status. */
export type RouteStatusLabelKey = "routeDraft" | "routeNotStarted" | "published" | "routeInProgress" | "routeUnfinished" | "routeCompleted" | "routeCancelled";

/** The message key for a route status; a draft from a past day was never started. */
export function routeStatusLabelKey(status: string, isPast = false): RouteStatusLabelKey {
  if (status === "draft") return isPast ? "routeNotStarted" : "routeDraft";
  // Routes are same-day: one left open on a past day was simply not finished.
  if (isPast && (status === "published" || status === "in_progress")) return "routeUnfinished";
  if (status === "in_progress") return "routeInProgress";
  if (status === "completed") return "routeCompleted";
  if (status === "cancelled") return "routeCancelled";
  return "published";
}

/** "Draft route", "Route in progress"… with `t` = useT(prospectingMessages). */
export function routeStatusLabel(status: string, t: (key: RouteStatusLabelKey) => string, isPast = false) {
  return t(routeStatusLabelKey(status, isPast));
}

export function routeStatusTone(status: string): PillTone {
  return toneOf(ROUTE_STATUS_TONE, status);
}

/** A check only for a finished route; a draft or a cancelled one never reads as done. */
export const ROUTE_STATUS_ICON: Record<RouteStatus, LucideIcon> = {
  draft: PencilLine,
  published: ShieldCheck,
  in_progress: PlayCircle,
  completed: CheckCircle2,
  cancelled: XCircle,
};

export function routeStatusIcon(status: string): LucideIcon {
  return ROUTE_STATUS_ICON[status as RouteStatus] ?? PencilLine;
}

/** Keys of prospectingMessages that name a stop status. */
export type StopStatusLabelKey = "stopPlanned" | "stopEnRoute" | "stopCheckedIn" | "stopCompleted" | "stopSkipped" | "stopRescheduled";

export function stopStatusLabelKey(status: string): StopStatusLabelKey {
  if (status === "checked_in") return "stopCheckedIn";
  if (status === "completed") return "stopCompleted";
  if (status === "skipped") return "stopSkipped";
  if (status === "en_route") return "stopEnRoute";
  if (status === "rescheduled") return "stopRescheduled";
  return "stopPlanned";
}

export function stopStatusTone(status: string): PillTone {
  return toneOf(STOP_STATUS_TONE, status);
}

/** Stops the rep can still check in to. */
export function isStopOpen(status: string) {
  return status === "planned" || status === "en_route";
}

// ─── Search results ───────────────────────────────────────────────────────────

/** The places a route can still use: the same ones selectableCandidateIds sends. */
export function eligibleCandidates<T extends { status: string }>(candidates: T[]) {
  return candidates.filter((candidate) => candidate.status !== "discarded" && candidate.status !== "visited");
}

/**
 * Whether a finished search fills the day: "none" found, a "short" route (fewer
 * places than the job's internal stop target) or a "full" one.
 */
export function routeFill(eligibleCount: number, targetStops: number): "none" | "short" | "full" {
  if (eligibleCount <= 0) return "none";
  return targetStops > 0 && eligibleCount < targetStops ? "short" : "full";
}

// ─── Map ──────────────────────────────────────────────────────────────────────

/** Two points closer than ~50 m are one place on the map (the route start is usually stop 1). */
export function samePlace(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const metersPerDegree = 111_320;
  const dLat = (a.lat - b.lat) * metersPerDegree;
  const dLng = (a.lng - b.lng) * metersPerDegree * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) < 50;
}
