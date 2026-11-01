// Small, pure helpers of the customer panel.

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 hours ago" / "há 2 horas": the largest unit that fits, in the app's language. */
export function relativeTime(iso: string, now: number, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = then - now;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return format.format(Math.round(diff / size), unit);
  }
  return format.format(0, "minute");
}

/** The code as people type it ("7k4m 9x2p"), kept short and upper case; the server normalizes the rest. */
export function cleanPlateCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z-\s]/g, "").slice(0, 14);
}

/** Whether the plate code field holds enough to ask for a code (8 to 10 characters, as the printed codes are). */
export function plateCodeReady(input: string): boolean {
  const letters = input.replace(/[\s-]/g, "");
  return letters.length >= 8 && letters.length <= 10;
}
