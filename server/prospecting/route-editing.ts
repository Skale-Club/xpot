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
 * same local driving estimate (30 km/h in a straight line).
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

/** Rebuilds local timing/geometry after a hand edit without another paid Google request. */
export async function persistLocalStopOrder(
  tx: Tx,
  route: RouteRow,
  ordered: RouteStopRow[],
  repId: number,
  edit: "reordered" | "stop_removed" | "stop_added" | "stop_replaced",
) {
  const plannedStartAt = new Date(route.plannedStartAt);
  let elapsedSeconds = 0;
  let totalDistanceMeters = 0;
  const recalculated = ordered.map((stop, index) => {
    const previous = index > 0 ? ordered[index - 1] : null;
    const distance = previous ? Math.round(haversineMeters(
      { lat: Number(previous.lat), lng: Number(previous.lng) },
      { lat: Number(stop.lat), lng: Number(stop.lng) },
    )) : 0;
    const travelDurationSeconds = distance > 0 ? Math.max(60, Math.round(distance / (30_000 / 3600))) : 0;
    elapsedSeconds += travelDurationSeconds;
    const estimatedArrivalAt = new Date(plannedStartAt.getTime() + elapsedSeconds * 1000);
    elapsedSeconds += stop.serviceDurationSeconds;
    totalDistanceMeters += distance;
    return { stop, position: index + 1, distance, travelDurationSeconds, estimatedArrivalAt };
  });
  const now = new Date();
  const optimizationMeta = { ...(route.optimizationMeta ?? {}) } as Record<string, unknown>;
  delete optimizationMeta.encodedPolyline;
  Object.assign(optimizationMeta, {
    manuallyReordered: true,
    lastManualEdit: edit,
    distanceModel: "haversine_manual",
    trafficAware: false,
  });

  // Move every row out of the final position range first so the route/position
  // unique constraint cannot collide while positions are compacted.
  const temporaryPositionBase = Math.max(...ordered.map((stop) => stop.position), ordered.length) + ordered.length + 1;
  for (const item of recalculated) {
    await tx.update(prospectingRouteStops).set({ position: temporaryPositionBase + item.position, updatedAt: now })
      .where(eq(prospectingRouteStops.id, item.stop.id));
  }
  for (const item of recalculated) {
    await tx.update(prospectingRouteStops).set({
      position: item.position,
      travelDistanceMeters: item.distance,
      travelDurationSeconds: item.travelDurationSeconds,
      estimatedArrivalAt: item.estimatedArrivalAt,
      updatedAt: now,
    }).where(eq(prospectingRouteStops.id, item.stop.id));
    if (item.stop.visitId) {
      await tx.update(salesVisits).set({ scheduledAt: item.estimatedArrivalAt, updatedAt: now })
        .where(and(eq(salesVisits.id, item.stop.visitId), eq(salesVisits.repId, repId)));
    }
  }
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
    totalDurationSeconds: elapsedSeconds,
    plannedEndAt: new Date(plannedStartAt.getTime() + elapsedSeconds * 1000),
    optimizationMeta,
    updatedAt: now,
  }).where(eq(prospectingRoutes.id, route.id));
  return { elapsedSeconds };
}

/**
 * Minutes an edited route runs past the work window the rep chose. Hand edits
 * may go over it; the rep is told, not stopped.
 */
export function overtimeMinutes(route: RouteRow, elapsedSeconds: number) {
  const shiftMinutes = Number((route.optimizationMeta as Record<string, unknown> | null)?.shiftDurationMinutes);
  if (!Number.isFinite(shiftMinutes) || shiftMinutes <= 0) return 0;
  return Math.max(0, Math.ceil(elapsedSeconds / 60 - shiftMinutes));
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
    const [route] = await tx.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, input.routeId),
      eq(prospectingRoutes.repId, repId),
    )).limit(1).for("update");
    if (!route) throw new RouteEditError("Route not found", 404);
    if (!(EDITABLE_ROUTE_STATUSES as readonly string[]).includes(route.status)) {
      throw new RouteEditError("A finished route can no longer be edited.", 409);
    }
    const stops = await tx.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));

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
    }).returning();
    const ordered = [...kept];
    ordered.splice(index, 0, inserted);
    const { elapsedSeconds } = await persistLocalStopOrder(tx, route, ordered, repId, replaced ? "stop_replaced" : "stop_added");

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
    return { stopId: inserted.id, warnings, overtimeMinutes: overtimeMinutes(route, elapsedSeconds) };
  });
}
