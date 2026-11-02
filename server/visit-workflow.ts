import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { salesLeads, salesVisits } from "#shared/schema.js";
import type { SalesVisitStatus } from "#shared/schema/sales.js";
import {
  attachAdHocStop,
  findOpenRouteStopForLead,
  linkStopToVisit,
  markBusinessVisited,
  plannedVisitOfStop,
} from "./prospecting/route-execution.js";
import { markStopOfVisitCheckedIn, markStopOfVisitFinished } from "./prospecting/visit-sync.js";
import { visitTimeLimitReached } from "#shared/visit-time-limit.js";

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

    await markStopOfVisitCheckedIn(tx, visit.id);
    return visit;
  });
}

export async function finishVisitTransaction(input: {
  visitId: number;
  leadId: number;
  status: SalesVisitStatus;
  checkedOutAt: Date;
  durationSeconds: number | null;
  checkOutLat?: number;
  checkOutLng?: number;
  updateLeadLastVisit: boolean;
  requireActive?: boolean;
}) {
  return db.transaction(async (tx) => {
    if (input.requireActive) {
      const [current] = await tx.select().from(salesVisits).where(eq(salesVisits.id, input.visitId)).for("update");
      if (!current || current.status !== "in_progress" || visitTimeLimitReached(current.checkedInAt)) return null;
    }
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

    const linked = await markStopOfVisitFinished(tx, input.visitId, input.status === "cancelled");
    // The route the visit was a stop of: check-out goes back to it for the next stop.
    return { ...visit, routeId: linked?.routeId ?? null };
  });
}
