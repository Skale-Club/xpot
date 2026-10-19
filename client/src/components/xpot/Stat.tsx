import type { ReactNode } from "react";
import { GLASS_SUBTLE_CLASS } from "./surface";

// Numbers on a screen come in two forms only:
//   - KpiTile (./DashboardKit): the dashboard tile with an icon, optionally a
//     button that opens the list behind the number;
//   - Stat (here): a label over a value, for summaries inside a card or a
//     detail pane ("Pieces 12 · Live 9 · Sold 2"). `card` boxes it on its own.
// Tones follow the colour rules: money is green (only for amounts of money),
// warning amber (needs a step), danger red.

export { KpiTile } from "./DashboardKit";

const VALUE_TONES = {
  neutral: "text-white",
  money: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-red-300",
  muted: "text-white/45",
} as const;

export type StatTone = keyof typeof VALUE_TONES;

export function Stat({
  label,
  value,
  detail,
  tone = "neutral",
  card = false,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** A small line under the value ("of 40", "+12% vs last month"). */
  detail?: ReactNode;
  tone?: StatTone;
  /** Draw it as its own GLASS_SUBTLE card. */
  card?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${card ? `rounded-2xl ${GLASS_SUBTLE_CLASS} p-3.5` : ""} ${className}`}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className={`mt-1 truncate text-xl font-bold leading-tight tabular-nums ${VALUE_TONES[tone]}`}>{value}</p>
      {detail ? <p className="mt-0.5 truncate text-xs text-white/40">{detail}</p> : null}
    </div>
  );
}
