import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { kitMessages } from "@/i18n/messages/kit";
import { GLASS } from "./surface";

// The one "nothing here" and "could not load" block of the app. Lists, panels
// and dashboards use it instead of an ad-hoc centred paragraph:
//   <EmptyState icon={Building2} title={t("noLeads")} hint={t("noLeadsHint")} />
//   <EmptyState compact icon={ListTodo} title={t("noTasks")} />   (inside a section)
//   <ErrorState message={t("loadFailed")} onRetry={() => query.refetch()} />
// Tones: indigo (default, Visits and account), tags (violet, the Tags module),
// red (an error).

const TONES = {
  indigo: { card: GLASS, tile: "rgba(99,102,241,0.15)", icon: "text-indigo-400", title: "text-white/60", hint: "text-white/35" },
  tags: { card: GLASS, tile: "rgba(139,92,246,0.16)", icon: "text-violet-300", title: "text-white/60", hint: "text-white/35" },
  red: { card: { background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)" }, tile: "rgba(239,68,68,0.12)", icon: "text-red-400", title: "text-white/70", hint: "text-white/40" },
} as const;

export type EmptyStateTone = keyof typeof TONES;

function RetryButton({ onRetry, label }: { onRetry: () => void; label?: string }) {
  const tc = useT(commonMessages);
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? tc("retry")}
    </button>
  );
}

/**
 * "Nothing here" block. The default shows the icon in a tinted tile with a
 * title, hint and optional actions; `compact` is the smaller icon-and-line form
 * used inside sections.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
  action,
  onRetry,
  retryLabel,
  tone = "indigo",
  compact = false,
  dense = false,
  cardStyle,
}: {
  icon: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  /** Actions under the text. */
  children?: ReactNode;
  /** One action under the text (same place as children). */
  action?: ReactNode;
  /** Shows a "Try again" button that calls this. */
  onRetry?: () => void;
  retryLabel?: string;
  tone?: EmptyStateTone;
  compact?: boolean;
  /** Less vertical padding (py-8 instead of py-10). */
  dense?: boolean;
  /** Overrides the card background/border. */
  cardStyle?: CSSProperties;
}) {
  const actions = (
    <>
      {action}
      {children}
      {onRetry ? <RetryButton onRetry={onRetry} label={retryLabel} /> : null}
    </>
  );
  const hasActions = Boolean(action || children || onRetry);

  if (compact) {
    return (
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl ${dense ? "py-8" : "py-10"} px-4 text-center`}
        style={cardStyle ?? TONES[tone].card}
      >
        <Icon className={`h-6 w-6 ${tone === "indigo" ? "text-white/25" : TONES[tone].icon}`} aria-hidden="true" />
        <div className="text-xs text-white/40">{title}</div>
        {hint ? <div className="text-[11px] text-white/30">{hint}</div> : null}
        {hasActions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  const t = TONES[tone];
  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl ${dense ? "py-8" : "py-10"} px-4 text-center`} style={cardStyle ?? t.card}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: t.tile }}>
        <Icon className={`h-5 w-5 ${t.icon}`} aria-hidden="true" />
      </div>
      <div>
        <div className={`text-sm font-medium ${t.title}`}>{title}</div>
        {hint ? <div className={`mt-0.5 text-xs ${t.hint}`}>{hint}</div> : null}
      </div>
      {hasActions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * "Could not load" block: EmptyState in the red tone with an alert icon and a
 * "Try again" button when `onRetry` is given. Announced to screen readers.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  compact = false,
  dense = false,
  icon = AlertTriangle,
}: {
  /** Defaults to the translated "Something went wrong". */
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  dense?: boolean;
  icon?: LucideIcon;
}) {
  const t = useT(kitMessages);
  return (
    <div role="alert">
      <EmptyState
        icon={icon}
        tone="red"
        title={title ?? t("errorTitle")}
        hint={message}
        onRetry={onRetry}
        retryLabel={retryLabel}
        compact={compact}
        dense={dense}
      />
    </div>
  );
}
