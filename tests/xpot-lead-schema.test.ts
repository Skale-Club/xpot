// Lead creation from a map result.
//
// Google Places and navigator.geolocation both report coordinates as numbers,
// but lat/lng are text columns. The schema used to demand strings, so every
// "check in at this place" flow died with a 400 validation error before it ever
// reached the database.

import { describe, expect, it } from "vitest";
import { xpotLeadCreateSchema } from "../shared/xpot.js";
import { insertSalesLeadLocationSchema } from "../shared/schema/sales.js";

const place = {
  name: "St. Charles Urgent Care",
  source: "google_places",
  primaryLocation: {
    label: "Main",
    addressLine1: "51781 Huntington Rd",
    city: "La Pine",
    state: "OR",
    country: "US",
    geofenceRadiusMeters: 150,
    isPrimary: true,
  },
};

describe("xpotLeadCreateSchema", () => {
  it("accepts numeric coordinates and stores them as text", () => {
    const parsed = xpotLeadCreateSchema.parse({
      ...place,
      primaryLocation: { ...place.primaryLocation, lat: 43.6701, lng: -121.5045 },
    });
    expect(parsed.primaryLocation?.lat).toBe("43.6701");
    expect(parsed.primaryLocation?.lng).toBe("-121.5045");
  });

  it("still accepts strings, and negative/zero values survive", () => {
    const parsed = xpotLeadCreateSchema.parse({
      ...place,
      primaryLocation: { ...place.primaryLocation, lat: "43.6701", lng: 0 },
    });
    expect(parsed.primaryLocation?.lat).toBe("43.6701");
    expect(parsed.primaryLocation?.lng).toBe("0");
  });

  it("allows a lead with no location at all (manual create during check-in)", () => {
    const parsed = xpotLeadCreateSchema.parse({ name: "Test", source: "manual" });
    expect(parsed.primaryLocation).toBeUndefined();
  });

  it("still rejects a location with no street address", () => {
    const result = xpotLeadCreateSchema.safeParse({
      ...place,
      primaryLocation: { ...place.primaryLocation, addressLine1: "" },
    });
    expect(result.success).toBe(false);
  });
});

describe("insertSalesLeadLocationSchema", () => {
  it("normalizes numeric coordinates the same way", () => {
    const parsed = insertSalesLeadLocationSchema.parse({
      leadId: 1,
      addressLine1: "51781 Huntington Rd",
      lat: 43.6701,
      lng: -121.5045,
    });
    expect(parsed.lat).toBe("43.6701");
    expect(parsed.lng).toBe("-121.5045");
  });
});
