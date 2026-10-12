/**
 * Turn-by-turn hand-off for a prospecting route. Google Maps everywhere;
 * on an iPhone or iPad the rep can also pick Apple Maps.
 */

type LatLng = { lat: string | number; lng: string | number };
type MapStop = LatLng & { status: string };

/** Google Maps URLs keep at most nine waypoints; more are silently dropped. */
export const MAPS_URL_MAX_STOPS = 10;

const OPEN_STOP_STATUSES = ["planned", "en_route", "checked_in"];

const point = (value: LatLng) => `${value.lat},${value.lng}`;

/** iPadOS reports itself as a Mac; touch support tells them apart. */
export function isAppleMobileDevice(userAgent: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * The next stops still to visit, and where the trip starts. Once the day has
 * begun the trip starts wherever the rep is now, which both apps use when no
 * origin is given.
 */
function remainingTrip(start: LatLng, stops: MapStop[]) {
  const remaining = stops.filter((stop) => OPEN_STOP_STATUSES.includes(stop.status)).slice(0, MAPS_URL_MAX_STOPS);
  return { remaining, origin: remaining.length === stops.length ? start : null };
}

export function googleRouteUrl(start: LatLng, stops: MapStop[]) {
  const { remaining, origin } = remainingTrip(start, stops);
  if (!remaining.length) return null;
  const params = new URLSearchParams({ api: "1", destination: point(remaining.at(-1)!), travelmode: "driving" });
  if (origin) params.set("origin", point(origin));
  if (remaining.length > 1) params.set("waypoints", remaining.slice(0, -1).map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps takes one `daddr` per stop. Versions that ignore the extra stops
 * still open directions to the next one, which is what the rep needs first.
 */
export function appleRouteUrl(start: LatLng, stops: MapStop[]) {
  const { remaining, origin } = remainingTrip(start, stops);
  if (!remaining.length) return null;
  const params = new URLSearchParams();
  if (origin) params.set("saddr", point(origin));
  for (const stop of remaining) params.append("daddr", point(stop));
  params.set("dirflg", "d");
  return `https://maps.apple.com/?${params.toString()}`;
}

export function googleStopUrl(stop: LatLng) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: point(stop), travelmode: "driving" }).toString()}`;
}

export function appleStopUrl(stop: LatLng) {
  return `https://maps.apple.com/?${new URLSearchParams({ daddr: point(stop), dirflg: "d" }).toString()}`;
}
