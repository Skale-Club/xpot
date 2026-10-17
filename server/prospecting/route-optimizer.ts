export type GeoPoint = { lat: number; lng: number };

export type TimeWindow = { start: Date; end: Date };

export type RouteCandidate = GeoPoint & {
  id: number;
  leadId: number | null;
  candidateId?: number | null;
  name: string;
  address: string | null;
  score: number;
  scoreReasons: string[];
  serviceDurationSeconds: number;
  /**
   * When the business is open that day. A visit must start and finish inside
   * one window. Absent or null when the hours are unknown; empty when closed.
   */
  openWindows?: TimeWindow[] | null;
};

export type OptimizedStop = RouteCandidate & {
  position: number;
  travelDistanceMeters: number;
  travelDurationSeconds: number;
  estimatedArrivalAt: Date;
};

export type OptimizeRouteInput = {
  /** Optional navigation origin. Selling routes omit it so the work clock starts at visit one. */
  start?: GeoPoint;
  /** Where the day must finish (the rep's home). Without it the route ends at the last visit. */
  end?: GeoPoint;
  plannedStartAt: Date;
  shiftDurationSeconds: number;
  maxStops: number;
  candidates: RouteCandidate[];
  averageSpeedKph?: number;
};

export type OptimizeRouteResult = {
  stops: OptimizedStop[];
  excludedCandidateIds: number[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  returnDistanceMeters: number;
  returnDurationSeconds: number;
  optimizer: "heuristic_v1" | "google_route_optimization_v1";
  encodedPolyline?: string;
  trafficAware?: boolean;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h)));
}
/** How long the heuristic may wait at the door for a business to open. */
const MAX_WAIT_SECONDS = 30 * 60;

/**
 * The open windows a visit could use between `from` and `until`, trimmed to
 * that span. `null` when the business has no known hours (no constraint).
 */
export function usableOpenWindows(candidate: RouteCandidate, from: Date, until: Date): TimeWindow[] | null {
  if (!candidate.openWindows) return null;
  const serviceMs = candidate.serviceDurationSeconds * 1000;
  const trimmed = candidate.openWindows
    .map((window) => ({
      start: Math.max(window.start.getTime(), from.getTime()),
      end: Math.min(window.end.getTime(), until.getTime()),
    }))
    .filter((window) => window.end > window.start)
    .sort((a, b) => a.start - b.start);
  // Sorted and non-overlapping, as Google's time windows require.
  const merged: Array<{ start: number; end: number }> = [];
  for (const window of trimmed) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged
    .filter((window) => window.end - window.start >= serviceMs)
    .map((window) => ({ start: new Date(window.start), end: new Date(window.end) }));
}

/** Splits off the businesses that are closed for the whole route window. */
export function withoutClosedCandidates(input: OptimizeRouteInput) {
  const until = new Date(input.plannedStartAt.getTime() + input.shiftDurationSeconds * 1000);
  const open: RouteCandidate[] = [];
  const closedIds: number[] = [];
  for (const candidate of input.candidates) {
    const windows = usableOpenWindows(candidate, input.plannedStartAt, until);
    if (windows && !windows.length) closedIds.push(candidate.id);
    else open.push(candidate);
  }
  return { input: { ...input, candidates: open }, closedIds };
}

/** When a visit arriving at `arrival` can start, or null when the business will not be open for it. */
function visitStartFor(candidate: RouteCandidate, arrival: Date, windows: TimeWindow[] | null, maxWaitSeconds: number) {
  if (!windows) return arrival;
  const serviceMs = candidate.serviceDurationSeconds * 1000;
  for (const window of windows) {
    const start = Math.max(arrival.getTime(), window.start.getTime());
    if (start - arrival.getTime() > maxWaitSeconds * 1000) continue;
    if (start + serviceMs <= window.end.getTime()) return new Date(start);
  }
  return null;
}

function travelSeconds(distanceMeters: number, averageSpeedKph: number): number {
  const metersPerSecond = Math.max(5, averageSpeedKph) * 1000 / 3600;
  return Math.max(60, Math.round(distanceMeters / metersPerSecond));
}

