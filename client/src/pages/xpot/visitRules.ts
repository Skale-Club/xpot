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
