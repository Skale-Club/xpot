import type { ReactNode } from "react";

// One shape and one meaning per color for every status pill in Tags (admin and
// app), so a state reads the same wherever it shows up:
//   green  = working / done      amber = needs a step       red = broken / off
//   blue   = sold / in progress  violet = received          slate = idle
//   muted  = finished, out of play

export type PillTone = "green" | "amber" | "red" | "blue" | "violet" | "slate" | "muted";

export const PILL_BASE =
  "inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold leading-none";

export const PILL_TONES: Record<PillTone, string> = {
  green: "bg-emerald-400/10 text-emerald-300",
  amber: "bg-amber-400/10 text-amber-300",
  red: "bg-red-400/10 text-red-300",
  blue: "bg-blue-500/15 text-blue-300",
  violet: "bg-violet-400/10 text-violet-300",
  slate: "bg-white/10 text-white/60",
  muted: "bg-white/5 text-white/40",
};

/** A piece: in stock → with a customer → live ⇄ switched off → retired. */
export const PIECE_STATUS_TONE: Record<string, PillTone> = {
  inventory: "slate",
  assigned: "amber",
  active: "green",
  disabled: "red",
  retired: "muted",
};

/** A sold piece; blue so it never reads as "Live". */
export const SOLD_TONE: PillTone = "blue";

/** The NFC chip: nothing on it is a problem (a tap opens nothing); written but unchecked needs a test. */
export const CHIP_STATUS_TONE: Record<string, PillTone> = {
  not_programmed: "red",
  failed: "red",
  programmed: "amber",
  verified: "green",
  locked: "green",
};

/** A production batch, from the file to the pieces in hand. */
export const BATCH_STATUS_TONE: Record<string, PillTone> = {
  draft: "slate",
  generated: "blue",
  ordered: "amber",
  received: "violet",
  completed: "green",
  cancelled: "red",
};

export function Pill({ tone, children, className = "" }: { tone: PillTone; children: ReactNode; className?: string }) {
  return <span className={`${PILL_BASE} ${PILL_TONES[tone]} ${className}`}>{children}</span>;
}
