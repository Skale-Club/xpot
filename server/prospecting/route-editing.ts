import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesLeadLocations,
  salesLeads,
  salesVisits,
} from "#shared/schema.js";
import type { ProspectingRouteStopSource, ProspectingRouteStopWarning } from "#shared/prospecting.js";
import { organizationIdForRep } from "../organizations/service.js";
import { haversineMeters } from "./route-optimizer.js";
import { ensurePlaceLead, ensureProspectingCandidateLead } from "./lead-materializer.js";
import { materializeStopVisit } from "./route-publisher.js";

/**
 * Hand edits of a route the rep is planning or running: reorder, remove, add
 * and replace stops. None of them calls Google again; timing comes from the
 * same local driving estimate (30 km/h in a straight line) the extra stops of
 * a running route use (route-execution.ts).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RouteRow = typeof prospectingRoutes.$inferSelect;
type RouteStopRow = typeof prospectingRouteStops.$inferSelect;

export const UNREACHED_STOP_STATUSES = ["planned", "en_route"] as const;
export const EDITABLE_ROUTE_STATUSES = ["draft", "published", "in_progress"] as const;

export const isUnreached = (stop: { status: string }) => (UNREACHED_STOP_STATUSES as readonly string[]).includes(stop.status);

export class RouteEditError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const LOCAL_METERS_PER_SECOND = 30_000 / 3600;
export const localTravelSeconds = (meters: number) => (meters > 0 ? Math.max(60, Math.round(meters / LOCAL_METERS_PER_SECOND)) : 0);
const point = (stop: { lat: string; lng: string }) => ({ lat: Number(stop.lat), lng: Number(stop.lng) });

/** When the rep leaves a stop that already happened. */
function departureOf(stop: RouteStopRow, fallback: number) {
  if (stop.completedAt && ["completed", "skipped"].includes(stop.status)) return new Date(stop.completedAt).getTime();
  const arrival = stop.estimatedArrivalAt ? new Date(stop.estimatedArrivalAt).getTime() : fallback;
  return arrival + stop.serviceDurationSeconds * 1000;
}

export type RouteEdit = "reordered" | "stop_removed" | "stop_added" | "stop_replaced" | "ad_hoc_stop";

/**
 * Puts the stops in `ordered` order and re-times them without another paid
 * Google request. What already happened is left as it happened: a reached
 * stop keeps its times, and its finished visit keeps its schedule. The stops
 * still ahead are timed from when the rep leaves the last reached one, and
 * never in the past while the route runs. Before anything is reached the
 * clock starts at the route's planned start, as when it was built.
 *
 * Returns the route's work time (drives plus visits), which the chosen shift
 * is measured against.
 */
