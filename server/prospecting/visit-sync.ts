import { and, eq, inArray } from "drizzle-orm";
import type { db } from "../db.js";
import {
  prospectingCandidates,
  prospectingRoutes,
  prospectingRouteStops,
  salesVisits,
} from "#shared/schema.js";

/**
 * The one place a route stop follows what happened to its business: the
 * check-in and checkout transactions (server/visit-workflow.ts) and a stop
 * status recorded by hand (PATCH /prospecting/routes/:id/stops/:stopId) all
 * go through here, so a stop, its planned visit and its route never disagree.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A stop still to be done, or being done right now. */
export const OPEN_STOP_STATUSES = ["planned", "en_route", "checked_in"] as const;

/** A running route closes by itself after its last open stop. */
export async function closeRouteIfDone(tx: Tx, routeId: number, now = new Date()) {
  const [openStop] = await tx.select({ id: prospectingRouteStops.id }).from(prospectingRouteStops).where(and(
    eq(prospectingRouteStops.routeId, routeId),
    inArray(prospectingRouteStops.status, [...OPEN_STOP_STATUSES]),
  )).limit(1);
  if (openStop) return false;
  await tx.update(prospectingRoutes).set({ status: "completed", completedAt: now, updatedAt: now })
    .where(and(eq(prospectingRoutes.id, routeId), inArray(prospectingRoutes.status, ["published", "in_progress"])));
  return true;
}

/** The rep is at the business: the stop is checked in and a published route starts. */
export async function checkInStop(tx: Tx, stop: { id: number; routeId: number }, now = new Date()) {
  await tx.update(prospectingRouteStops).set({ status: "checked_in", updatedAt: now })
    .where(eq(prospectingRouteStops.id, stop.id));
  await tx.update(prospectingRoutes).set({ status: "in_progress", startedAt: now, updatedAt: now })
    .where(and(eq(prospectingRoutes.id, stop.routeId), eq(prospectingRoutes.status, "published")));
}

/**
 * The stop is done. Visited: its discovered business is never routed again.
 * Skipped: its planned visit leaves the agenda and the business goes back to
 * the pool for another day.
 */
export async function finishStop(
  tx: Tx,
  stop: { id: number; routeId: number; candidateId: number | null; visitId: number | null },
  outcome: { visited: true } | { visited: false; skipReason: string | null; status?: "skipped" | "rescheduled" },
  now = new Date(),
) {
  await tx.update(prospectingRouteStops).set({
    status: outcome.visited ? "completed" : outcome.status ?? "skipped",
    skipReason: outcome.visited ? null : outcome.skipReason,
    completedAt: now,
    updatedAt: now,
  }).where(eq(prospectingRouteStops.id, stop.id));
  if (outcome.visited) {
    if (stop.candidateId) {
      await tx.update(prospectingCandidates).set({ status: "visited", updatedAt: now })
        .where(eq(prospectingCandidates.id, stop.candidateId));
    }
  } else {
    if (stop.visitId) {
      await tx.update(salesVisits).set({ status: "cancelled", updatedAt: now })
        .where(and(eq(salesVisits.id, stop.visitId), eq(salesVisits.status, "planned")));
    }
    if (stop.candidateId) {
      await tx.update(prospectingCandidates).set({ status: "discovered", updatedAt: now })
        .where(and(eq(prospectingCandidates.id, stop.candidateId), eq(prospectingCandidates.status, "scheduled")));
    }
  }
  await closeRouteIfDone(tx, stop.routeId, now);
}

async function stopOfVisit(tx: Tx, visitId: number) {
  const [stop] = await tx.select({
    id: prospectingRouteStops.id,
    routeId: prospectingRouteStops.routeId,
    candidateId: prospectingRouteStops.candidateId,
    visitId: prospectingRouteStops.visitId,
  }).from(prospectingRouteStops).where(eq(prospectingRouteStops.visitId, visitId)).limit(1);
  return stop ?? null;
}

/** Check-in of a visit that is a route stop. */
export async function markStopOfVisitCheckedIn(tx: Tx, visitId: number) {
  const stop = await stopOfVisit(tx, visitId);
  if (stop) await checkInStop(tx, stop);
  return stop;
}

/** Checkout (or cancellation) of a visit that is a route stop. */
export async function markStopOfVisitFinished(tx: Tx, visitId: number, cancelled: boolean) {
  const stop = await stopOfVisit(tx, visitId);
  if (stop) {
    // The visit itself just finished, so there is no planned visit to cancel.
    await finishStop(tx, { ...stop, visitId: null }, cancelled ? { visited: false, skipReason: "visit_cancelled" } : { visited: true });
  }
  return stop;
}
