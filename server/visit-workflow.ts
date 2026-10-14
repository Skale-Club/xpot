import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesLeads,
  salesVisits,
} from "#shared/schema.js";
import type { SalesVisitStatus } from "#shared/schema/sales.js";
import {
  attachAdHocStop,
  findOpenRouteStopForLead,
  linkStopToVisit,
  markBusinessVisited,
  plannedVisitOfStop,
} from "./prospecting/route-execution.js";

const OPEN_STOP_STATUSES = ["planned", "en_route", "checked_in"] as const;

type StartValues = {
  locationId?: number;
  status: "in_progress";
  checkedInAt: Date;
  checkInLat: string | null;
  checkInLng: string | null;
  distanceFromTargetMeters: number | null;
  gpsAccuracyMeters: number | null;
  validationStatus: "valid" | "outside_geofence" | "gps_unavailable" | "manual_override";
  manualOverrideReason?: string;
};

export async function startVisitTransaction(input: {
  repId: number;
  leadId: number;
  plannedVisitId?: number;
  values: StartValues;
}) {
  return db.transaction(async (tx) => {
    // A check-in that did not come from the route (the Check-in search) still
    // belongs to the route when the business is one of its open stops: it
    // starts that stop's planned visit instead of creating a second one.
    const routeStop = input.plannedVisitId ? null : await findOpenRouteStopForLead(tx, input.repId, input.leadId);
    const plannedVisitId = input.plannedVisitId
      ?? (routeStop ? (await plannedVisitOfStop(tx, routeStop, input.repId, input.leadId))?.id : undefined);

    let visit;
    if (plannedVisitId) {
      [visit] = await tx.update(salesVisits).set({ ...input.values, updatedAt: new Date() }).where(and(
        eq(salesVisits.id, plannedVisitId),
        eq(salesVisits.repId, input.repId),
        eq(salesVisits.leadId, input.leadId),
        eq(salesVisits.status, "planned"),
      )).returning();
    } else {
      [visit] = await tx.insert(salesVisits).values({
        repId: input.repId,
        leadId: input.leadId,
        scheduledAt: null,
        source: "field-mobile",
        ...input.values,
      }).returning();
    }
    if (!visit) return null;

    if (routeStop && routeStop.visitId !== visit.id) {
      await linkStopToVisit(tx, routeStop, visit.id, input.leadId);
    } else if (!routeStop && !input.plannedVisitId) {
      // An opportunity off the plan while a route runs joins it as an extra stop.
      await attachAdHocStop(tx, visit);
    }

    const [lead] = await tx.select({ status: salesLeads.status }).from(salesLeads)
      .where(eq(salesLeads.id, input.leadId)).limit(1);
    await tx.update(salesLeads).set({
      ...(lead?.status === "prospect" ? { status: "lead" as const } : {}),
      lastVisitAt: visit.checkedInAt,
      nextVisitDueAt: null,
      updatedAt: new Date(),
    }).where(eq(salesLeads.id, input.leadId));

    const [linked] = await tx.select({
      stopId: prospectingRouteStops.id,
      routeId: prospectingRouteStops.routeId,
    }).from(prospectingRouteStops).where(eq(prospectingRouteStops.visitId, visit.id)).limit(1);
    if (linked) {
      const now = new Date();
      await tx.update(prospectingRouteStops).set({ status: "checked_in", updatedAt: now })
        .where(eq(prospectingRouteStops.id, linked.stopId));
      await tx.update(prospectingRoutes).set({ status: "in_progress", startedAt: now, updatedAt: now })
        .where(and(eq(prospectingRoutes.id, linked.routeId), eq(prospectingRoutes.status, "published")));
    }
    return visit;
  });
}

export async function finishVisitTransaction(input: {
  visitId: number;
  leadId: number;
  status: SalesVisitStatus;
  checkedOutAt: Date;
  durationSeconds: number;
  checkOutLat?: number;
  checkOutLng?: number;
  updateLeadLastVisit: boolean;
}) {
  return db.transaction(async (tx) => {
    const [visit] = await tx.update(salesVisits).set({
      status: input.status,
      checkedOutAt: input.checkedOutAt,
      durationSeconds: input.durationSeconds,
      checkOutLat: input.checkOutLat == null ? null : String(input.checkOutLat),
      checkOutLng: input.checkOutLng == null ? null : String(input.checkOutLng),
      updatedAt: new Date(),
    }).where(eq(salesVisits.id, input.visitId)).returning();
    if (!visit) return null;

    if (input.updateLeadLastVisit) {
      await tx.update(salesLeads).set({ lastVisitAt: input.checkedOutAt, updatedAt: new Date() })
        .where(eq(salesLeads.id, input.leadId));
    }
    if (input.status !== "cancelled") await markBusinessVisited(tx, visit.repId, input.leadId);

    const [linked] = await tx.select({
      stopId: prospectingRouteStops.id,
      routeId: prospectingRouteStops.routeId,
      candidateId: prospectingRouteStops.candidateId,
    }).from(prospectingRouteStops).where(eq(prospectingRouteStops.visitId, input.visitId)).limit(1);
    if (linked) {
      const cancelled = input.status === "cancelled";
      const now = new Date();
      await tx.update(prospectingRouteStops).set({
        status: cancelled ? "skipped" : "completed",
        skipReason: cancelled ? "visit_cancelled" : null,
        completedAt: now,
        updatedAt: now,
      }).where(eq(prospectingRouteStops.id, linked.stopId));
      if (!cancelled && linked.candidateId) {
        await tx.update(prospectingCandidates).set({ status: "visited", updatedAt: now })
          .where(eq(prospectingCandidates.id, linked.candidateId));
      }
      const [openStop] = await tx.select({ id: prospectingRouteStops.id }).from(prospectingRouteStops).where(and(
        eq(prospectingRouteStops.routeId, linked.routeId),
        inArray(prospectingRouteStops.status, [...OPEN_STOP_STATUSES]),
      )).limit(1);
      if (!openStop) {
        await tx.update(prospectingRoutes).set({ status: "completed", completedAt: now, updatedAt: now })
          .where(and(eq(prospectingRoutes.id, linked.routeId), inArray(prospectingRoutes.status, ["published", "in_progress"])));
      }
    }
    return visit;
  });
}
