// Route distances for people: miles in English, kilometres in Portuguese and
// Spanish. Kept free of app imports so the tests can load it; screens use
// formatDistance from ./utils, which passes the language in use.

const METERS_PER_MILE = 1609.344;

/** Whether a locale reads distances in miles ("en-US", "en"). */
export function usesMiles(locale: string): boolean {
  return locale.toLowerCase().split("-")[0] === "en";
}

/** "12.4 mi" in English, "20 km" / "1,5 km" in Portuguese and Spanish. */
export function formatDistanceFor(meters: number, locale: string): string {
  const safe = Math.max(0, Number.isFinite(meters) ? meters : 0);
  const miles = usesMiles(locale);
  const value = miles ? safe / METERS_PER_MILE : safe / 1000;
  const number = value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 });
  return `${number} ${miles ? "mi" : "km"}`;
}
