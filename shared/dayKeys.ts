// The days of a sales window, by calendar date. Stepping a timestamp by 24 hours
// breaks twice a year: the night clocks go back the day is 25 hours long, a step
// lands on the same date again and the chart shows "Nov 1" twice, with the last
// day's sales in the wrong bar.

/** Local midnight of `days - 1` calendar days before `now`'s date: the first day of a `days`-day window ending today. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/** "2026-11-01" in local time. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** One key per calendar day of the window, in order, each exactly one date after the last. */
export function calendarDayKeys(from: Date, days: number): string[] {
  return Array.from({ length: days }, (_, index) => localDayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + index)));
}
