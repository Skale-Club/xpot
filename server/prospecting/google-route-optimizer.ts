import { GoogleAuth } from "google-auth-library";
import {
  optimizeRouteHeuristic,
  type OptimizeRouteInput,
  type OptimizeRouteResult,
  type OptimizedStop,
} from "./route-optimizer.js";

const ROUTE_OPTIMIZATION_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const REQUEST_TIMEOUT_MS = 45_000;

type GoogleVisit = {
  shipmentIndex?: number;
  startTime?: string;
};

type GoogleTransition = {
  travelDuration?: string;
  travelDistanceMeters?: number;
};

type GoogleRoute = {
  visits?: GoogleVisit[];
  transitions?: GoogleTransition[];
  vehicleStartTime?: string;
  vehicleEndTime?: string;
  routePolyline?: { points?: string };
  metrics?: { totalDuration?: string; travelDistanceMeters?: number };
};

type GoogleOptimizeResponse = {
  routes?: GoogleRoute[];
  skippedShipments?: Array<{ index?: number }>;
};

export class GoogleRouteOptimizationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GoogleRouteOptimizationError";
  }
}

export function getGoogleRouteOptimizationConfig() {
  const projectId = process.env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID?.trim();
  if (!projectId) return null;
  const credentialsFile = process.env.GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_FILE?.trim();
  const credentialsJson = process.env.GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_JSON?.trim();
  let credentials: Record<string, unknown> | undefined;
  if (credentialsJson) {
    try {
      credentials = JSON.parse(credentialsJson) as Record<string, unknown>;
    } catch {
      throw new GoogleRouteOptimizationError("GOOGLE_ROUTE_OPTIMIZATION_CREDENTIALS_JSON is not valid JSON.");
    }
  }
  return { projectId, credentialsFile: credentialsFile || undefined, credentials };
}

export function isGoogleRouteOptimizationConfigured() {
  return getGoogleRouteOptimizationConfig() !== null;
}

function seconds(value: string | undefined) {
  if (!value?.endsWith("s")) return 0;
  const parsed = Number(value.slice(0, -1));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function googleTimestamp(date: Date) {
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

export function buildGoogleOptimizeToursRequest(input: OptimizeRouteInput) {
  const endAt = new Date(input.plannedStartAt.getTime() + input.shiftDurationSeconds * 1000);
  return {
    timeout: "30s",
    considerRoadTraffic: true,
    populatePolylines: true,
    model: {
      globalStartTime: googleTimestamp(input.plannedStartAt),
      globalEndTime: googleTimestamp(endAt),
      shipments: input.candidates.map((candidate) => ({
        label: String(candidate.id),
        loadDemands: { visit_count: { amount: "1" } },
        deliveries: [{
          arrivalLocation: { latitude: candidate.lat, longitude: candidate.lng },
          duration: `${candidate.serviceDurationSeconds}s`,
          label: String(candidate.id),
        }],
        // A missed prospect is expensive enough that the solver first maximizes
        // useful visits, then minimizes road time. Score resolves close choices.
        penaltyCost: 100_000 + candidate.score * 100,
      })),
      vehicles: [{
        label: "xpot-daily-route",
        startLocation: { latitude: input.start.lat, longitude: input.start.lng },
        endLocation: {
          latitude: (input.end ?? input.start).lat,
          longitude: (input.end ?? input.start).lng,
        },
        startTimeWindows: [{ startTime: googleTimestamp(input.plannedStartAt), endTime: googleTimestamp(input.plannedStartAt) }],
        endTimeWindows: [{ startTime: googleTimestamp(input.plannedStartAt), endTime: googleTimestamp(endAt) }],
        loadLimits: { visit_count: { maxLoad: String(input.maxStops) } },
        costPerKilometer: 1,
        costPerHour: 30,
      }],
    },
  };
}

export function parseGoogleOptimizeToursResponse(
  input: OptimizeRouteInput,
  response: GoogleOptimizeResponse,
): OptimizeRouteResult {
  const route = response.routes?.[0];
  const visits = route?.visits ?? [];
  const transitions = route?.transitions ?? [];
  const visitedIndices = new Set<number>();
  const stops: OptimizedStop[] = [];

  for (let position = 0; position < visits.length; position++) {
    const visit = visits[position];
    const shipmentIndex = visit.shipmentIndex;
    if (shipmentIndex === undefined) continue;
    const candidate = input.candidates[shipmentIndex];
    if (!candidate || stops.length >= input.maxStops) continue;
    visitedIndices.add(shipmentIndex);
    const transition = transitions[position] ?? {};
    const arrival = visit.startTime ? new Date(visit.startTime) : input.plannedStartAt;
    stops.push({
      ...candidate,
      position: stops.length + 1,
      travelDistanceMeters: Math.max(0, Math.round(transition.travelDistanceMeters ?? 0)),
      travelDurationSeconds: seconds(transition.travelDuration),
      estimatedArrivalAt: Number.isNaN(arrival.getTime()) ? input.plannedStartAt : arrival,
    });
  }

  const skipped = new Set(response.skippedShipments?.flatMap((item) => item.index === undefined ? [] : [item.index]) ?? []);
  input.candidates.forEach((_, index) => {
    if (!visitedIndices.has(index)) skipped.add(index);
  });
  const returnTransition = transitions[visits.length] ?? {};
  const totalDistanceMeters = transitions.reduce((sum, transition) => sum + Math.max(0, Math.round(transition.travelDistanceMeters ?? 0)), 0);
  const routeStart = route?.vehicleStartTime ? new Date(route.vehicleStartTime) : input.plannedStartAt;
  const routeEnd = route?.vehicleEndTime ? new Date(route.vehicleEndTime) : null;
  const elapsed = routeEnd && !Number.isNaN(routeEnd.getTime())
    ? Math.max(0, Math.round((routeEnd.getTime() - routeStart.getTime()) / 1000))
    : seconds(route?.metrics?.totalDuration);

  return {
    stops,
    excludedCandidateIds: Array.from(skipped).map((index) => input.candidates[index]?.id).filter((id): id is number => id !== undefined),
    totalDistanceMeters,
    totalDurationSeconds: elapsed,
    returnDistanceMeters: Math.max(0, Math.round(returnTransition.travelDistanceMeters ?? 0)),
    returnDurationSeconds: seconds(returnTransition.travelDuration),
    optimizer: "google_route_optimization_v1",
    encodedPolyline: route?.routePolyline?.points,
    trafficAware: true,
  };
}

export async function optimizeRouteWithGoogle(input: OptimizeRouteInput): Promise<OptimizeRouteResult> {
  const config = getGoogleRouteOptimizationConfig();
  if (!config) return optimizeRouteHeuristic(input);
  try {
    const auth = new GoogleAuth({
      scopes: [ROUTE_OPTIMIZATION_SCOPE],
      keyFile: config.credentialsFile,
      credentials: config.credentials,
    });
    const response = await auth.request<GoogleOptimizeResponse>({
      url: `https://routeoptimization.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}:optimizeTours`,
      method: "POST",
      data: buildGoogleOptimizeToursRequest(input),
      timeout: REQUEST_TIMEOUT_MS,
    });
    return parseGoogleOptimizeToursResponse(input, response.data);
  } catch (error) {
    throw new GoogleRouteOptimizationError("Google could not optimize today's route.", error);
  }
}
