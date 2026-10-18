import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import type { Translate } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import type { HealthReasonCode, HealthVerdict, RecentRun } from "@shared/system-health";

// Pieces shared by Admin › System health and its event detail page.

export type T = Translate<typeof systemHealthMessages.en>;

export const REFRESH_MS = 15_000;

export const VERDICT_STYLE: Record<HealthVerdict, { chip: string; dot: string; banner: string }> = {
  healthy: { chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400", banner: "border-emerald-500/25 bg-emerald-500/[0.07]" },
  idle: { chip: "border-white/10 bg-white/5 text-white/50", dot: "bg-white/40", banner: "border-white/10 bg-white/[0.03]" },
  slow: { chip: "border-amber-500/30 bg-amber-500/15 text-amber-300", dot: "bg-amber-400", banner: "border-amber-500/25 bg-amber-500/[0.07]" },
  stalled: { chip: "border-red-500/30 bg-red-500/15 text-red-300", dot: "bg-red-400", banner: "border-red-500/25 bg-red-500/[0.07]" },
  down: { chip: "border-red-500/40 bg-red-500/20 text-red-200", dot: "bg-red-500", banner: "border-red-500/30 bg-red-500/[0.1]" },
};

export function useAgo(t: T) {
  return (value: string | null) => {
    if (!value) return t("never");
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 5) return t("justNow");
    if (seconds < 60) return t("secondsAgo", { n: seconds });
    if (seconds < 3600) return t("minutesAgo", { n: Math.floor(seconds / 60) });
    if (seconds < 86_400) return t("hoursAgo", { n: Math.floor(seconds / 3600) });
    return t("daysAgo", { n: Math.floor(seconds / 86_400) });
  };
}

export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function sourceLabel(t: T, source: string) {
  const key = `source_${source}` as keyof typeof systemHealthMessages.en;
  return key in systemHealthMessages.en ? t(key) : source;
}

/**
 * Why a verdict was given, in the admin's language, from the server's stable
 * code (health.ts); the English `fallback` only for a code this screen does not know.
 */
export function healthReason(t: T, code: HealthReasonCode | undefined, fallback: string): { text: string; todo: string | null } {
  const reasonKey = `reason_${code}` as keyof typeof systemHealthMessages.en;
  const todoKey = `todo_${code}` as keyof typeof systemHealthMessages.en;
  return {
    text: code && reasonKey in systemHealthMessages.en ? t(reasonKey) : fallback,
    todo: code && todoKey in systemHealthMessages.en ? t(todoKey) : null,
  };
}

/** The reason line, with "What to do: …" under it when there is something to do. */
export function HealthReason({ t, code, fallback, className = "text-sm text-white/70" }: { t: T; code: HealthReasonCode | undefined; fallback: string; className?: string }) {
  const { text, todo } = healthReason(t, code, fallback);
  return (
    <>
      <p className={className}>{text}</p>
      {todo && <p className="mt-1 text-xs text-white/50">{t("whatToDo", { action: todo })}</p>}
    </>
  );
}

export function VerdictChip({ verdict, t }: { verdict: HealthVerdict; t: T }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_STYLE[verdict].dot}`} />
      {t(`verdict_${verdict}`)}
    </span>
  );
}

export function Card({ title, icon: Icon, right, children }: { title: string; icon: typeof Activity; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <Icon className="h-4 w-4 text-white/45" />
          {title}
        </h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className={`text-xl font-bold ${tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-300" : ""}`}>{value}</p>
    </div>
  );
}

/** Timeline colours: green finished, red failed, amber still going, grey waiting or cancelled. */
export const RUN_STATUS_STYLE: Record<RecentRun["status"], { bar: string; chip: string }> = {
  completed: { bar: "bg-emerald-400/90", chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  failed: { bar: "bg-red-500/90", chip: "border-red-500/30 bg-red-500/15 text-red-300" },
  running: { bar: "bg-amber-400 animate-pulse", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  starting: { bar: "bg-amber-400 animate-pulse", chip: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
  queued: { bar: "bg-white/25", chip: "border-white/10 bg-white/5 text-white/55" },
  cancelled: { bar: "bg-white/15", chip: "border-white/10 bg-white/5 text-white/45" },
};

export function RunStatusChip({ status, t }: { status: RecentRun["status"]; t: T }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RUN_STATUS_STYLE[status].chip}`}>
      {t(`runStatus_${status}`)}
    </span>
  );
}
