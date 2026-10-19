// The Tags charts and counters in one place: the module dashboard and a piece's
// dashboard draw the same QR / NFC bars, with the same day labels, tooltip and
// colours, and the QR / NFC counters beside them use the bars' colours. Scan
// counts are written with Intl in the app language.
//
// Imports are relative (not "@/…") so the unit tests can load this file.

import { SURFACE_MODAL } from "../../components/xpot/surface";

/** QR scans in every chart, legend and counter. */
export const QR_COLOR = "#60a5fa";
/** NFC taps in every chart, legend and counter. */
export const NFC_COLOR = "#a78bfa";
/** The same colours, faint, behind a QR / NFC badge. */
export const QR_SOFT = "rgba(96,165,250,0.15)";
export const NFC_SOFT = "rgba(167,139,250,0.15)";

/** A chart day ("2026-03-04", UTC) as the app language writes it, first letter capitalised ("quarta-feira" → "Quarta-feira"). */
export function formatChartDay(day: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  const formatted = date.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  return `${formatted.charAt(0).toLocaleUpperCase(locale)}${formatted.slice(1)}`;
}

/** Axis tick label: "4 Mar". */
export const CHART_TICK_DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
/** Tooltip title: "Wednesday, March 4". */
export const CHART_TOOLTIP_DAY: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };

/** Day steps between axis labels: daily, every other day, then weekly, fortnightly and monthly. */
const TICK_STEPS = [1, 2, 3, 7, 14, 30, 61, 91] as const;

/**
 * recharts' XAxis `interval` for a chart of `points` consecutive days: a label
 * every N days, N the smallest step that keeps at most `maxTicks` labels.
 * recharts' own interval drops labels where they would touch, so a range came
 * out with uneven gaps ("4 Mar, 9 Mar, 11 Mar…").
 */
export function chartTickInterval(points: number, maxTicks = 7): number {
  const step = TICK_STEPS.find((candidate) => Math.ceil(points / candidate) <= maxTicks) ?? Math.ceil(points / maxTicks);
  return step - 1;
}

/** Props for recharts' XAxis tick text. */
export const CHART_TICK = { fill: "rgba(255,255,255,0.35)", fontSize: 10 } as const;

/** Props for recharts' <Tooltip>: the modal surface, one radius, the day as the title. */
export function chartTooltip(locale: string) {
  return {
    cursor: { fill: "rgba(255,255,255,0.04)" },
    contentStyle: {
      background: SURFACE_MODAL,
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
      color: "#fff",
      fontSize: 12,
      padding: "10px 12px",
    },
    itemStyle: { padding: "2px 0", fontWeight: 600 },
    labelStyle: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontWeight: 700, marginBottom: 6 },
    labelFormatter: (day: unknown) => (typeof day === "string" ? formatChartDay(day, locale, CHART_TOOLTIP_DAY) : String(day ?? "")),
  };
}

/** A count ("1,234" / "1.234") in the app language. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Number.isFinite(value) ? value : 0);
}