export async function retimeRouteStops(tx: Tx, route: RouteRow, ordered: RouteStopRow[], repId: number, edit: RouteEdit, now = new Date()) {
  let cursor = new Date(route.plannedStartAt).getTime();
  let previous: { lat: number; lng: number } | null = null;
  // The rep is on the road once any stop was reached, even out of order.
  const running = ordered.some((stop) => !isUnreached(stop));
  let workSeconds = 0;
  let totalDistanceMeters = 0;
  const timed = ordered.map((stop, index) => {
    if (!isUnreached(stop)) {
      cursor = departureOf(stop, cursor);
      previous = point(stop);
      workSeconds += stop.travelDurationSeconds + stop.serviceDurationSeconds;
      totalDistanceMeters += stop.travelDistanceMeters;
      return { stop, position: index + 1, timing: null };
    }
    if (running) cursor = Math.max(cursor, now.getTime());
    const distance = previous ? Math.round(haversineMeters(previous, point(stop))) : 0;
    const travelDurationSeconds = localTravelSeconds(distance);
    const estimatedArrivalAt = new Date(cursor + travelDurationSeconds * 1000);
    cursor = estimatedArrivalAt.getTime() + stop.serviceDurationSeconds * 1000;
    previous = point(stop);
    workSeconds += travelDurationSeconds + stop.serviceDurationSeconds;
    totalDistanceMeters += distance;
    return { stop, position: index + 1, timing: { distance, travelDurationSeconds, estimatedArrivalAt } };
  });

  const updatedAt = now;
  // Move every row out of the final position range first so the route/position
  // unique constraint cannot collide while positions are compacted.
  const temporaryPositionBase = Math.max(...ordered.map((stop) => stop.position), ordered.length) + ordered.length + 1;
  for (const item of timed) {
    await tx.update(prospectingRouteStops).set({ position: temporaryPositionBase + item.position, updatedAt })
      .where(eq(prospectingRouteStops.id, item.stop.id));
  }
  for (const item of timed) {
    await tx.update(prospectingRouteStops).set({
      position: item.position,
      ...(item.timing ? {
        travelDistanceMeters: item.timing.distance,
        travelDurationSeconds: item.timing.travelDurationSeconds,
        estimatedArrivalAt: item.timing.estimatedArrivalAt,
      } : {}),
      updatedAt,
    }).where(eq(prospectingRouteStops.id, item.stop.id));
    if (item.timing && item.stop.visitId) {
      await tx.update(salesVisits).set({ scheduledAt: item.timing.estimatedArrivalAt, updatedAt })
        .where(and(eq(salesVisits.id, item.stop.visitId), eq(salesVisits.repId, repId), eq(salesVisits.status, "planned")));
    }
  }

  const optimizationMeta = { ...(route.optimizationMeta ?? {}) } as Record<string, unknown>;
  // The stored Google road line no longer matches the stops.
  delete optimizationMeta.encodedPolyline;
  Object.assign(optimizationMeta, {
    ...(edit === "ad_hoc_stop" ? {} : { manuallyReordered: true, lastManualEdit: edit }),
    distanceModel: "haversine_manual",
    trafficAware: false,
  });
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  await tx.update(prospectingRoutes).set({
    startAddress: first.address,
    startLat: first.lat,
    startLng: first.lng,
    endAddress: last.address,
    endLat: last.lat,
    endLng: last.lng,
    totalDistanceMeters,
    totalDurationSeconds: workSeconds,
    plannedEndAt: new Date(cursor),
    optimizationMeta,
    updatedAt,
  }).where(eq(prospectingRoutes.id, route.id));
  return { workSeconds };
}

/**
 * Minutes an edited route's work runs past the shift the rep chose. Hand
 * edits may go over it; the rep is told, not stopped.
 */
export function overtimeMinutes(route: RouteRow, workSeconds: number) {
  const shiftMinutes = Number((route.optimizationMeta as Record<string, unknown> | null)?.shiftDurationMinutes);
  if (!Number.isFinite(shiftMinutes) || shiftMinutes <= 0) return 0;
  return Math.max(0, Math.ceil(workSeconds / 60 - shiftMinutes));
}

/** The rep's editable route and its stops, locked for the length of the edit. */
async function lockEditableRoute(tx: Tx, routeId: number, repId: number) {
  const [route] = await tx.select().from(prospectingRoutes).where(and(
    eq(prospectingRoutes.id, routeId),
    eq(prospectingRoutes.repId, repId),
  )).limit(1).for("update");
  if (!route) throw new RouteEditError("Route not found", 404);
  if (!(EDITABLE_ROUTE_STATUSES as readonly string[]).includes(route.status)) {
    throw new RouteEditError("A finished route can no longer be edited.", 409);
  }
  const stops = await tx.select().from(prospectingRouteStops)
    .where(eq(prospectingRouteStops.routeId, route.id))
    .orderBy(asc(prospectingRouteStops.position));
  return { route, stops };
}

/** New order for the stops; what already happened keeps its place. */
export async function reorderRouteStops(input: { routeId: number; repId: number; stopIds: number[] }) {
  return db.transaction(async (tx) => {
    const { route, stops } = await lockEditableRoute(tx, input.routeId, input.repId);
    const knownIds = new Set(stops.map((stop) => stop.id));
    if (input.stopIds.length !== stops.length || input.stopIds.some((id) => !knownIds.has(id))) {
      throw new RouteEditError("The new order must contain every route stop exactly once.", 400);
    }
    if (stops.some((stop, index) => !isUnreached(stop) && input.stopIds[index] !== stop.id)) {
      throw new RouteEditError("A visit that already happened keeps its place in the route.", 409);
    }
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const { workSeconds } = await retimeRouteStops(tx, route, input.stopIds.map((id) => byId.get(id)!), input.repId, "reordered");
    return { overtimeMinutes: overtimeMinutes(route, workSeconds) };
  });
}

