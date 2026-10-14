export type GeoPoint = { lat: number; lng: number };

export type RouteCandidate = GeoPoint & {
  id: number;
  leadId: number | null;
  candidateId?: number | null;
  name: string;
  address: string | null;
  score: number;
  scoreReasons: string[];
  serviceDurationSeconds: number;
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
export function optimizeRouteHeuristic(input: OptimizeRouteInput): OptimizeRouteResult {
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

    const next = ranked.find(({ candidate, distance }) => {
      const outbound = current ? travelSeconds(distance, speed) : 0;
      const returnTime = end ? travelSeconds(haversineMeters(candidate, end), speed) : 0;
      return elapsedSeconds + outbound + candidate.serviceDurationSeconds + returnTime <= input.shiftDurationSeconds;
    });
    if (!next) break;

    const driveSeconds = current ? travelSeconds(next.distance, speed) : 0;
    elapsedSeconds += driveSeconds;
    totalDistanceMeters += current ? next.distance : 0;
    const estimatedArrivalAt = new Date(input.plannedStartAt.getTime() + elapsedSeconds * 1000);
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
    excludedCandidateIds: remaining.map((candidate) => candidate.id),
    totalDistanceMeters,
    totalDurationSeconds: elapsedSeconds,
    returnDistanceMeters,
    returnDurationSeconds,
    optimizer: "heuristic_v1",
  };
}
