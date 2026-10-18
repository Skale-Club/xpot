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
 */
export function visitLocationException(visit: {
  checkedInAt?: string | Date | null;
  validationStatus?: string | null;
}): VisitLocationException | null {
  if (!visit.checkedInAt) return null;
  if (visit.validationStatus === "manual_override" || visit.validationStatus === "outside_geofence") return "outside_area";
  if (visit.validationStatus === "gps_unavailable") return "no_location";
  return null;
}