/** Takes a stop nobody reached off the route. */
export async function removeRouteStop(input: { routeId: number; repId: number; stopId: number }) {
  return db.transaction(async (tx) => {
    const { route, stops } = await lockEditableRoute(tx, input.routeId, input.repId);
    const stop = stops.find((item) => item.id === input.stopId);
    if (!stop) throw new RouteEditError("Route stop not found", 404);
    if (!isUnreached(stop)) throw new RouteEditError("A visit that already started cannot be removed from the route.", 409);
    if (stops.length === 1) throw new RouteEditError("A route must keep at least one stop.", 409);
    await releaseStop(tx, stop, input.repId);
    await retimeRouteStops(tx, route, stops.filter((item) => item.id !== stop.id), input.repId, "stop_removed");
  });
}

/** A stop leaving the route: its planned visit leaves the agenda and a discovered business goes back to the pool. */
export async function releaseStop(tx: Tx, stop: RouteStopRow, repId: number) {
  const now = new Date();
  if (stop.visitId) {
    await tx.update(salesVisits).set({ status: "cancelled", updatedAt: now }).where(and(
      eq(salesVisits.id, stop.visitId),
      eq(salesVisits.repId, repId),
      eq(salesVisits.status, "planned"),
    ));
  }
  if (stop.candidateId) {
    await tx.update(prospectingCandidates).set({ status: "discovered", updatedAt: now }).where(and(
      eq(prospectingCandidates.id, stop.candidateId),
      eq(prospectingCandidates.repId, repId),
      eq(prospectingCandidates.status, "scheduled"),
    ));
  }
  await tx.delete(prospectingRouteStops).where(eq(prospectingRouteStops.id, stop.id));
}

type Business = {
  leadId: number;
  candidateId: number | null;
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  score: number;
  scoreReasons: string[];
};

/** The business behind a new stop, always as a CRM lead so check-in and the plaque work on it. */
async function resolveBusiness(
  tx: Tx,
  source: ProspectingRouteStopSource,
  context: { route: RouteRow; repId: number; organizationId: number },
): Promise<Business> {
  const { route, repId, organizationId } = context;
  if (source.kind === "candidate") {
    const [candidate] = await tx.select().from(prospectingCandidates).where(and(
      eq(prospectingCandidates.id, source.candidateId),
      eq(prospectingCandidates.repId, repId),
    )).limit(1);
    if (!candidate) throw new RouteEditError("Business not found", 404);
    if (!candidate.lat || !candidate.lng) throw new RouteEditError("This business has no location to route to.", 400);
    const leadId = await ensureProspectingCandidateLead(tx, { candidateId: candidate.id, repId, organizationId, territoryName: route.name });
    return {
      leadId,
      candidateId: candidate.id,
      name: candidate.name,
      address: candidate.address,
      lat: candidate.lat,
      lng: candidate.lng,
      score: candidate.score,
      scoreReasons: candidate.scoreReasons,
    };
  }

  const leadId = source.kind === "lead"
    ? source.leadId
    : await ensurePlaceLead(tx, { place: source.place, repId, organizationId, territoryName: route.name });
  const [lead] = await tx.select({ id: salesLeads.id, name: salesLeads.name }).from(salesLeads).where(and(
    eq(salesLeads.id, leadId),
    eq(salesLeads.organizationId, organizationId),
  )).limit(1);
  if (!lead) throw new RouteEditError("Business not found", 404);
  const [location] = await tx.select().from(salesLeadLocations)
    .where(eq(salesLeadLocations.leadId, lead.id))
    .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id))
    .limit(1);
  // A Google place carries its own point; a saved lead needs one on file.
  const lat = source.kind === "place" ? String(source.place.lat) : location?.lat;
  const lng = source.kind === "place" ? String(source.place.lng) : location?.lng;
  if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new RouteEditError("This business has no location to route to.", 400);
  }
  return {
    leadId: lead.id,
    candidateId: null,
    name: lead.name,
    address: source.kind === "place"
      ? source.place.address || null
      : location ? [location.addressLine1, location.city, location.state].filter(Boolean).join(", ") : null,
    lat,
    lng,
    score: 0,
    scoreReasons: [],
  };
}

