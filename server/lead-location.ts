/**
 * Rules for writing a company's primary location (PATCH /leads/:id/location
 * and every place that creates a location).
 */
import { sql } from "drizzle-orm";
import { salesAppSettings } from "#shared/schema.js";

/** Fallback when the settings row cannot be read; also the column default. */
export const FALLBACK_GEOFENCE_RADIUS_METERS = 150;

/**
 * The admin's "Default geofence radius", read inside the INSERT itself so
 * transactional create paths (route publishing, prepare-check-in) need no
 * extra round trip. Used for every new location that was given no radius.
 */
export function defaultGeofenceRadiusSql() {
  return sql<number>`coalesce((select ${salesAppSettings.defaultGeofenceRadiusMeters} from ${salesAppSettings} order by ${salesAppSettings.id} limit 1), ${FALLBACK_GEOFENCE_RADIUS_METERS})`;
}

/**
 * The radius a location is stored with: the caller's when it gave a usable
 * one, otherwise the admin's "Default geofence radius". The column is NOT NULL,
 * so new locations always get a concrete value; the setting used to be ignored
 * because every create path hard-coded 150.
 */
export function resolveGeofenceRadius(requested: unknown, defaultRadiusMeters: number | null | undefined): number {
  const value = typeof requested === "string" && requested.trim() ? Number(requested) : requested;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  return defaultRadiusMeters && defaultRadiusMeters > 0 ? defaultRadiusMeters : FALLBACK_GEOFENCE_RADIUS_METERS;
}

type ExistingLocation = {
  label?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  lat?: string | null;
  lng?: string | null;
  geofenceRadiusMeters?: number | null;
};

export type PrimaryLocationWrite = {
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  lat: string | null;
  lng: string | null;
  geofenceRadiusMeters: number;
  isPrimary: true;
};

const norm = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const coordinate = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : null;
};

/** The single-line address Google is asked to place, or null when there is nothing to place. */
export function addressQuery(location: Pick<PrimaryLocationWrite, "addressLine1" | "city" | "state" | "postalCode" | "country">): string | null {
  const parts = [location.addressLine1, location.city, [location.state, location.postalCode].filter(Boolean).join(" "), location.country]
    .map((part) => part?.trim())
    .filter(Boolean);
  return location.addressLine1.trim() || location.city?.trim() ? parts.join(", ") : null;
}

/**
 * What to store when a client updates the primary location.
 *
 * The address fields are a full replacement, as before (an omitted field is
 * cleared). Coordinates and radius are not: editors such as
 * CompanyInlineEditor and EditLeadDialog send only the address, and the old
 * handler wrote lat/lng = null and radius = 150 on every save, which silently
 * switched the check-in geofence off for that company.
 *
 * - lat/lng sent (a number, or explicit null): stored as sent.
 * - lat/lng omitted, address unchanged: the existing coordinates are kept.
 * - lat/lng omitted, address changed: the old coordinates point at the old
 *   place, so they are dropped and `geocode` carries the new address for the
 *   caller to look up (when Google is configured); without a result the
 *   company simply has no coordinates, as for any other unplaced address.
 * - geofenceRadiusMeters omitted: the existing radius is kept (a custom
 *   radius is never reset), or the admin default for a new location.
 */
export function planPrimaryLocationUpdate(
  existing: ExistingLocation | null | undefined,
  body: Record<string, unknown>,
  defaultRadiusMeters: number | null | undefined,
): { data: PrimaryLocationWrite; geocode: string | null } {
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  const data: PrimaryLocationWrite = {
    label: str(body.label) || existing?.label || "Main",
    addressLine1: str(body.addressLine1) || "",
    addressLine2: str(body.addressLine2),
    city: str(body.city),
    state: str(body.state),
    postalCode: str(body.postalCode),
    country: str(body.country) || "US",
    lat: null,
    lng: null,
    geofenceRadiusMeters: resolveGeofenceRadius(body.geofenceRadiusMeters, existing?.geofenceRadiusMeters || defaultRadiusMeters),
    isPrimary: true,
  };

  const coordsSent = body.lat !== undefined || body.lng !== undefined;
  if (coordsSent) {
    data.lat = coordinate(body.lat);
    data.lng = coordinate(body.lng);
    if (data.lat == null || data.lng == null) data.lat = data.lng = null;
    return { data, geocode: null };
  }

  const addressChanged = !existing
    || norm(existing.addressLine1) !== norm(data.addressLine1)
    || norm(existing.city) !== norm(data.city)
    || norm(existing.state) !== norm(data.state)
    || norm(existing.postalCode) !== norm(data.postalCode)
    || norm(existing.country || "US") !== norm(data.country);

  if (!addressChanged) {
    data.lat = existing?.lat ?? null;
    data.lng = existing?.lng ?? null;
    return { data, geocode: null };
  }
  return { data, geocode: addressQuery(data) };
}
