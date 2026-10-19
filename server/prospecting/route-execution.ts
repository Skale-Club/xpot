import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesLeadLocations,
  salesLeads,
  salesVisits,
} from "#shared/schema.js";
import { haversineMeters } from "./route-optimizer.js";

/**
 * How a visit started outside the route screen still lands on the route.
 *
 * A rep who checks in from the Check-in search (an opportunity on the street, or
 * a route business visited out of order) must not end up with a duplicate visit
 * and a stop that never closes. These helpers run inside the check-in and
 * checkout transactions (server/visit-workflow.ts).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Visit = typeof salesVisits.$inferSelect;

const UNREACHED_STOP_STATUSES = ["planned", "en_route"] as const;
// The same conservative urban speed the manual reorder uses (30 km/h).
const LOCAL_METERS_PER_SECOND = 30_000 / 3600;

const travelSeconds = (meters: number) => (meters > 0 ? Math.max(60, Math.round(meters / LOCAL_METERS_PER_SECOND)) : 0);

/**
 * The open route stop for this business, if any: matched by its lead, or by
 * the Google place of the discovered business behind the stop (a stop gets its
 * lead lazily, so an unprepared stop is only known by its place). A route
 * being executed wins over one merely published.
 */
export async function findOpenRouteStopForLead(tx: Tx, repId: number, leadId: number) {
  const [lead] = await tx.select({ googlePlaceId: salesLeads.googlePlaceId }).from(salesLeads)
    .where(eq(salesLeads.id, leadId)).limit(1);
  const [match] = await tx.select({
    stopId: prospectingRouteStops.id,
    routeId: prospectingRouteStops.routeId,
    visitId: prospectingRouteStops.visitId,
    candidateId: prospectingRouteStops.candidateId,
  }).from(prospectingRouteStops)
    .innerJoin(prospectingRoutes, eq(prospectingRoutes.id, prospectingRouteStops.routeId))
    .leftJoin(prospectingCandidates, eq(prospectingCandidates.id, prospectingRouteStops.candidateId))
    .where(and(
      eq(prospectingRoutes.repId, repId),
      inArray(prospectingRoutes.status, ["published", "in_progress"]),
      inArray(prospectingRouteStops.status, [...UNREACHED_STOP_STATUSES]),
      or(
        eq(prospectingRouteStops.leadId, leadId),
        eq(prospectingCandidates.leadId, leadId),
        lead?.googlePlaceId ? eq(prospectingCandidates.googlePlaceId, lead.googlePlaceId) : undefined,
      ),
    ))
    .orderBy(
      desc(sql`${prospectingRoutes.status} = 'in_progress'`),
      desc(prospectingRoutes.routeDate),
      asc(prospectingRouteStops.position),
    )
    .limit(1);
  return match ?? null;
}

/** The planned visit already waiting on that stop, when it can still be started. */
export async function plannedVisitOfStop(tx: Tx, stop: { visitId: number | null }, repId: number, leadId: number) {
  if (!stop.visitId) return null;
  const [visit] = await tx.select({ id: salesVisits.id }).from(salesVisits).where(and(
    eq(salesVisits.id, stop.visitId),
    eq(salesVisits.repId, repId),
    eq(salesVisits.leadId, leadId),
    eq(salesVisits.status, "planned"),
  )).limit(1);
  return visit ?? null;
}

/** Ties a visit that began elsewhere to its route stop and the business behind it. */
export async function linkStopToVisit(
  tx: Tx,
  stop: { stopId: number; visitId: number | null; candidateId: number | null },
  visitId: number,
  leadId: number,
) {
  const now = new Date();
  // A planned visit the stop no longer uses leaves the agenda instead of lingering.
  if (stop.visitId && stop.visitId !== visitId) {
    await tx.update(salesVisits).set({ status: "cancelled", updatedAt: now })
      .where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.status, "planned")));
  }
  await tx.update(prospectingRouteStops).set({ leadId, visitId, updatedAt: now })
    .where(eq(prospectingRouteStops.id, stop.stopId));
  if (stop.candidateId) {
    await tx.update(prospectingCandidates).set({ leadId, status: "scheduled", updatedAt: now })
      .where(eq(prospectingCandidates.id, stop.candidateId));
  }
}

/**
 * A visit off the plan while a route is running becomes an "extra" stop right
 * after the last reached one, and the stops still ahead are re-timed from it
 * with the local travel model (no new paid optimization).
 */
const RUNNING_ROUTE_MAX_AGE_MS = 18 * 60 * 60 * 1000;

