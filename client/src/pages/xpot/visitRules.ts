// Pure rules behind a few Visits screens, kept free of app imports so the
// tests can load them directly.

export const GEOFENCE_RADIUS_MIN = 10;
export const GEOFENCE_RADIUS_MAX = 5000;

/**
 * The radius typed into Check-in rules, clamped to what the server accepts.
 * Applied on blur and on save, not on every keystroke: clamping while typing
 * turned an emptied field into "10" and made a new value hard to enter.
 */
export function clampGeofenceRadiusInput(raw: string, fallback: number): number {
  const parsed = Math.floor(Number(raw.trim()));
  if (!raw.trim() || !Number.isFinite(parsed)) return fallback;
  return Math.max(GEOFENCE_RADIUS_MIN, Math.min(GEOFENCE_RADIUS_MAX, parsed));
}

/**
 * The stage a company's status stands for (Prospect → Lead → Customer).
 * "active" is an older status the app shows as Customer, so it counts as one
 * everywhere: the pill, the Customers chip and the "Mark as customer" action.
 */
export function companyStage(status: string): "prospect" | "lead" | "customer" | "inactive" {
  if (status === "customer" || status === "active") return "customer";
  if (status === "prospect" || status === "inactive") return status;
  return "lead";
}

/**
 * Companies list split: a company is "worked" once it is past prospect or has
 * been checked in; the rest are unvisited prospects (the Prospects chip).
 */
export function isWorkedCompany(lead: { id: number; status: string }, checkedInLeadIds: ReadonlySet<number>): boolean {
  return lead.status !== "prospect" || checkedInLeadIds.has(lead.id);
}

type FollowUpLead = {
  nextVisitDueAt?: string | Date | null;
  openFollowUp?: boolean;
  openFollowUpDueAt?: string | Date | null;
};

/** Visit results that mean "come back": the company stays on the follow-up list until the next visit. */
export const FOLLOW_UP_OUTCOMES = ["follow_up", "came_back_later"];

/**
 * Whether a company belongs under the Companies "Follow-up" chip: an open
 * follow-up task, a voice-set return date (nextVisitDueAt), or a last visit
 * that ended as Follow up / Come back later. The return date alone almost
 * never matched: only a voice follow-up sets it and every check-in clears it,
 * and the check-out result picker collects no date.
 */
export function needsFollowUp(lead: FollowUpLead, lastVisitStatus?: string | null): boolean {
  return Boolean(lead.nextVisitDueAt || lead.openFollowUp || (lastVisitStatus && FOLLOW_UP_OUTCOMES.includes(lastVisitStatus)));
}

/** The earliest known follow-up date, for sorting (Infinity when none). */
export function followUpDueTime(lead: FollowUpLead): number {
  const times = [lead.nextVisitDueAt, lead.openFollowUpDueAt]
    .filter((value): value is string | Date => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

export type VisitLocationException = "outside_area" | "no_location";

/**
 * Whether a checked-in visit was accepted without proof that the rep was at
 * the company: outside its area (with a reason, or while blocking is off), or
 * with no location to compare (no GPS fix, or a company without a map
 * location). Planned visits carry the column default and are not flagged.
 * A reason (manual_override) also lets a check-in through with no location at
 * all (server/check-in-geofence.ts): that one was never measured, so it is
 * "no location", not "outside", when the visit says it has no distance.
 */
export function visitLocationException(visit: {
  checkedInAt?: string | Date | null;
  validationStatus?: string | null;
  distanceFromTargetMeters?: number | null;
}): VisitLocationException | null {
  if (!visit.checkedInAt) return null;
  if (visit.validationStatus === "manual_override") return visit.distanceFromTargetMeters === null ? "no_location" : "outside_area";
  if (visit.validationStatus === "outside_geofence") return "outside_area";
  if (visit.validationStatus === "gps_unavailable") return "no_location";
  return null;
}
