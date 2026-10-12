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
  start: GeoPoint;
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
  optimizer: "heuristic_v1";
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
 * verifies that visiting it and returning to the configured end still fits in the shift,
 * and repeats until the stop or time budget is exhausted.
 */
export function optimizeRouteHeuristic(input: OptimizeRouteInput): OptimizeRouteResult {
  const speed = input.averageSpeedKph ?? 32;
  const end = input.end ?? input.start;
  const remaining = [...input.candidates];
  const stops: OptimizedStop[] = [];
  let current = input.start;
  let elapsedSeconds = 0;
  let totalDistanceMeters = 0;

  while (remaining.length > 0 && stops.length < input.maxStops) {
    const ranked = remaining
      .map((candidate) => {
        const distance = haversineMeters(current, candidate);
        const proximity = 100 / (1 + distance / 1000);
        return { candidate, distance, utility: candidate.score * 0.65 + proximity * 0.35 };
      })
      .sort((a, b) => b.utility - a.utility || a.distance - b.distance || a.candidate.id - b.candidate.id);

    const next = ranked.find(({ candidate, distance }) => {
      const outbound = travelSeconds(distance, speed);
      const returnDistance = haversineMeters(candidate, end);
      const returnTime = travelSeconds(returnDistance, speed);
      return elapsedSeconds + outbound + candidate.serviceDurationSeconds + returnTime <= input.shiftDurationSeconds;
    });
    if (!next) break;

    const driveSeconds = travelSeconds(next.distance, speed);
    elapsedSeconds += driveSeconds;
    totalDistanceMeters += next.distance;
    const estimatedArrivalAt = new Date(input.plannedStartAt.getTime() + elapsedSeconds * 1000);
    stops.push({
      ...next.candidate,
      position: stops.length + 1,
      travelDistanceMeters: next.distance,
      travelDurationSeconds: driveSeconds,
      estimatedArrivalAt,
    });
    elapsedSeconds += next.candidate.serviceDurationSeconds;
    current = next.candidate;
    remaining.splice(remaining.findIndex((candidate) => candidate.id === next.candidate.id), 1);
  }

  const returnDistanceMeters = stops.length ? haversineMeters(current, end) : 0;
  const returnDurationSeconds = stops.length ? travelSeconds(returnDistanceMeters, speed) : 0;
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
