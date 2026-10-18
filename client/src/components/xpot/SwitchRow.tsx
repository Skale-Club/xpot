import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

// The one on/off setting row: name and meaning on the left, the Switch on the
// right, the whole row toggles it. Settings that turn something on or off use
// it; checkboxes are only for picking several things from a list.

/** One on/off rule: the switch, its name and what it means (the whole row toggles it). */
export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  hint,
  note,
  disabled = false,
  testId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  /** A line under the hint, e.g. why the switch is off-limits. */
  note?: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-white/85">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-white/40">{hint}</span> : null}
        {note ? <span className="mt-1 block text-xs text-amber-300/80">{note}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" data-testid={testId} />
    </label>
  );
}