/**
 * Deterministic, explainable fallback for the first route slice.
 *
 * It is not a replacement for a road-time optimizer. It chooses a high-value nearby stop,
 * verifies that visiting it (and returning to the configured end, when there is one) still fits in the shift,
 * and repeats until the stop or time budget is exhausted.
 */
export function optimizeRouteHeuristic(routeInput: OptimizeRouteInput): OptimizeRouteResult {
  const { input, closedIds } = withoutClosedCandidates(routeInput);
  const routeEndAt = new Date(input.plannedStartAt.getTime() + input.shiftDurationSeconds * 1000);
  const speed = input.averageSpeedKph ?? 32;
  const end = input.end ?? null;
  const remaining = [...input.candidates];
  const stops: OptimizedStop[] = [];
  let current = input.start ?? null;
  let elapsedSeconds = 0;
  let totalDistanceMeters = 0;

  while (remaining.length > 0 && stops.length < input.maxStops) {
    const ranked = remaining
      .map((candidate) => {
        // With no navigation origin, use the candidates' center only to choose
        // a stable first visit. That virtual distance is never charged to the
        // work window: the first visit begins at plannedStartAt.
        const reference = current ?? {
          lat: remaining.reduce((sum, item) => sum + item.lat, 0) / remaining.length,
          lng: remaining.reduce((sum, item) => sum + item.lng, 0) / remaining.length,
        };
        const distance = haversineMeters(reference, candidate);
        const proximity = 100 / (1 + distance / 1000);
        return { candidate, distance, utility: candidate.score * 0.65 + proximity * 0.35 };
      })
      .sort((a, b) => b.utility - a.utility || a.distance - b.distance || a.candidate.id - b.candidate.id);

    let next: (typeof ranked)[number] & { visitStartAt: Date } | undefined;
    for (const option of ranked) {
      const outbound = current ? travelSeconds(option.distance, speed) : 0;
      const returnTime = end ? travelSeconds(haversineMeters(option.candidate, end), speed) : 0;
      // The visit has to happen while the business is open, waiting briefly at the door if it opens soon.
      const arrival = new Date(input.plannedStartAt.getTime() + (elapsedSeconds + outbound) * 1000);
      // Before visit one the rep can simply start later, so only later visits limit the wait.
      const maxWait = stops.length ? MAX_WAIT_SECONDS : input.shiftDurationSeconds;
      const visitStartAt = visitStartFor(option.candidate, arrival, usableOpenWindows(option.candidate, input.plannedStartAt, routeEndAt), maxWait);
      if (!visitStartAt) continue;
      const startOffsetSeconds = Math.round((visitStartAt.getTime() - input.plannedStartAt.getTime()) / 1000);
      if (startOffsetSeconds + option.candidate.serviceDurationSeconds + returnTime > input.shiftDurationSeconds) continue;
      next = { ...option, visitStartAt };
      break;
    }
    if (!next) break;

    const driveSeconds = current ? travelSeconds(next.distance, speed) : 0;
    totalDistanceMeters += current ? next.distance : 0;
    const estimatedArrivalAt = next.visitStartAt;
    elapsedSeconds = Math.round((estimatedArrivalAt.getTime() - input.plannedStartAt.getTime()) / 1000);
    stops.push({
      ...next.candidate,
      position: stops.length + 1,
      travelDistanceMeters: current ? next.distance : 0,
      travelDurationSeconds: driveSeconds,
      estimatedArrivalAt,
    });
    elapsedSeconds += next.candidate.serviceDurationSeconds;
    current = next.candidate;
    remaining.splice(remaining.findIndex((candidate) => candidate.id === next.candidate.id), 1);
  }

  const returnDistanceMeters = stops.length && end && current ? haversineMeters(current, end) : 0;
  const returnDurationSeconds = stops.length && end ? travelSeconds(returnDistanceMeters, speed) : 0;
  totalDistanceMeters += returnDistanceMeters;
  elapsedSeconds += returnDurationSeconds;

  return {
    stops,
    excludedCandidateIds: [...remaining.map((candidate) => candidate.id), ...closedIds],
    totalDistanceMeters,
    totalDurationSeconds: elapsedSeconds,
    returnDistanceMeters,
    returnDurationSeconds,
    optimizer: "heuristic_v1",
  };
}
