const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "primaryTypeDisplayName",
  "websiteUri",
  "nationalPhoneNumber",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "currentOpeningHours.openNow",
].join(",");

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const profileCache = new Map<string, { expiresAt: number; profile: GooglePlaceProfile }>();

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  currentOpeningHours?: { openNow?: boolean };
};

export type GooglePlaceProfile = {
  placeId: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  address: {
    addressLine1: string;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string;
    lat: string | null;
    lng: string | null;
  } | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string | null;
  openNow: boolean | null;
};

function text(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function component(
  components: GoogleAddressComponent[],
  types: string[],
  short = false,
): string | null {
  for (const type of types) {
    const found = components.find((candidate) => candidate.types?.includes(type));
    const value = text(short ? found?.shortText : found?.longText);
    if (value) return value;
  }
  return null;
}

function normalizeAddress(place: GooglePlaceDetails): GooglePlaceProfile["address"] {
  const components = place.addressComponents ?? [];
  const number = component(components, ["street_number"]);
  const route = component(components, ["route"]);
  const addressLine1 = text([number, route].filter(Boolean).join(" "))
    ?? text(place.formattedAddress?.split(",")[0]);
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;

  if (!addressLine1 && typeof latitude !== "number" && typeof longitude !== "number") return null;

  return {
    addressLine1: addressLine1 ?? "",
    city: component(components, ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2"]),
    state: component(components, ["administrative_area_level_1"], true),
    postalCode: component(components, ["postal_code"]),
    country: component(components, ["country"], true) ?? "US",
    lat: typeof latitude === "number" ? String(latitude) : null,
    lng: typeof longitude === "number" ? String(longitude) : null,
  };
}

/** Load the canonical business data used when a company links its Google place. */
export async function fetchGooglePlaceProfile(
  placeId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<GooglePlaceProfile> {
  const cacheHit = fetchImpl === fetch ? profileCache.get(placeId) : undefined;
  if (cacheHit && cacheHit.expiresAt > Date.now()) return cacheHit.profile;
  const response = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELDS,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Google business profile could not be loaded");
  }

  const place = await response.json() as GooglePlaceDetails;
  const profile = {
    placeId: text(place.id) ?? placeId,
    name: text(place.displayName?.text),
    phone: text(place.nationalPhoneNumber),
    website: text(place.websiteUri),
    industry: text(place.primaryTypeDisplayName?.text),
    address: normalizeAddress(place),
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    mapsUrl: text(place.googleMapsUri),
    openNow: typeof place.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
  };
  if (fetchImpl === fetch) {
    if (profileCache.size > 500) {
      const oldest = profileCache.keys().next().value;
      if (oldest) profileCache.delete(oldest);
    }
    profileCache.set(placeId, { expiresAt: Date.now() + 5 * 60_000, profile });
  }
  return profile;
}

/**
 * Best-effort coordinates for a typed address, through the same Places API
 * (New) key the rest of the app uses (Text Search, location field only), so no
 * separate Geocoding API has to be enabled. Any failure returns null: the
 * caller then stores the address without coordinates.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ lat: string; lng: string } | null> {
  try {
    const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: address, pageSize: 1 }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { places?: Array<{ location?: { latitude?: number; longitude?: number } }> };
    const location = data.places?.[0]?.location;
    if (typeof location?.latitude !== "number" || typeof location?.longitude !== "number") return null;
    return { lat: String(location.latitude), lng: String(location.longitude) };
  } catch {
    return null;
  }
}
