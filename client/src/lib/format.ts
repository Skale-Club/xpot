// The app's formatters: dates, money, percentages, distances, phone numbers and
// durations, all written the way the app's language writes them (the language
// picked in Settings, not the browser's), so the same value reads the same on
// every screen. Every function takes an optional `locale` for tests and for
// components that already hold `t.locale`; otherwise it uses currentLocale().
//
// Money is integer cents everywhere (formatMoney). formatCents and
// formatCurrency keep the names pages/xpot/utils.ts exports, so callers can
// move here without changing their calls.
//
// Imports are relative (not "@/…") so the unit tests can load this file.

import { currentLocale, translate } from "../i18n";
import { kitMessages } from "../i18n/messages/kit";
import { formatPhone as formatE164 } from "../../../shared/phone";

type DateInput = string | number | Date | null | undefined;

/** Shown for a missing value. */
export const EMPTY_VALUE = "—";

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** "Mar 4, 2026, 2:05 PM" / "4 de mar. de 2026, 14:05". Missing or invalid: "—". */
export function formatDateTime(value: DateInput, locale: string = currentLocale()): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * "Mar 4, 2026" by default; pass Intl options for another shape
 * (`{ month: "short", day: "numeric" }` → "Mar 4").
 */
export function formatDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  locale: string = currentLocale(),
): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** "2:05 PM" / "14:05". */
export function formatTime(value: DateInput, locale: string = currentLocale()): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** Integer cents → "$1,234.50" / "US$ 1.234,50". Missing counts as 0. */
export function formatMoney(cents: number | null | undefined, currency: string = "USD", locale: string = currentLocale()): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

/** Same as formatMoney (the name pages/xpot/utils.ts uses). */
export const formatCents = formatMoney;

/** Whole currency units, no decimals ("$1,235"), for dashboard totals. */
export function formatCurrency(value: number | null | undefined, currency: string = "USD", locale: string = currentLocale()): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

/** A ratio (0.452) → "45%" / "45 %" as the language writes it. Not finite: "—". */
export function formatPercent(
  ratio: number | null | undefined,
  { digits = 0, locale = currentLocale() }: { digits?: number; locale?: string } = {},
): string {
  if (ratio == null || !Number.isFinite(ratio)) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(ratio);
}

/** `part` of `total` as a percentage; 0% when there is no total. */
export function formatShare(part: number, total: number, options?: { digits?: number; locale?: string }): string {
  return formatPercent(total ? part / total : 0, options);
}

// ─── Distances ────────────────────────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/**
 * A distance for people. English uses miles ("0.4 mi", "12 mi"; feet under a
 * tenth of a mile), every other language metres and kilometres ("85 m", "1,4 km").
 */
export function formatDistance(meters: number | null | undefined, locale: string = currentLocale()): string {
  if (meters == null || !Number.isFinite(meters)) return EMPTY_VALUE;
  const value = Math.max(0, meters);
  const number = (n: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  if (locale.toLowerCase().startsWith("en")) {
    const miles = value / METERS_PER_MILE;
    if (miles < 0.1) return `${number(Math.round(value * FEET_PER_METER), 0)} ft`;
    return `${number(miles, miles < 10 ? 1 : 0)} mi`;
  }
  // Round first, so 999.6 m reads "1 km" rather than "1,000 m".
  if (Math.round(value) < 1000) return `${number(Math.round(value), 0)} m`;
  const km = value / 1000;
  return `${number(km, km < 10 ? 1 : 0)} km`;
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/** E.164 → "+1 (508) 555-0100" (shared/phone.ts); missing: "". */
export function formatPhone(e164: string | null | undefined): string {
  return formatE164(e164);
}

// ─── Durations ────────────────────────────────────────────────────────────────

/** Seconds → "45 s", "12 min", "1 h 05 min", "2 h". Missing or negative: "—". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return EMPTY_VALUE;
  if (seconds < 60) return translate(kitMessages, "durationSeconds", { seconds: Math.round(seconds) });
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return translate(kitMessages, "durationMinutes", { minutes: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return translate(kitMessages, "durationHoursOnly", { hours });
  return translate(kitMessages, "durationHours", { hours, minutes: String(minutes).padStart(2, "0") });
}
