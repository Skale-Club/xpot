import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";

// Shared look for the Tags admin, matching the rest of Xpot Admin.

export const CARD = "rounded-2xl border border-white/10 bg-white/[0.03]";
export const INPUT =
  "w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/50";
export const BTN =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40";
export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-40";
export const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40";
export const TD = "px-3 py-2 text-sm text-white/80";

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{children}</h2>
      {right}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-300",
  disabled: "bg-red-400/10 text-red-300",
  assigned: "bg-amber-400/10 text-amber-300",
  inventory: "bg-white/10 text-white/60",
  retired: "bg-white/5 text-white/40",
};

export function StatusPill({ status }: { status: string }) {
  const tt = useT(tagsMessages);
  const key = `status_${status}`;
  const label = tt(key as never);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONES[status] ?? "bg-white/10 text-white/60"}`}>
      {label === key ? status : label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`${CARD} px-6 py-10 text-center text-sm text-white/40`}>{children}</div>;
}
