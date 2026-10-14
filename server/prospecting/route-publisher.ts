import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesLeadLocations,
  salesVisits,
} from "#shared/schema.js";
import { organizationIdForRep } from "../organizations/service.js";
import { ensureProspectingCandidateLead } from "./lead-materializer.js";

/**
 * Publishes a route exactly once and materializes every stop as a CRM lead plus
 * a planned visit. Automatic and manually-created routes share this path.
 */
export async function publishProspectingRouteForRep(routeId: number, repId: number) {
  const organizationId = await organizationIdForRep(repId);
  return db.transaction(async (tx) => {
    const [route] = await tx.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.id, routeId),
      eq(prospectingRoutes.repId, repId),
    )).limit(1).for("update");
    if (!route) return null;
    if (["published", "in_progress", "completed"].includes(route.status)) return route;
    if (route.status !== "draft") throw new Error(`Cannot publish a ${route.status} route.`);

    const now = new Date();
    const originalStart = route.plannedStartAt ? new Date(route.plannedStartAt) : now;
    const scheduleShiftMs = Math.max(0, now.getTime() - originalStart.getTime());
    const stops = await tx.select().from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.routeId, route.id))
      .orderBy(asc(prospectingRouteStops.position));
    if (!stops.length) throw new Error("A route needs at least one stop before it can be published.");

    for (const stop of stops) {
      const scheduledAt = new Date(
        (stop.estimatedArrivalAt ? new Date(stop.estimatedArrivalAt) : originalStart).getTime() + scheduleShiftMs,
      );
      if (stop.visitId) {
        if (scheduleShiftMs > 0) {
          await tx.update(prospectingRouteStops).set({ estimatedArrivalAt: scheduledAt, updatedAt: now })
            .where(eq(prospectingRouteStops.id, stop.id));
          await tx.update(salesVisits).set({ scheduledAt, updatedAt: now })
            .where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.repId, repId)));
        }
        continue;
      }

      let leadId = stop.leadId;
      if (!leadId && stop.candidateId) {
        leadId = await ensureProspectingCandidateLead(tx, {
          candidateId: stop.candidateId,
          repId,
          organizationId,
          territoryName: route.name,
        });
      }
      if (!leadId) throw new Error(`Route stop ${stop.id} has no business attached.`);

      const [location] = await tx.select({ id: salesLeadLocations.id })
        .from(salesLeadLocations)
        .where(eq(salesLeadLocations.leadId, leadId))
        .orderBy(desc(salesLeadLocations.isPrimary), asc(salesLeadLocations.id))
        .limit(1);
      const [visit] = await tx.insert(salesVisits).values({
        repId,
        leadId,
        locationId: location?.id ?? null,
        status: "planned",
        scheduledAt,
        source: "prospecting-route",
      }).returning({ id: salesVisits.id });

      if (stop.candidateId) {
        await tx.update(prospectingCandidates).set({ leadId, status: "scheduled", updatedAt: now })
          .where(and(eq(prospectingCandidates.id, stop.candidateId), eq(prospectingCandidates.repId, repId)));
      }
      await tx.update(prospectingRouteStops).set({
        leadId,
        visitId: visit.id,
        estimatedArrivalAt: scheduledAt,
        updatedAt: now,
      }).where(eq(prospectingRouteStops.id, stop.id));
    }

    const [published] = await tx.update(prospectingRoutes).set({
      status: "published",
      plannedStartAt: scheduleShiftMs > 0 ? now : route.plannedStartAt,
      plannedEndAt: scheduleShiftMs > 0
        ? new Date((route.plannedEndAt ? new Date(route.plannedEndAt) : originalStart).getTime() + scheduleShiftMs)
        : route.plannedEndAt,
      publishedAt: now,
      updatedAt: now,
    }).where(and(
      eq(prospectingRoutes.id, route.id),
      eq(prospectingRoutes.status, "draft"),
    )).returning();
    if (!published) throw new Error("Route status changed concurrently. Reload and try again.");
    return published;
  });
}
