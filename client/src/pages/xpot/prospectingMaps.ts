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

export { isAppleMobileDevice } from "../../lib/device";

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
