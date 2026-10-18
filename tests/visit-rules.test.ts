import { describe, expect, it } from "vitest";
import { clampGeofenceRadiusInput, visitLocationException } from "../client/src/pages/xpot/visitRules";

describe("clampGeofenceRadiusInput", () => {
  it("keeps typed values in the 10-5000 range the server accepts", () => {
    expect(clampGeofenceRadiusInput("250", 150)).toBe(250);
    expect(clampGeofenceRadiusInput("3", 150)).toBe(10);
    expect(clampGeofenceRadiusInput("90000", 150)).toBe(5000);
    expect(clampGeofenceRadiusInput("120.7", 150)).toBe(120);
  });

  it("falls back to the saved radius when the box is empty or not a number", () => {
    expect(clampGeofenceRadiusInput("", 150)).toBe(150);
    expect(clampGeofenceRadiusInput("  ", 150)).toBe(150);
    expect(clampGeofenceRadiusInput("abc", 300)).toBe(300);
  });
});

describe("visitLocationException", () => {
  const checkedInAt = "2026-10-18T12:00:00Z";

  it("marks visits accepted outside the area or without a location", () => {
    expect(visitLocationException({ checkedInAt, validationStatus: "manual_override" })).toBe("outside_area");
    expect(visitLocationException({ checkedInAt, validationStatus: "outside_geofence" })).toBe("outside_area");
    expect(visitLocationException({ checkedInAt, validationStatus: "gps_unavailable" })).toBe("no_location");
  });

  it("leaves validated and not-yet-started visits alone", () => {
    expect(visitLocationException({ checkedInAt, validationStatus: "valid" })).toBeNull();
    // Planned visits carry the column default gps_unavailable.
    expect(visitLocationException({ checkedInAt: null, validationStatus: "gps_unavailable" })).toBeNull();
  });
});