export async function attachAdHocStop(tx: Tx, visit: Visit, now = new Date()) {
  // Routes are same-day: one left "in progress" from an earlier day is not the
  // running route, even if a late check-in on one of its stops restarted it.
  // route_date is the rep's local day, so allow one day either side of UTC.
  const day = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const [route] = await tx.select().from(prospectingRoutes).where(and(
    eq(prospectingRoutes.repId, visit.repId),
    eq(prospectingRoutes.status, "in_progress"),
    inArray(prospectingRoutes.routeDate, [day(-1), day(0), day(1)]),
    gte(prospectingRoutes.startedAt, new Date(now.getTime() - RUNNING_ROUTE_MAX_AGE_MS)),
  )).orderBy(desc(prospectingRoutes.startedAt)).limit(1);
  if (!route) return null;

  const [lead] = await tx.select({ name: salesLeads.name }).from(salesLeads).where(eq(salesLeads.id, visit.leadId)).limit(1);
  const [location] = await tx.select().from(salesLeadLocations)
    .where(visit.locationId ? eq(salesLeadLocations.id, visit.locationId) : eq(salesLeadLocations.leadId, visit.leadId))
    .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id))
    .limit(1);
  // The stop needs a point on the map: the business's, else where the rep checked in.
  const lat = location?.lat ?? visit.checkInLat;
  const lng = location?.lng ?? visit.checkInLng;
  if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || !lead) return null;

  const stops = await tx.select().from(prospectingRouteStops)
    .where(eq(prospectingRouteStops.routeId, route.id))
    .orderBy(asc(prospectingRouteStops.position));
  const reached = stops.filter((stop) => !(UNREACHED_STOP_STATUSES as readonly string[]).includes(stop.status));
  const position = (reached.length ? Math.max(...reached.map((stop) => stop.position)) : 0) + 1;
  const previous = reached.length ? reached[reached.length - 1] : null;

  // Open a gap at that position. Positions are unique per route, so the rows
  // move out of range first and then back one place down.
  const shift = Math.max(...stops.map((stop) => stop.position), 0) + 1;
  await tx.update(prospectingRouteStops).set({ position: sql`${prospectingRouteStops.position} + ${shift}` })
    .where(and(eq(prospectingRouteStops.routeId, route.id), gte(prospectingRouteStops.position, position)));
  await tx.update(prospectingRouteStops).set({ position: sql`${prospectingRouteStops.position} - ${shift - 1}` })
    .where(and(eq(prospectingRouteStops.routeId, route.id), gte(prospectingRouteStops.position, position + shift)));

  const here = { lat: Number(lat), lng: Number(lng) };
  const distance = previous ? Math.round(haversineMeters({ lat: Number(previous.lat), lng: Number(previous.lng) }, here)) : 0;
  const arrivedAt = visit.checkedInAt ?? now;
  const serviceSeconds = route.defaultVisitMinutes * 60;
  const [extra] = await tx.insert(prospectingRouteStops).values({
    routeId: route.id,
    leadId: visit.leadId,
    visitId: visit.id,
    position,
    origin: "ad_hoc",
    name: lead.name,
    address: location ? [location.addressLine1, location.city, location.state].filter(Boolean).join(", ") : null,
    lat: String(lat),
    lng: String(lng),
    serviceDurationSeconds: serviceSeconds,
    travelDistanceMeters: distance,
    travelDurationSeconds: travelSeconds(distance),
    estimatedArrivalAt: arrivedAt,
  }).returning();

  await retimeStopsAhead(tx, route.id, extra, new Date(arrivedAt.getTime() + serviceSeconds * 1000));
  return extra;
}

/** Re-times every unreached stop after `from`, starting when the rep leaves it. */
async function retimeStopsAhead(
  tx: Tx,
  routeId: number,
  from: { position: number; lat: string; lng: string },
  leavesAt: Date,
) {
  const ahead = await tx.select().from(prospectingRouteStops).where(and(
    eq(prospectingRouteStops.routeId, routeId),
    inArray(prospectingRouteStops.status, [...UNREACHED_STOP_STATUSES]),
  )).orderBy(asc(prospectingRouteStops.position));
  const now = new Date();
  let cursor = leavesAt.getTime();
  let previous = { lat: Number(from.lat), lng: Number(from.lng) };
  for (const stop of ahead.filter((item) => item.position > from.position)) {
    const point = { lat: Number(stop.lat), lng: Number(stop.lng) };
    const distance = Math.round(haversineMeters(previous, point));
    const drive = travelSeconds(distance);
    const estimatedArrivalAt = new Date(cursor + drive * 1000);
    await tx.update(prospectingRouteStops).set({
      travelDistanceMeters: distance,
      travelDurationSeconds: drive,
      estimatedArrivalAt,
      updatedAt: now,
    }).where(eq(prospectingRouteStops.id, stop.id));
    if (stop.visitId) {
      await tx.update(salesVisits).set({ scheduledAt: estimatedArrivalAt, updatedAt: now })
        .where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.status, "planned")));
    }
    cursor = estimatedArrivalAt.getTime() + stop.serviceDurationSeconds * 1000;
    previous = point;
  }
  await tx.update(prospectingRoutes).set({ plannedEndAt: new Date(cursor), updatedAt: now })
    .where(eq(prospectingRoutes.id, routeId));
}

/**
 * A business visited in person is never "discovered" again: every candidate of
 * this rep that is the same business (same lead, or same Google place) and
 * still waiting in a discovery list becomes visited and linked to the lead.
 */
export async function markBusinessVisited(tx: Tx, repId: number, leadId: number) {
  const [lead] = await tx.select({ googlePlaceId: salesLeads.googlePlaceId }).from(salesLeads)
    .where(eq(salesLeads.id, leadId)).limit(1);
  await tx.update(prospectingCandidates).set({ leadId, status: "visited", updatedAt: new Date() }).where(and(
    eq(prospectingCandidates.repId, repId),
    inArray(prospectingCandidates.status, ["discovered", "shortlisted"]),
    or(
      eq(prospectingCandidates.leadId, leadId),
      lead?.googlePlaceId
        ? and(isNotNull(prospectingCandidates.googlePlaceId), eq(prospectingCandidates.googlePlaceId, lead.googlePlaceId))
        : undefined,
    ),
  ));
}
