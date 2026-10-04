import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const TONES = {
  indigo: { card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }, tile: "rgba(99,102,241,0.15)", icon: "text-indigo-400", title: "text-white/60", hint: "text-white/30" },
  red: { card: { background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)" }, tile: "rgba(239,68,68,0.12)", icon: "text-red-400", title: "text-white/70", hint: "text-white/35" },
} as const;

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
  tone?: keyof typeof TONES;
  compact?: boolean;
  /** Less vertical padding (py-8 instead of py-10). */
  dense?: boolean;
  /** Overrides the card background/border. */
  cardStyle?: React.CSSProperties;
}) {
  if (compact) {
    return (
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl ${dense ? "py-8" : "py-10"} text-center`}
        style={cardStyle ?? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
      >
        <Icon className="h-6 w-6 text-white/20" />
        <div className="text-xs text-white/30">{title}</div>
        {hint ? <div className="text-[11px] text-white/20">{hint}</div> : null}
        {children}
      </div>
    );
  }

  const t = TONES[tone];
  return (
    <div className={`flex flex-col items-center gap-3 rounded-2xl ${dense ? "py-8" : "py-10"} text-center`} style={cardStyle ?? t.card}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: t.tile }}>
        <Icon className={`h-5 w-5 ${t.icon}`} />
      </div>
      <div>
        <div className={`text-sm font-medium ${t.title}`}>{title}</div>
        {hint ? <div className={`mt-0.5 text-xs ${t.hint}`}>{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}
