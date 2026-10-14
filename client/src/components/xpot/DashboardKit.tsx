import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function DashboardSection({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[18px] border border-white/[0.07] bg-white/[0.025] ${className}`}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/[0.12] text-indigo-300">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          ) : null}
          <h2 className="truncate text-sm font-semibold text-white/90">{title}</h2>
        </div>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PeriodSelector({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  options: readonly { value: number; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/[0.07] bg-black/15 p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-1 text-[10px] font-bold tracking-wide transition-colors ${value === option.value ? "bg-white/10 text-white" : "text-white/35 hover:text-white/65"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MetricSelector<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; swatchClassName?: string }[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function moveSelection(direction: 1 | -1) {
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    onChange(options[nextIndex].value);
  }

  return (
    <div ref={rootRef} className="relative z-30">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(event.key === "ArrowDown" ? 1 : -1);
          }
        }}
        className={`group inline-flex h-[28px] min-w-[92px] items-center gap-2 rounded-lg border px-2.5 text-[11px] font-bold tracking-wide outline-none transition-all ${open ? "border-indigo-400/45 bg-indigo-400/[0.09] text-white shadow-[0_0_0_3px_rgba(99,102,241,0.1)]" : "border-white/[0.08] bg-white/[0.035] text-white/70 hover:border-white/[0.15] hover:bg-white/[0.055] hover:text-white"} focus-visible:border-indigo-400/60 focus-visible:ring-2 focus-visible:ring-indigo-400/20`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected?.swatchClassName ?? "bg-indigo-400"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-150 group-hover:text-white/55 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[142px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b1020]/95 p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold outline-none transition-colors ${isSelected ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.045] hover:text-white/90 focus-visible:bg-white/[0.06] focus-visible:text-white"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.swatchClassName ?? "bg-indigo-400"}`} aria-hidden="true" />
                <span className="flex-1">{option.label}</span>
                <Check className={`h-3 w-3 text-indigo-300 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
  detail,
  onClick,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  accent: "blue" | "emerald" | "violet" | "amber";
  detail?: ReactNode;
  onClick: () => void;
  loading?: boolean;
}) {
  const tones = {
    blue: "bg-blue-500/[0.12] text-blue-300 ring-blue-400/[0.15]",
    emerald: "bg-emerald-500/[0.12] text-emerald-300 ring-emerald-400/[0.15]",
    violet: "bg-violet-500/[0.12] text-violet-300 ring-violet-400/[0.15]",
    amber: "bg-amber-500/[0.12] text-amber-300 ring-amber-400/[0.15]",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-left transition-colors hover:border-white/[0.13] hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 lg:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ${tones[accent]} lg:h-9 lg:w-9`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <ChevronRight className="mt-1 hidden h-3.5 w-3.5 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/45 lg:block" aria-hidden="true" />
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-16 animate-pulse rounded-md bg-white/10" />
      ) : (
        <div className="mt-3 truncate text-xl font-extrabold leading-none tracking-tight text-white tabular-nums lg:text-2xl">{value}</div>
      )}
      <div className="mt-1.5 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/35 lg:text-[10px]">{label}</div>
      {detail ? <div className="mt-1 hidden truncate text-[11px] text-white/30 lg:block">{detail}</div> : null}
    </button>
  );
}

export function EmptyMetricState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-36 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-white/30">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-white/70">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/32">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function AttentionList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-white/[0.055]">{children}</div>;
}

export function AttentionItem({
  icon: Icon,
  eyebrow,
  title,
  detail,
  trailing,
  tone = "neutral",
  onClick,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  tone?: "neutral" | "blue" | "violet" | "amber" | "emerald";
  onClick: () => void;
}) {
  const tones = {
    neutral: "bg-white/[0.04] text-white/40",
    blue: "bg-blue-500/[0.12] text-blue-300",
    violet: "bg-violet-500/[0.12] text-violet-300",
    amber: "bg-amber-500/[0.12] text-amber-300",
    emerald: "bg-emerald-500/[0.12] text-emerald-300",
  } as const;

  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-400">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${tones[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-white/[0.28]">{eyebrow}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-white/78">{title}</span>
        {detail ? <span className="mt-0.5 block truncate text-[11px] text-white/[0.32]">{detail}</span> : null}
      </span>
      {trailing ?? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/40" aria-hidden="true" />}
    </button>
  );
}
