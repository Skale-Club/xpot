import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { Stat as KitStat } from "@/components/xpot/Stat";
import { HEALTH_TONE, Pill, PILL_DOTS, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import type { Translate } from "@/i18n";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import type { HealthReasonCode, HealthVerdict, RecentRun } from "@shared/system-health";

// Pieces shared by Admin › System health and its event detail page.

export type T = Translate<typeof systemHealthMessages.en>;

export const REFRESH_MS = 15_000;

/** A verdict's tone (HEALTH_TONE: healthy green, slow amber, stalled and down red, idle slate). */
export function verdictTone(verdict: HealthVerdict): PillTone {
  return toneOf(HEALTH_TONE, verdict);
}

/** The overall banner behind the verdict, tinted in its tone. */
export const VERDICT_BANNER: Record<PillTone, string> = {
  green: "border-emerald-400/25 bg-emerald-500/[0.07]",
  amber: "border-amber-400/25 bg-amber-500/[0.07]",
  red: "border-red-400/25 bg-red-500/[0.07]",
  blue: "border-blue-400/25 bg-blue-500/[0.07]",
  sky: "border-sky-400/25 bg-sky-500/[0.07]",
  violet: "border-violet-400/25 bg-violet-500/[0.07]",
  slate: "border-white/10 bg-white/[0.03]",
  muted: "border-white/10 bg-white/[0.02]",
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
    <Pill tone={verdictTone(verdict)} dot bordered>
      {t(`verdict_${verdict}`)}
    </Pill>
  );
}

/** A titled section of the panel: the kit's SectionCard, with `right` in the title row. */
export function Card({ title, icon, right, children }: { title: string; icon: LucideIcon; right?: ReactNode; children: ReactNode }) {
  return (
    <SectionCard title={title} icon={icon} actions={right}>
      {children}
    </SectionCard>
  );
}

/** A number in a section: the kit's Stat, red when bad and amber when it needs a look. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bad" | "warn" }) {
  return <KitStat label={label} value={value} tone={tone === "bad" ? "danger" : tone === "warn" ? "warning" : "neutral"} />;
}

/** Timeline bar per run status, from HEALTH_TONE: green finished, red failed, blue still going, grey waiting or cancelled. */
export function runBar(status: RecentRun["status"]): string {
  const tone = toneOf(HEALTH_TONE, status);
  return `${PILL_DOTS[tone]} ${status === "running" || status === "starting" ? "animate-pulse" : ""}`;
}

export function RunStatusChip({ status, t }: { status: RecentRun["status"]; t: T }) {
  return (
    <Pill tone={toneOf(HEALTH_TONE, status)} bordered>
      {t(`runStatus_${status}`)}
    </Pill>
  );
}
