// Small shared pieces for the sales module dialogs and cards, in the app's
// existing dark-glass idiom (see XpotSales / VisitRow).

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/ui/loader";
import { centsToInput, formatCents, inputToCents } from "../../utils";

export const GLASS = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.09)",
} as const;

export const inputCls =
  "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-indigo-400/50 transition-colors";
export const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.09)",
  colorScheme: "dark" as const,
};

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="text-xs font-semibold uppercase tracking-widest text-white/30">{children}</div>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{label}</span>
        {hint ? <span className="text-[10px] text-white/30">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function PrimaryButton({
  children, onClick, disabled, loading, tone = "indigo", type = "button", className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean;
  tone?: "indigo" | "emerald" | "amber" | "red"; type?: "button" | "submit"; className?: string;
}) {
  const bg = {
    indigo: "linear-gradient(135deg, #3b82f6, #6366f1)",
    emerald: "linear-gradient(135deg, #10b981, #06b6d4)",
    amber: "linear-gradient(135deg, #f59e0b, #f97316)",
    red: "linear-gradient(135deg, #ef4444, #dc2626)",
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.99] disabled:opacity-40 touch-manipulation ${className}`}
      style={{ background: bg }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function GhostButton({
  children, onClick, disabled, className = "", title,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-40 touch-manipulation ${className}`}
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
    >
      {children}
    </button>
  );
}

/** Dollars in the box, cents in state. */
export function MoneyInput({
  valueCents, onChangeCents, placeholder = "0.00", disabled, autoFocus,
}: { valueCents: number | null | undefined; onChangeCents: (cents: number) => void; placeholder?: string; disabled?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState(() => centsToInput(valueCents));
  const [lastCents, setLastCents] = useState(valueCents ?? 0);
  // Re-sync the text when the outside value changes (e.g. product picked).
  if ((valueCents ?? 0) !== lastCents) {
    setLastCents(valueCents ?? 0);
    setText(centsToInput(valueCents));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/35">$</span>
      <input
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); const c = inputToCents(e.target.value); setLastCents(c); onChangeCents(c); }}
        onBlur={() => setText(centsToInput(inputToCents(text)))}
        className={`${inputCls} pl-7 tabular-nums`}
        style={inputStyle}
      />
    </div>
  );
}

export function QtyInput({
  value, onChange, min = 0, max, disabled, autoFocus,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; disabled?: boolean; autoFocus?: boolean }) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 touch-manipulation"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>−</button>
      <input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        onChange={(e) => onChange(clamp(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
        className={`${inputCls} text-center tabular-nums font-semibold`}
        style={inputStyle}
      />
      <button type="button" disabled={disabled || (max != null && value >= max)} onClick={() => onChange(clamp(value + 1))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white/70 transition-colors hover:bg-white/10 disabled:opacity-30 touch-manipulation"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>+</button>
    </div>
  );
}

export function Select({
  value, onChange, options, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} appearance-none pr-8`}
        style={{ ...inputStyle, color: value ? "white" : "rgba(255,255,255,0.3)" }}
      >
        {placeholder ? <option value="" className="bg-[#0e1117]">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value} className="bg-[#0e1117]">{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
    </div>
  );
}

export function Money({ cents, currency = "USD", className = "" }: { cents: number | null | undefined; currency?: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatCents(cents, currency)}</span>;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" | "purple" }) {
  const styles = {
    neutral: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.25)", text: "#cbd5e1" },
    green: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", text: "#6ee7b7" },
    amber: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", text: "#fcd34d" },
    red: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", text: "#fca5a5" },
    blue: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", text: "#93c5fd" },
    purple: { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)", text: "#c4b5fd" },
  }[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.text }}>
      {children}
    </span>
  );
}

export function SheetDialog({
  open, onOpenChange, title, children, wide,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-[calc(100vw-1.5rem)] ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} rounded-3xl border-white/10 max-h-[90vh] overflow-y-auto`}
        style={{ background: "rgba(10,15,30,0.97)", backdropFilter: "blur(20px)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "indigo" }) {
  const accent = {
    neutral: "rgba(255,255,255,0.04)",
    green: "rgba(16,185,129,0.08)",
    amber: "rgba(245,158,11,0.08)",
    red: "rgba(239,68,68,0.08)",
    indigo: "rgba(99,102,241,0.10)",
  }[tone];
  return (
    <div className="rounded-2xl p-3.5" style={{ background: accent, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-white/40">{sub}</div> : null}
    </div>
  );
}
