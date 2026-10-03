import {
  buildReviewUrl,
  extractFirstUrl,
  isGoogleHost,
  isShortLinkHost,
  parseGoogleUrl,
  type ParsedGoogleUrl,
} from "#shared/reviewLink.js";
import type { ReviewLinkPlace } from "#shared/tagsApi.js";

// Google Business / Maps link (or a business name) → the "write a review" link.
// Ported from Skale Club's review-link tool; the field app uses it to set a
// piece's Google Review destination without the customer's Google login.

export type { ReviewLinkPlace };

export class ReviewLinkError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type FetchFn = typeof fetch;

interface ResolveOptions {
  apiKey?: string | null;
  /** Device location, used to rank name searches near where the user is standing. */
  lat?: number;
  lng?: number;
  fetchImpl?: FetchFn;
}

const MAX_HOPS = 6;
const TIMEOUT_MS = 8000;
const PLACES_BASE = "https://places.googleapis.com/v1";
// Redirect targets sometimes arrive as an HTML/JS bounce instead of a Location header.
const GOOGLE_URL_IN_HTML = /https:\/\/(?:www\.|maps\.)?google\.[a-z.]{2,8}\/(?:maps|search)[^"'\s<>\\]*/i;

function mergeParsed(into: ParsedGoogleUrl, next: ParsedGoogleUrl) {
  for (const [key, value] of Object.entries(next) as [keyof ParsedGoogleUrl, unknown][]) {
    if (value !== undefined && key !== "continueUrl") (into as Record<string, unknown>)[key] = value;
  }
}

/** Follow a share link (maps.app.goo.gl, share.google, …) until the Maps URL behind it is readable. */
async function expandGoogleUrl(start: string, fetchImpl: FetchFn): Promise<ParsedGoogleUrl> {
  const merged: ParsedGoogleUrl = {};
  let current = start;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      break;
    }
    // Only Google hosts over https: this endpoint must never become a generic URL fetcher.
    if (url.protocol !== "https:" && url.protocol !== "http:") break;
    if (!isGoogleHost(url.hostname)) {
      if (hop === 0) throw new ReviewLinkError(400, "That is not a Google Maps / Google Business link.");
      break;
    }

    const parsed = parseGoogleUrl(current);
    if (parsed.continueUrl) {
      current = parsed.continueUrl;
      continue;
    }
    mergeParsed(merged, parsed);
    if (merged.placeId || merged.directReviewUrl) break;
    if (!isShortLinkHost(url.hostname)) break;

    url.protocol = "https:";
    const res = await fetchImpl(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
    });
    const location = res.headers.get("location");
    if (location) {
      current = new URL(location, url).toString();
      continue;
    }
    const body = res.ok ? await res.text() : "";
    const inHtml = body.match(GOOGLE_URL_IN_HTML)?.[0];
    if (!inHtml) break;
    current = inHtml.replace(/&amp;/g, "&");
  }

  return merged;
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
}

function toPlace(p: PlacesPlace): ReviewLinkPlace | null {
  if (!p.id) return null;
  return { placeId: p.id, name: p.displayName?.text, address: p.formattedAddress, reviewUrl: buildReviewUrl(p.id) };
}

async function placeDetails(placeId: string, apiKey: string, fetchImpl: FetchFn): Promise<ReviewLinkPlace | null> {
  try {
    const res = await fetchImpl(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,displayName,formattedAddress" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return toPlace((await res.json()) as PlacesPlace);
  } catch {
    return null;
  }
}

async function searchPlaces(
  textQuery: string,
  apiKey: string,
  near: { lat?: number; lng?: number },
  fetchImpl: FetchFn,
): Promise<ReviewLinkPlace[]> {
  const body: Record<string, unknown> = { textQuery, pageSize: 5 };
  if (near.lat !== undefined && near.lng !== undefined) {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 3000 } };
  }
  const res = await fetchImpl(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error("[review-link] Places text search failed", res.status, await res.text().catch(() => ""));
    throw new ReviewLinkError(502, "The Google Places search failed. Check the Google Places key in Admin → Integrations.");
  }
  const data = (await res.json()) as { places?: PlacesPlace[] };
  return (data.places ?? []).map(toPlace).filter((p): p is ReviewLinkPlace => p !== null);
}

/**
 * Turn a pasted/shared Google link — or just a business name — into review links.
 * One result means it was identified; several mean the user has to pick.
 */
export async function resolveReviewLink(input: string, opts: ResolveOptions = {}): Promise<ReviewLinkPlace[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey || null;
  const text = input.trim();
  const link = extractFirstUrl(text);

  if (!link) {
    if (!apiKey) {
      throw new ReviewLinkError(422, "Searching by name needs the Google Places key (Admin → Integrations).");
    }
    return searchPlaces(text.slice(0, 200), apiKey, { lat: opts.lat, lng: opts.lng }, fetchImpl);
  }

  let parsed: ParsedGoogleUrl;
  try {
    parsed = await expandGoogleUrl(link, fetchImpl);
  } catch (err) {
    if (err instanceof ReviewLinkError) throw err;
    console.error("[review-link] expanding short link failed", err);
    throw new ReviewLinkError(502, "Could not open that link. Try again or paste the full Google Maps link.");
  }

  if (parsed.directReviewUrl) {
    return [{ reviewUrl: parsed.directReviewUrl }];
  }

  if (parsed.placeId) {
    const enriched = apiKey ? await placeDetails(parsed.placeId, apiKey, fetchImpl) : null;
    return [enriched ?? { placeId: parsed.placeId, name: parsed.name, reviewUrl: buildReviewUrl(parsed.placeId) }];
  }

  const textQuery = parsed.name || parsed.query;
  if (!textQuery) {
    throw new ReviewLinkError(422, "No business found in that link. Search by the business name instead.");
  }
  if (!apiKey) {
    throw new ReviewLinkError(
      422,
      `That link only carries a name ("${textQuery}"). Finding the business needs the Google Places key (Admin → Integrations).`,
    );
  }
  const near = parsed.lat !== undefined ? { lat: parsed.lat, lng: parsed.lng } : { lat: opts.lat, lng: opts.lng };
  return searchPlaces(textQuery, apiKey, near, fetchImpl);
}
