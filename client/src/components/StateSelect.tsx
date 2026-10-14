import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../i18n";
import { findUsStateCode, US_STATES, usStateLabel } from "../lib/usStates";

export { findUsStateCode, US_STATES, US_STATE_CODES } from "../lib/usStates";

export function StateSelect({ value, onValueChange, placeholder, className = "", selectClassName = "", style, autoFocus, testId, onBlur, onKeyDown }: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  className?: string;
  selectClassName?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  testId?: string;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLSelectElement>) => void;
}) {
  const { lang } = useI18n();
  const normalized = findUsStateCode(value) ?? value;
  const unknownValue = Boolean(value && !findUsStateCode(value));
  return (
    <div className={`relative ${className}`}>
      <select
        value={normalized}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete="address-level1"
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        data-testid={testId}
        className={`h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-3 pr-9 text-sm outline-none transition focus:border-indigo-400/60 ${normalized ? "text-white" : "text-white/30"} ${selectClassName}`}
        style={style}
      >
        <option value="" className="bg-[#0e1117]">{placeholder}</option>
        {unknownValue ? <option value={value} className="bg-[#0e1117]">{value}</option> : null}
        {US_STATES.map((state) => <option key={state.code} value={state.code} className="bg-[#0e1117] text-white">{usStateLabel(state.code, lang)}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
    </div>
  );
}

export function InlineStateSelect({ label, value, onSave, placeholder }: { label: string; value: string; onSave: (value: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group -mx-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</div>
      {editing ? (
        <StateSelect
          value={value}
          onValueChange={(next) => { onSave(next); setEditing(false); }}
          placeholder={placeholder}
          autoFocus
          selectClassName="h-8 rounded-lg border-indigo-400/40 bg-indigo-500/15 py-1"
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="block w-full text-left text-sm text-white/80">
          {findUsStateCode(value) || value || <span className="italic text-white/20">—</span>}
        </button>
      )}
    </div>
  );
}
