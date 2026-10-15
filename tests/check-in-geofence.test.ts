import { describe, expect, it } from "vitest";
import { evaluateCheckInGeofence } from "../server/check-in-geofence";

const base = { allowedRadiusMeters: 150, requiresGps: true, allowManualOverride: true };

describe("evaluateCheckInGeofence", () => {
  it("accepts a check-in inside the fence", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: 80 })).toEqual({ ok: true, validationStatus: "valid" });
  });

  it("ignores a reason sent from inside the fence", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: 80, manualOverrideReason: "imprecise" }))
      .toEqual({ ok: true, validationStatus: "valid" });
  });

  it("refuses outside the fence without a reason and says an override is possible", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: 2400 }))
      .toEqual({ ok: false, code: "outside_geofence", overrideAllowed: true });
  });

  it("records an override outside the fence when a reason is given", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: 2400, manualOverrideReason: "  Computer location is imprecise " }))
      .toEqual({ ok: true, validationStatus: "manual_override", manualOverrideReason: "Computer location is imprecise" });
  });

  it("does not let a reason bypass the fence when overrides are off", () => {
    expect(evaluateCheckInGeofence({ ...base, allowManualOverride: false, distanceMeters: 2400, manualOverrideReason: "please" }))
      .toEqual({ ok: false, code: "outside_geofence", overrideAllowed: false });
  });

  it("treats a blank reason as no reason", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: 2400, manualOverrideReason: "   " }))
      .toEqual({ ok: false, code: "outside_geofence", overrideAllowed: true });
  });

  it("records a check-in without coordinates as gps_unavailable", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: null })).toEqual({ ok: true, validationStatus: "gps_unavailable" });
  });

  it("records a check-in without coordinates but with a reason as an override", () => {
    expect(evaluateCheckInGeofence({ ...base, distanceMeters: null, manualOverrideReason: "No location on this computer" }))
      .toEqual({ ok: true, validationStatus: "manual_override", manualOverrideReason: "No location on this computer" });
  });

  it("lets a check-in outside the fence through when GPS is not required", () => {
    expect(evaluateCheckInGeofence({ ...base, requiresGps: false, distanceMeters: 2400 }))
      .toEqual({ ok: true, validationStatus: "outside_geofence" });
  });
});
