import { describe, expect, it, vi } from "vitest";
import { fetchGooglePlaceProfile } from "../server/routes/xpot/google-place-profile.js";

describe("fetchGooglePlaceProfile", () => {
  it("normalizes the Google place fields used to link and refresh a company", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: "ChIJ1234567890",
      displayName: { text: "Celes Confections" },
      formattedAddress: "14 Brighton Ave, Boston, MA 02134, USA",
      nationalPhoneNumber: "(617) 555-0199",
      websiteUri: "https://celes.example/",
      primaryTypeDisplayName: { text: "Bakery" },
      location: { latitude: 42.35, longitude: -71.13 },
      addressComponents: [
        { longText: "14", shortText: "14", types: ["street_number"] },
        { longText: "Brighton Avenue", shortText: "Brighton Ave", types: ["route"] },
        { longText: "Boston", shortText: "Boston", types: ["locality"] },
        { longText: "Massachusetts", shortText: "MA", types: ["administrative_area_level_1"] },
        { longText: "02134", shortText: "02134", types: ["postal_code"] },
        { longText: "United States", shortText: "US", types: ["country"] },
      ],
      rating: 4.8,
      userRatingCount: 127,
      googleMapsUri: "https://maps.google.com/?cid=123",
      currentOpeningHours: { openNow: true },
    }), { status: 200 }));

    const profile = await fetchGooglePlaceProfile("ChIJ1234567890", "api-key", fetchImpl);

    expect(profile).toEqual({
      placeId: "ChIJ1234567890",
      name: "Celes Confections",
      phone: "(617) 555-0199",
      website: "https://celes.example/",
      industry: "Bakery",
      address: {
        addressLine1: "14 Brighton Avenue",
        city: "Boston",
        state: "MA",
        postalCode: "02134",
        country: "US",
        lat: "42.35",
        lng: "-71.13",
      },
      rating: 4.8,
      reviewCount: 127,
      mapsUrl: "https://maps.google.com/?cid=123",
      openNow: true,
    });
  });
});