/** Why a business the rep picked by hand would have stayed out of a cold route. */
async function businessWarnings(tx: Tx, leadId: number): Promise<ProspectingRouteStopWarning[]> {
  const [lead] = await tx.select({ status: salesLeads.status, lastVisitAt: salesLeads.lastVisitAt })
    .from(salesLeads).where(eq(salesLeads.id, leadId)).limit(1);
  if (lead?.status === "customer") return ["existing_customer"];
  if (lead?.lastVisitAt) return ["previously_visited"];
  return [];
}

/**
 * Puts a business on the route: after a given stop, in place of one, or at the
 * end. A published or running route also gets the planned visit on the agenda.
 * A stop never goes ahead of a visit that already happened.
 */
export async function addRouteStop(input: {
  routeId: number;
  repId: number;
  source: ProspectingRouteStopSource;
  replaceStopId?: number;
  afterStopId?: number;
}) {
  const { repId } = input;
  const organizationId = await organizationIdForRep(repId);
  return db.transaction(async (tx) => {
    const { route, stops } = await lockEditableRoute(tx, input.routeId, repId);

    const replaced = input.replaceStopId === undefined ? null : stops.find((stop) => stop.id === input.replaceStopId);
    if (replaced === undefined) throw new RouteEditError("Route stop not found", 404);
    if (replaced && !isUnreached(replaced)) {
      throw new RouteEditError("A visit that already started cannot be replaced.", 409);
    }
    const kept = stops.filter((stop) => stop !== replaced);
    if (!replaced && kept.length >= route.maxStops) {
      throw new RouteEditError(`A route holds up to ${route.maxStops} stops.`, 409);
    }

    let index = kept.length;
    if (replaced) {
      index = stops.indexOf(replaced);
    } else if (input.afterStopId !== undefined) {
      const after = kept.findIndex((stop) => stop.id === input.afterStopId);
      if (after < 0) throw new RouteEditError("Route stop not found", 404);
      index = after + 1;
    }
    const lastReached = kept.reduce((last, stop, position) => (isUnreached(stop) ? last : position), -1);
    if (index <= lastReached) {
      throw new RouteEditError("A stop can't go before a visit that already happened.", 409);
    }

    const business = await resolveBusiness(tx, input.source, { route, repId, organizationId });
    const duplicate = kept.some((stop) => stop.leadId === business.leadId
      || (business.candidateId !== null && stop.candidateId === business.candidateId));
    if (duplicate) throw new RouteEditError("This business is already on the route.", 409);
    const warnings = await businessWarnings(tx, business.leadId);

    if (replaced) await releaseStop(tx, replaced, repId);
    const [inserted] = await tx.insert(prospectingRouteStops).values({
      routeId: route.id,
      candidateId: business.candidateId,
      leadId: business.leadId,
      // Parked past the end; the re-time below gives it its real place.
      position: Math.max(0, ...kept.map((stop) => stop.position)) + 1,
      name: business.name,
      address: business.address,
      lat: business.lat,
      lng: business.lng,
      score: business.score,
      scoreReasons: business.scoreReasons,
      serviceDurationSeconds: route.defaultVisitMinutes * 60,
      // Timed with the rest of the route right below; until then it sits where the route starts.
      estimatedArrivalAt: route.plannedStartAt,
    }).returning();
    const ordered = [...kept];
    ordered.splice(index, 0, inserted);
    const { workSeconds } = await retimeRouteStops(tx, route, ordered, repId, replaced ? "stop_replaced" : "stop_added");

    if (route.status !== "draft") {
      const [timed] = await tx.select().from(prospectingRouteStops).where(eq(prospectingRouteStops.id, inserted.id)).limit(1);
      await materializeStopVisit(tx, {
        route,
        stop: timed,
        repId,
        organizationId,
        scheduledAt: timed.estimatedArrivalAt ? new Date(timed.estimatedArrivalAt) : new Date(),
      });
    }
    return { stopId: inserted.id, warnings, overtimeMinutes: overtimeMinutes(route, workSeconds) };
  });
}
