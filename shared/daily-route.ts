export const DEFAULT_DAILY_ROUTE_TIMEZONE = "America/New_York";

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dailyRouteDate(now = new Date(), configuredTimezone = DEFAULT_DAILY_ROUTE_TIMEZONE) {
  const timezone = isValidTimezone(configuredTimezone) ? configuredTimezone : DEFAULT_DAILY_ROUTE_TIMEZONE;
  return { routeDate: localDateInTimezone(timezone, now), timezone };
}

export function manualCheckInLeadId(location: string): number | null {
  const url = new URL(location, "https://xpot.local");
  if (url.pathname !== "/leads/prospecting") return null;
  const leadId = Number(url.searchParams.get("leadId"));
  return Number.isSafeInteger(leadId) && leadId > 0 ? leadId : null;
}

export type GoogleOptimizedRoute = {
  optimizedIntermediateWaypointIndex?: number[];
  legs?: Array<{ duration?: string }>;
  polyline?: { encodedPolyline?: string };
};

export function parseGoogleRoutePlan(keys: string[], route: GoogleOptimizedRoute) {
  const intermediates = keys.slice(1, -1);
  const optimized = route.optimizedIntermediateWaypointIndex?.length === intermediates.length
    ? route.optimizedIntermediateWaypointIndex.map((index) => intermediates[index])
    : intermediates;
  const orderedKeys = keys.length > 1 ? [keys[0], ...optimized, keys[keys.length - 1]] : keys;
  const driveMinutes = [0, ...(route.legs ?? []).map((leg) => {
    const seconds = Number.parseFloat(leg.duration?.replace(/s$/, "") ?? "0");
    return Number.isFinite(seconds) ? Math.max(1, Math.round(seconds / 60)) : 0;
  })].slice(0, orderedKeys.length);
  while (driveMinutes.length < orderedKeys.length) driveMinutes.push(0);
  return { orderedKeys, driveMinutes, polyline: route.polyline?.encodedPolyline };
}
