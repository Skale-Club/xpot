import { PROSPECTING_DAY_END_HOUR } from "#shared/prospecting.js";
import type { TimeWindow } from "./route-optimizer.js";

/**
 * Opening hours as the Google Maps engine exports them, kept in each
 * candidate's raw_payload: `open_hours` is JSON keyed by English weekday
 * (`{"Monday":["9 AM–7 PM"],"Sunday":["Closed"]}`) and `timezone` an IANA zone.
 */
export type RawOpeningHours = { openHours?: string | null; timeZone?: string | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_MINUTES = 24 * 60;

type LocalDate = { year: number; month: number; day: number; weekday: number };

function validTimeZone(timeZone: string | null | undefined) {
  if (!timeZone?.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return null;
  }
}

function localDate(at: Date, timeZone: string): LocalDate {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "long",
  }).formatToParts(at).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday as typeof WEEKDAYS[number]),
  };
}

function offsetMs(at: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(at)).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(at / 1000) * 1000;
}

/** The instant a wall-clock minute of `date` happens in `timeZone` (minutes may run past midnight). */
function zonedInstant(date: LocalDate, minutes: number, timeZone: string) {
  const wall = Date.UTC(date.year, date.month - 1, date.day) + minutes * 60_000;
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

function shiftDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

type ClockTime = { minutes: number; meridiem: "AM" | "PM" | null };

function parseClock(value: string): ClockTime | null {
  const text = value.trim().toUpperCase();
  if (text === "NOON") return { minutes: 12 * 60, meridiem: null };
  if (text === "MIDNIGHT") return { minutes: 0, meridiem: null };
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return { minutes: hour * 60 + minute, meridiem: (match[3] as "AM" | "PM" | undefined) ?? null };
}

function to24h(clock: ClockTime, meridiem: "AM" | "PM" | null) {
  const hour = Math.floor(clock.minutes / 60);
  const minute = clock.minutes % 60;
  if (!meridiem || hour > 12) return clock.minutes;
  return ((hour % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minute;
}

/**
 * One entry of a day ("9 AM–7 PM", "1–8 PM", "Closed", "Open 24 hours") as
 * minutes from that day's midnight; a close past midnight runs over 1440.
 * `undefined` means the text is not understood.
 */
export function parseHoursRange(entry: string): Array<[number, number]> | undefined {
  const text = entry.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^closed$/i.test(text)) return [];
  if (/^open 24 hours$/i.test(text)) return [[0, DAY_MINUTES]];
  const [rawOpen, rawClose, extra] = text.split(/\s*[–—-]\s*/);
  if (!rawOpen || !rawClose || extra !== undefined) return undefined;
  const open = parseClock(rawOpen);
  const close = parseClock(rawClose);
  if (!open || !close) return undefined;
  const closeMinutes = to24h(close, close.meridiem);
  // "1–8 PM" shares the close's meridiem, unless that would open after it ("11–2 PM").
  let openMinutes = to24h(open, open.meridiem ?? close.meridiem);
  if (!open.meridiem && close.meridiem === "PM" && openMinutes > closeMinutes) openMinutes = to24h(open, "AM");
  const end = closeMinutes <= openMinutes ? closeMinutes + DAY_MINUTES : closeMinutes;
  return [[openMinutes, end]];
}

function dayRanges(hours: Record<string, unknown>, weekday: number) {
  const entries = hours[WEEKDAYS[weekday]];
  if (!Array.isArray(entries)) return undefined;
  const ranges: Array<[number, number]> = [];
  for (const entry of entries) {
    if (typeof entry !== "string") return undefined;
    // "11 AM–2 PM, 5–10 PM" may also arrive as a single string.
    for (const part of entry.split(/\s*,\s*/)) {
      const parsed = parseHoursRange(part);
      if (!parsed) return undefined;
      ranges.push(...parsed);
    }
  }
  return ranges;
}

/**
 * When the business is open on the local day of `at`, as absolute windows
 * (including a previous evening that runs past midnight). `null` when the
 * hours are missing or not understood: the place may still be routed.
 * An empty list means it is closed all that day.
 */
export function openWindowsOn(raw: RawOpeningHours, at: Date): TimeWindow[] | null {
  const timeZone = validTimeZone(raw.timeZone);
  if (!timeZone || !raw.openHours?.trim()) return null;
  let hours: unknown;
  try {
    hours = JSON.parse(raw.openHours);
  } catch {
    return null;
  }
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const today = localDate(at, timeZone);
  if (today.weekday < 0) return null;
  const todayRanges = dayRanges(hours as Record<string, unknown>, today.weekday);
  if (!todayRanges) return null;
  const yesterday = shiftDays(today, -1);
  const spillover = (dayRanges(hours as Record<string, unknown>, yesterday.weekday) ?? [])
    .filter(([, close]) => close > DAY_MINUTES)
    .map(([, close]): TimeWindow => ({ start: zonedInstant(today, 0, timeZone), end: zonedInstant(yesterday, close, timeZone) }));
  return [
    ...spillover,
    ...todayRanges.map(([open, close]): TimeWindow => ({ start: zonedInstant(today, open, timeZone), end: zonedInstant(today, close, timeZone) })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Seconds of a same-day route left before the 10 PM end of the day in
 * `timeZone`; `null` when the zone is unknown and no cap can be applied.
 */
export function secondsUntilDayEnd(timeZone: string | null | undefined, now: Date) {
  const zone = validTimeZone(timeZone);
  if (!zone) return null;
  const end = zonedInstant(localDate(now, zone), PROSPECTING_DAY_END_HOUR * 60, zone);
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}
