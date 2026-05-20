export type VisitStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "invalid"
  | "no_answer"
  | "came_back_later"
  | "not_interested"
  | "follow_up"
  | "sale_made";

export const VISIT_STATUSES: {
  value: VisitStatus;
  label: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
}[] = [
  { value: "sale_made",       label: "Sale Made",        dot: "#10b981", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  text: "#6ee7b7" },
  { value: "completed",       label: "Completed",        dot: "#38bdf8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.3)",  text: "#7dd3fc" },
  { value: "follow_up",       label: "Follow Up",        dot: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)", text: "#c4b5fd" },
  { value: "came_back_later", label: "Come Back Later",  dot: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  text: "#fde68a" },
  { value: "no_answer",       label: "No Answer",        dot: "#fb923c", bg: "rgba(251,146,60,0.12)",  border: "rgba(251,146,60,0.3)",  text: "#fdba74" },
  { value: "not_interested",  label: "Not Interested",   dot: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", text: "#fca5a5" },
  { value: "cancelled",       label: "Cancelled",        dot: "#64748b", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)", text: "#94a3b8" },
  { value: "in_progress",     label: "In Progress",      dot: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)",  text: "#93c5fd" },
  { value: "planned",         label: "Planned",          dot: "#94a3b8", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.2)", text: "#cbd5e1" },
  { value: "invalid",         label: "Invalid",          dot: "#ef4444", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.2)",   text: "#fca5a5" },
];

export function getStatusMeta(status: string) {
  return VISIT_STATUSES.find((s) => s.value === status) ?? {
    value: status, label: status,
    dot: "#64748b", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.2)", text: "#94a3b8",
  };
}

export function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

export function StatusPicker({ value, onChange }: { value: string; onChange: (v: VisitStatus) => void }) {
  const OUTCOMES = VISIT_STATUSES.filter((s) => !["planned", "in_progress", "invalid", "cancelled"].includes(s.value));
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-white/30">Visit Outcome</div>
      <div className="grid grid-cols-3 gap-2">
        {OUTCOMES.map((s) => {
          const isActive = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              className="rounded-full px-1 py-1.5 text-[11px] font-medium transition-all active:scale-95 w-full"
              style={{
                background: isActive ? s.bg : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? s.border : "rgba(255,255,255,0.08)"}`,
                color: isActive ? s.text : "rgba(255,255,255,0.4)",
                boxShadow: isActive ? `0 0 12px ${s.dot}40` : "none",
                transform: isActive ? "scale(1.03)" : "scale(1)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
