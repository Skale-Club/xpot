// Small shared pieces for the sales module dialogs and cards. They are thin
// wrappers over the UI kit (docs/UI_KIT.md) kept under their old names
// because Admin and Tags screens import them too: new code can use the kit
// directly (Button, Field/Input/Select, Pill, ui/dialog).

import { useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FIELD_CONTROL, Select as KitSelect } from "@/components/xpot/Field";
import { Pill, type PillTone } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { visitsUiMessages } from "@/i18n/messages/visitsUi";
import { centsToInput, currencySymbol, formatCents, inputToCents } from "../../utils";

export { GLASS } from "@/components/xpot/surface";

/** The kit's text-control classes (components/xpot/Field.tsx FIELD_CONTROL). */
export const inputCls = `${FIELD_CONTROL} py-2`;
/** Kept for callers that pass it with inputCls; the look is all in the classes now. */
export const inputStyle = { colorScheme: "dark" as const };

/** A small group heading ("STOCK HERE", "LEDGER"), the app's EYEBROW. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className={EYEBROW}>{children}</div>
      {right}
    </div>
  );
}

/** Label + control with the kit's one label style; `hint` sits at the end of the label row. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-white/60">{label}</span>
        {hint ? <span className="text-xs text-white/40">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

/** Full-width primary button: brand by default, `emerald` for money, `red` to destroy. */
export function PrimaryButton({
  children, onClick, disabled, loading, tone = "indigo", type = "button", className = "",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean;
  tone?: "indigo" | "emerald" | "amber" | "red"; type?: "button" | "submit"; className?: string;
}) {
  const variant = tone === "emerald" ? "money" : tone === "red" ? "danger" : "brand";
  return (
    <Button type={type} variant={variant} onClick={onClick} disabled={disabled} loading={loading} className={cn("w-full", className)}>
      {children}
    </Button>
  );
}

/** The quiet button next to a primary one (kit Button, secondary). */
export function GhostButton({
  children, onClick, disabled, className = "", title, loading,
}: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; title?: string; loading?: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={cn("text-xs", className)}
    >
      {children}
    </Button>
  );
}

/** Money in the box, cents in state; the prefix is the currency's own symbol. */
export function MoneyInput({
  valueCents, onChangeCents, placeholder = "0.00", disabled, autoFocus, currency = "USD",
}: {
  valueCents: number | null | undefined;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  currency?: string;
}) {
  const [text, setText] = useState(() => centsToInput(valueCents));
  const [lastCents, setLastCents] = useState(valueCents ?? 0);
  // Re-sync the text when the outside value changes (e.g. product picked).
  if ((valueCents ?? 0) !== lastCents) {
    setLastCents(valueCents ?? 0);
    setText(centsToInput(valueCents));
  }
  const symbol = currencySymbol(currency);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40" aria-hidden="true">{symbol}</span>
      <input
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); const c = inputToCents(e.target.value); setLastCents(c); onChangeCents(c); }}
        onBlur={() => setText(centsToInput(inputToCents(text)))}
        className={cn(inputCls, symbol.length > 1 ? "pl-11" : "pl-8", "tabular-nums")}
      />
    </div>
  );
}

export function QtyInput({
  value, onChange, min = 0, max, disabled, autoFocus,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; disabled?: boolean; autoFocus?: boolean }) {
  const t = useT(visitsUiMessages);
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="secondary" size="icon" aria-label={t("decrease")} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))}>
        <Minus aria-hidden="true" />
      </Button>
      <input
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        onChange={(e) => onChange(clamp(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
        className={cn(inputCls, "px-1 text-center font-semibold tabular-nums")}
      />
      <Button type="button" variant="secondary" size="icon" aria-label={t("increase")} disabled={disabled || (max != null && value >= max)} onClick={() => onChange(clamp(value + 1))}>
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The kit's native Select, with the old `onChange(value)` signature. */
export function Select({
  value, onChange, options, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <KitSelect
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      placeholder={placeholder}
      className={value ? "" : "text-white/40"}
    />
  );
}

export function Money({ cents, currency = "USD", className = "" }: { cents: number | null | undefined; currency?: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatCents(cents, currency)}</span>;
}

const CHIP_TONE: Record<"neutral" | "green" | "amber" | "red" | "blue" | "purple", PillTone> = {
  neutral: "slate",
  green: "green",
  amber: "amber",
  red: "red",
  blue: "blue",
  purple: "violet",
};

/** Old name for the kit Pill; new code uses Pill with a tone map. */
export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof CHIP_TONE }) {
  return <Pill tone={CHIP_TONE[tone]}>{children}</Pill>;
}

/** A dialog on the kit's modal shell (ui/dialog), wider with `wide`. */
export function SheetDialog({
  open, onOpenChange, title, children, wide,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "indigo" }) {
  const valueClass = {
    neutral: "text-white",
    green: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
    indigo: "text-blue-200",
  }[tone];
  return (
    <div className={`rounded-2xl p-4 ${GLASS_SUBTLE_CLASS}`}>
      <div className={EYEBROW}>{label}</div>
      <div className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-white/40">{sub}</div> : null}
    </div>
  );
}
