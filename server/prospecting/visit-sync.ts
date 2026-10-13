import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
} from "#shared/schema.js";

const OPEN_STOP_STATUSES = ["planned", "en_route", "checked_in"] as const;

/** Keep the persisted route execution state aligned with its existing visit row. */
export async function markProspectingVisitCheckedIn(visitId: number) {
  await db.transaction(async (tx) => {
    const [linked] = await tx.select({
      stopId: prospectingRouteStops.id,
      routeId: prospectingRoutes.id,
      routeStatus: prospectingRoutes.status,
    }).from(prospectingRouteStops)
      .innerJoin(prospectingRoutes, eq(prospectingRoutes.id, prospectingRouteStops.routeId))
      .where(eq(prospectingRouteStops.visitId, visitId))
      .limit(1);
    if (!linked) return;

    const now = new Date();
    await tx.update(prospectingRouteStops).set({
      status: "checked_in",
      updatedAt: now,
    }).where(eq(prospectingRouteStops.id, linked.stopId));

    if (linked.routeStatus === "published") {
      await tx.update(prospectingRoutes).set({
        status: "in_progress",
        startedAt: now,
        updatedAt: now,
      }).where(and(
        eq(prospectingRoutes.id, linked.routeId),
        eq(prospectingRoutes.status, "published"),
      ));
    }
  });
}
/** Complete or skip the route stop, and close the route after its final open stop. */
export async function markProspectingVisitFinished(visitId: number, cancelled: boolean) {
  await db.transaction(async (tx) => {
    const [linked] = await tx.select({
      stopId: prospectingRouteStops.id,
      routeId: prospectingRouteStops.routeId,
      candidateId: prospectingRouteStops.candidateId,
    }).from(prospectingRouteStops)
      .where(eq(prospectingRouteStops.visitId, visitId))
      .limit(1);
    if (!linked) return;

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

    const [openStop] = await tx.select({ id: prospectingRouteStops.id })
      .from(prospectingRouteStops)
      .where(and(
        eq(prospectingRouteStops.routeId, linked.routeId),
        inArray(prospectingRouteStops.status, [...OPEN_STOP_STATUSES]),
      ))
      .limit(1);
    if (!openStop) {
      await tx.update(prospectingRoutes).set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      }).where(and(
        eq(prospectingRoutes.id, linked.routeId),
        inArray(prospectingRoutes.status, ["published", "in_progress"]),
      ));
    }
  });
}
