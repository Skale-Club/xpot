import type { LucideIcon } from "lucide-react";

/** One big button of the visit in progress: what the rep does while standing in the company. */
export function VisitAction({ icon: Icon, title, hint, onClick, tone = "indigo", testId, className = "", disabled }: {
  icon: LucideIcon;
  title: string;
  /** The line under the title; short enough to show on a phone too. */
  hint?: string;
  onClick: () => void;
  /** emerald = money (selling), violet = the Tags module, indigo = everything else. */
  tone?: "indigo" | "violet" | "emerald";
  testId?: string;
  className?: string;
  disabled?: boolean;
}) {
  const palette = tone === "violet"
    ? "border-violet-400/20 bg-violet-400/[0.07] text-violet-300"
    : tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
      : "border-blue-400/20 bg-blue-400/[0.07] text-blue-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[66px] min-w-0 items-center gap-2.5 rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50 ${palette} ${className}`}
      data-testid={testId}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-sm font-bold text-white">{title}</strong>
        {hint ? <span className="mt-0.5 block truncate text-[10px] text-white/40">{hint}</span> : null}
      </span>
    </button>
  );
}
