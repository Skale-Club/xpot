import type { ReactNode } from "react";

// The one status pill of the app (Visits, Sales, Tags, admin): one shape and one
// meaning per color, so a state reads the same wherever it shows up:
//   green  = working / done / paid   amber = needs a step       red = broken / off
//   blue   = sold / in progress      sky = a visit completed     slate = idle
//   violet = received (Tags only)    muted = finished, out of play
// Pick the tone from a map below (VISIT_OUTCOME_TONE, PAYMENT_STATUS_TONE…)
// instead of choosing a colour on the screen. `dot` adds a leading dot and
// `bordered` a hairline border in the tone, for pills on busy rows.

export type PillTone = "green" | "amber" | "red" | "blue" | "sky" | "violet" | "slate" | "muted";

export const PILL_BASE =
  "inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-center text-xs font-semibold leading-none";

export const PILL_TONES: Record<PillTone, string> = {
  green: "bg-emerald-400/10 text-emerald-300",
  amber: "bg-amber-400/10 text-amber-300",
  red: "bg-red-400/10 text-red-300",
  blue: "bg-blue-500/15 text-blue-300",
  sky: "bg-sky-400/10 text-sky-300",
  violet: "bg-violet-400/10 text-violet-300",
  slate: "bg-white/10 text-white/60",
  muted: "bg-white/5 text-white/40",
};

/** Border per tone, for `bordered` pills. */
export const PILL_BORDERS: Record<PillTone, string> = {
  green: "border border-emerald-400/25",
  amber: "border border-amber-400/25",
  red: "border border-red-400/25",
  blue: "border border-blue-400/25",
  sky: "border border-sky-400/25",
  violet: "border border-violet-400/25",
  slate: "border border-white/15",
  muted: "border border-white/10",
};

/** Dot fill per tone, for `dot` pills (and status dots outside a pill). */
export const PILL_DOTS: Record<PillTone, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
  sky: "bg-sky-400",
  violet: "bg-violet-400",
  slate: "bg-slate-400",
  muted: "bg-white/30",
};

/** The tone for `key` in `map`, or `fallback` for a value the map doesn't know. */
export function toneOf(map: Record<string, PillTone>, key: string | null | undefined, fallback: PillTone = "slate"): PillTone {
  return (key != null && map[key]) || fallback;
}

/** A piece: in stock → with a customer → live ⇄ switched off → retired. */
export const PIECE_STATUS_TONE: Record<string, PillTone> = {
  inventory: "slate",
  damaged: "red",
  assigned: "amber",
  active: "green",
  disabled: "red",
  retired: "muted",
};

/**
 * Where a piece is in stock (shared/tags.ts TAG_STOCK_STATUSES). Pending is
 * amber: the piece is not received yet, so it cannot be set up.
 */
export const STOCK_STATUS_TONE: Record<string, PillTone> = {
  pending: "amber",
  available: "slate",
  reserved: "blue",
  internal_use: "slate",
  sold: "blue", // = SOLD_TONE
  damaged: "red",
  lost: "red",
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
  open: "blue",
  closed: "green",
  draft: "slate",
  generated: "blue",
  ordered: "amber",
  received: "violet",
  completed: "green",
  cancelled: "red",
};

/** Where an issued batch is in production (shared/tags.ts batchStage). */
export const BATCH_STAGE_TONE: Record<string, PillTone> = {
  issued: "slate",
  built: "amber",
  printed: "blue",
  receiving: "violet",
  received: "green",
  cancelled: "red",
};

// ─── Visits and Sales ─────────────────────────────────────────────────────────

/**
 * A visit's status / outcome (pages/xpot/components/VisitStatus.tsx). Green is
 * only for a sale; a visit that must be revisited is amber; Visits never uses violet.
 */
export const VISIT_OUTCOME_TONE: Record<string, PillTone> = {
  sale_made: "green",
  follow_up: "amber",
  came_back_later: "amber",
  no_answer: "slate",
  not_interested: "red",
  completed: "sky",
  in_progress: "blue",
  planned: "slate",
  cancelled: "slate",
  invalid: "red",
};

/** How much of a sale is paid. */
export const PAYMENT_STATUS_TONE: Record<string, PillTone> = {
  paid: "green",
  partial: "amber",
  unpaid: "red",
};

/** A recorded sale. A cancelled one is out of play. */
export const SALE_STATUS_TONE: Record<string, PillTone> = {
  completed: "green",
  cancelled: "muted",
};

/** A consignment agreement. */
export const CONSIGNMENT_STATUS_TONE: Record<string, PillTone> = {
  active: "blue",
  closed: "muted",
};

/** A follow-up task: late is red, due today needs a step, done is green. */
export const TASK_TONE: Record<string, PillTone> = {
  overdue: "red",
  due_today: "amber",
  upcoming: "slate",
  open: "slate",
  done: "green",
};

/** A prospecting route (shared/schema/prospecting.ts). */
export const ROUTE_STATUS_TONE: Record<string, PillTone> = {
  draft: "slate",
  published: "blue",
  in_progress: "blue",
  completed: "green",
  cancelled: "slate",
};

/** A stop on a route. */
export const STOP_STATUS_TONE: Record<string, PillTone> = {
  planned: "slate",
  en_route: "blue",
  checked_in: "blue",
  completed: "green",
  skipped: "muted",
  rescheduled: "amber",
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/** An integration's state on the admin Integrations page. */
export const INTEGRATION_TONE: Record<string, PillTone> = {
  live: "green",
  incomplete: "amber",
  idle: "slate",
  off: "slate",
  broken: "red",
};

/** System health checks and job runs. */
export const HEALTH_TONE: Record<string, PillTone> = {
  ok: "green",
  completed: "green",
  running: "blue",
  starting: "blue",
  slow: "amber",
  stuck: "amber",
  failed: "red",
  idle: "slate",
  queued: "slate",
  cancelled: "muted",
};

/** Same map as HEALTH_TONE, under the name job-run screens look for. */
export const RUN_STATUS_TONE = HEALTH_TONE;

/** A member's role. */
export const ROLE_TONE: Record<string, PillTone> = {
  admin: "amber",
  manager: "blue",
  rep: "slate",
};

export function Pill({
  tone,
  children,
  className = "",
  dot = false,
  bordered = false,
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
  /** A small dot in the tone before the label. */
  dot?: boolean;
  /** A hairline border in the tone. */
  bordered?: boolean;
}) {
  return (
    <span className={`${PILL_BASE} ${PILL_TONES[tone]} ${bordered ? PILL_BORDERS[tone] : ""} ${dot ? "gap-1.5" : ""} ${className}`}>
      {dot ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PILL_DOTS[tone]}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
