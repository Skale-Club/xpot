// Turning a Google Business / Google Maps link into the "write a review" link.
//
// The review link is always https://search.google.com/local/writereview?placeid=<PLACE_ID>,
// so the work is finding the Place ID. Pure helpers live here (no network) so they can
// be unit-tested; server/routes/reviewLink.ts follows short links and calls Places.

export const REVIEW_URL_BASE = "https://search.google.com/local/writereview?placeid=";

export function buildReviewUrl(placeId: string): string {
  return REVIEW_URL_BASE + encodeURIComponent(placeId);
}

/**
 * True when the link already opens Google's "write a review" form. A Maps or
 * share link only shows the business, so a piece pointing at it makes the
 * customer hunt for the review button.
 */
export function isReviewFormUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "search.google.com") return url.pathname === "/local/writereview" && !!url.searchParams.get("placeid");
  if (host === "g.page") return /^\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(url.pathname);
  return false;
}

// Short-link hosts the server is allowed to request in order to read their redirect.
const SHORT_LINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.page", "share.google", "g.co"]);
// google.com, www.google.com.br, maps.google.co.uk, consent.google.de ...
const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/;

export function isShortLinkHost(host: string): boolean {
  return SHORT_LINK_HOSTS.has(host.toLowerCase());
}

export function isGoogleHost(host: string): boolean {
  const h = host.toLowerCase();
  return SHORT_LINK_HOSTS.has(h) || GOOGLE_HOST.test(h);
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const SCHEMELESS_URL_IN_TEXT =
  /(?:^|\s)((?:maps\.app\.goo\.gl|goo\.gl|g\.page|share\.google|g\.co|(?:[a-z0-9-]+\.)*google\.[a-z.]{2,8})\/[^\s<>"']*)/i;

/**
 * Pull the first link out of whatever was pasted or shared. The Maps app shares
 * "Business name\nAddress\nhttps://maps.app.goo.gl/…", so the URL is rarely alone.
 */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_IN_TEXT)?.[0] ?? (() => {
    const bare = text.match(SCHEMELESS_URL_IN_TEXT)?.[1];
    return bare ? `https://${bare}` : undefined;
  })();
  if (!match) return null;
  return match.replace(/[).,;!?]+$/, "");
}

function toBase64Url(bytes: number[]): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c++) out += alphabet[(n >> (18 - c * 6)) & 63];
  }
  return out;
}

function uint64LE(value: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) bytes.push(Number((value >> BigInt(i * 8)) & BigInt(0xff)));
  return bytes;
}

/**
 * Google Maps URLs carry a feature id ("0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52").
 * A "ChIJ…" Place ID is that same pair, protobuf-encoded (two fixed64 fields inside
 * field 1) and base64url'd — so it can be rebuilt offline without the Places API.
 */
export function fidToPlaceId(fid: string): string | null {
  const m = fid.match(/^0x([0-9a-f]{1,16}):0x([0-9a-f]{1,16})$/i);
  if (!m) return null;
  const hi = BigInt(`0x${m[1]}`);
  const lo = BigInt(`0x${m[2]}`);
  if (hi === BigInt(0) || lo === BigInt(0)) return null;
  return toBase64Url([0x0a, 0x12, 0x09, ...uint64LE(hi), 0x11, ...uint64LE(lo)]);
}

export interface ParsedGoogleUrl {
  /** Place ID read from the URL, or rebuilt from its feature id. */
  placeId?: string;
  /** g.page/r/<code> links already have a review form at <link>/review. */
  directReviewUrl?: string;
  name?: string;
  query?: string;
  lat?: number;
  lng?: number;
  cid?: string;
  /** consent.google.* interstitials wrap the real destination in ?continue=. */
  continueUrl?: string;
}

const PLACE_ID_SHAPE = /^[A-Za-z0-9_-]{20,}$/;
const LAT_LNG = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function parseGoogleUrl(raw: string): ParsedGoogleUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {};
  }
  const host = url.hostname.toLowerCase();
  const params = url.searchParams;
  const out: ParsedGoogleUrl = {};

  if (/^consent\.google\./.test(host)) {
    const next = params.get("continue");
    if (next) out.continueUrl = next;
    return out;
  }

  if (host === "g.page") {
    const code = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)/)?.[1];
    if (code) out.directReviewUrl = `https://g.page/r/${code}/review`;
    return out;
  }

  const directId = params.get("placeid") || params.get("place_id") || params.get("query_place_id");
  if (directId && PLACE_ID_SHAPE.test(directId)) out.placeId = directId;

  const decoded = safeDecode(url.pathname + url.search);
  if (!out.placeId) {
    const fromData = decoded.match(/!19s([A-Za-z0-9_-]{20,})/)?.[1];
    if (fromData) out.placeId = fromData;
  }
  if (!out.placeId) {
    const fid = decoded.match(/(?:!1s|[?&]ftid=|[?&]fid=)(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})/i)?.[1];
    const fromFid = fid ? fidToPlaceId(fid) : null;
    if (fromFid) out.placeId = fromFid;
  }

  const cid = params.get("cid") || params.get("ludocid");
  if (cid && /^\d{5,20}$/.test(cid)) out.cid = cid;

  const placeName = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  if (placeName) {
    const name = safeDecode(placeName).trim();
    if (name && !LAT_LNG.test(name)) out.name = name;
  }
  const searchPath = url.pathname.match(/\/maps\/search\/([^/]+)/)?.[1];
  const q = params.get("q") || params.get("query") || (searchPath ? safeDecode(searchPath) : null);
  if (q) {
    const coords = q.match(LAT_LNG);
    if (coords) {
      out.lat = Number(coords[1]);
      out.lng = Number(coords[2]);
    } else {
      out.query = q.trim();
    }
  }

  // "!3d<lat>!4d<lng>" is the place's own pin; "@lat,lng" is only the map viewport.
  const pin = decoded.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ??
    url.pathname.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (pin) {
    out.lat = Number(pin[1]);
    out.lng = Number(pin[2]);
  }

  return out;
}
