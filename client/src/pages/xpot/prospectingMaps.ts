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

import { isAppleMobileDevice } from "../../lib/device";

export { isAppleMobileDevice };

/**
 * The next stops still to visit. The native map app deliberately receives no
 * fixed origin so it starts from the phone's live location.
 */
function remainingTrip(stops: MapStop[]) {
  const open = stops.filter((stop) => OPEN_STOP_STATUSES.includes(stop.status));
  return open.slice(0, MAPS_URL_MAX_STOPS) as LatLng[];
}

export function googleRouteUrl(_start: LatLng, stops: MapStop[]) {
  const remaining = remainingTrip(stops);
  if (!remaining.length) return null;
  const params = new URLSearchParams({ api: "1", destination: point(remaining.at(-1)!), travelmode: "driving" });
  if (remaining.length > 1) params.set("waypoints", remaining.slice(0, -1).map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps takes one `daddr` per stop. Versions that ignore the extra stops
 * still open directions to the next one, which is what the rep needs first.
 */
export function appleRouteUrl(_start: LatLng, stops: MapStop[]) {
  const remaining = remainingTrip(stops);
  if (!remaining.length) return null;
  const params = new URLSearchParams();
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

/** This device is an iPhone or iPad (reads the browser; false outside one). */
export function isAppleMobile() {
  return typeof navigator !== "undefined" && isAppleMobileDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Driving directions to one stop in the device's maps app: Apple Maps on an iPhone or iPad, Google Maps elsewhere. */
export function stopNavigationUrl(stop: LatLng, apple = isAppleMobile()) {
  return apple ? appleStopUrl(stop) : googleStopUrl(stop);
}

/** A place on the map (an address or coordinates), not directions. */
export function googlePlaceUrl(place: string | LatLng) {
  const query = typeof place === "string" ? place : point(place);
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query }).toString()}`;
}

export function applePlaceUrl(place: string | LatLng) {
  const params: Record<string, string> = typeof place === "string" ? { q: place } : { ll: point(place), q: point(place) };
  return `https://maps.apple.com/?${new URLSearchParams(params).toString()}`;
}

/** A place in the device's maps app, for "open in maps" links (the check-in address, the live map). */
export function placeUrl(place: string | LatLng, apple = isAppleMobile()) {
  return apple ? applePlaceUrl(place) : googlePlaceUrl(place);
}
