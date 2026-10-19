import { describe, expect, it, vi } from "vitest";
import { addressQuery, planPrimaryLocationUpdate, resolveGeofenceRadius } from "../server/lead-location.js";
import { geocodeAddress } from "../server/routes/xpot/google-place-profile.js";

const existing = {
  label: "Front",
  addressLine1: "14 Brighton Ave",
  city: "Boston",
  state: "MA",
  postalCode: "02134",
  country: "US",
  lat: "42.35",
  lng: "-71.13",
  geofenceRadiusMeters: 400,
};

describe("resolveGeofenceRadius", () => {
  it("uses the requested radius, else the admin default, else 150", () => {
    expect(resolveGeofenceRadius(250, 300)).toBe(250);
    expect(resolveGeofenceRadius("90", 300)).toBe(90);
    expect(resolveGeofenceRadius(undefined, 300)).toBe(300);
    expect(resolveGeofenceRadius(0, 300)).toBe(300);
    expect(resolveGeofenceRadius(null, null)).toBe(150);
  });
});

describe("planPrimaryLocationUpdate", () => {
  it("keeps coordinates and a custom radius when an editor saves the same address", () => {
    const { data, geocode } = planPrimaryLocationUpdate(existing, {
      addressLine1: "14 Brighton Ave", city: "boston ", state: "MA", postalCode: "02134",
    }, 150);
    expect(geocode).toBeNull();
    expect(data).toMatchObject({ lat: "42.35", lng: "-71.13", geofenceRadiusMeters: 400, label: "Front" });
  });

  it("drops stale coordinates and asks to geocode when the address changed", () => {
    const { data, geocode } = planPrimaryLocationUpdate(existing, {
      addressLine1: "200 Main St", city: "Framingham", state: "MA", postalCode: "01702",
    }, 150);
    expect(data.lat).toBeNull();
    expect(data.lng).toBeNull();
    expect(data.geofenceRadiusMeters).toBe(400);
    expect(geocode).toBe("200 Main St, Framingham, MA 01702, US");
  });

  it("stores coordinates the caller sends, and an explicit null clears them", () => {
    expect(planPrimaryLocationUpdate(existing, { addressLine1: "200 Main St", lat: 42.1, lng: -71.4 }, 150))
      .toMatchObject({ geocode: null, data: { lat: "42.1", lng: "-71.4" } });
    expect(planPrimaryLocationUpdate(existing, { addressLine1: "14 Brighton Ave", lat: null, lng: null }, 150))
      .toMatchObject({ geocode: null, data: { lat: null, lng: null } });
  });

  it("gives a first location the admin default radius", () => {
    const { data, geocode } = planPrimaryLocationUpdate(null, { addressLine1: "1 Elm St", city: "Natick" }, 220);
    expect(data.geofenceRadiusMeters).toBe(220);
    expect(geocode).toBe("1 Elm St, Natick, US");
  });

  it("an explicit radius wins over the stored one", () => {
    expect(planPrimaryLocationUpdate(existing, { ...existing, geofenceRadiusMeters: 75 }, 150).data.geofenceRadiusMeters).toBe(75);
  });

  it("has nothing to geocode for an empty address", () => {
    expect(addressQuery({ addressLine1: "", city: null, state: "MA", postalCode: null, country: "US" })).toBeNull();
  });
});

describe("geocodeAddress", () => {
  it("returns the first Places match as text coordinates", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      places: [{ location: { latitude: 42.27, longitude: -71.41 } }],
    }), { status: 200 }));
    await expect(geocodeAddress("200 Main St, Framingham", "key", fetchImpl)).resolves.toEqual({ lat: "42.27", lng: "-71.41" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("places:searchText");
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("places.location");
  });

  it("returns null on errors or no match", async () => {
    await expect(geocodeAddress("x", "key", async () => new Response("nope", { status: 403 }))).resolves.toBeNull();
    await expect(geocodeAddress("x", "key", async () => new Response("{}", { status: 200 }))).resolves.toBeNull();
    await expect(geocodeAddress("x", "key", async () => { throw new Error("offline"); })).resolves.toBeNull();
  });
});
