export type CheckInValidationStatus = "valid" | "outside_geofence" | "gps_unavailable" | "manual_override";

export type GeofenceDecision =
  | { ok: true; validationStatus: CheckInValidationStatus; manualOverrideReason?: string }
  | { ok: false; code: "outside_geofence"; overrideAllowed: boolean };

/**
 * Whether a check-in may start, and how it is recorded.
 *
 * `distanceMeters` is null when either side has no coordinates (a lead without
 * a geocoded address, or a device that could not get a fix). That is recorded
 * as gps_unavailable and never blocked here: the client decides whether to ask
 * for location first.
 *
 * A reason only counts when the organization allows manual overrides. It used
 * to be enough to send any reason at all, so a rep could bypass the geofence
 * even with overrides switched off.
 */
export function evaluateCheckInGeofence(input: {
  distanceMeters: number | null;
  allowedRadiusMeters: number;
  requiresGps: boolean;
  allowManualOverride: boolean;
  manualOverrideReason?: string | null;
}): GeofenceDecision {
  const reason = input.manualOverrideReason?.trim() || undefined;
  const status: CheckInValidationStatus = input.distanceMeters == null
    ? "gps_unavailable"
    : input.distanceMeters <= input.allowedRadiusMeters ? "valid" : "outside_geofence";

  // Inside the fence the reason is moot: record the visit as what it was.
  if (status === "valid") return { ok: true, validationStatus: "valid" };

  if (reason && input.allowManualOverride) {
    return { ok: true, validationStatus: "manual_override", manualOverrideReason: reason };
  }

  if (status === "outside_geofence" && input.requiresGps) {
    return { ok: false, code: "outside_geofence", overrideAllowed: input.allowManualOverride };
  }

  return { ok: true, validationStatus: status };
}
