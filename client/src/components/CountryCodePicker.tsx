import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PHONE_COUNTRIES } from "@shared/phone";
import { CountryFlag } from "@/components/CountryFlag";

// The country code next to a phone field. A native <select> can't show an
// image inside its options, so this is a small listbox with SVG flags.

export function CountryCodePicker({
  value,
  onChange,
  label,
  className = "",
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = PHONE_COUNTRIES.find((c) => c.code === value) ?? PHONE_COUNTRIES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const show = () => {
    setActive(Math.max(0, PHONE_COUNTRIES.findIndex((c) => c.code === current.code)));
    setOpen(true);
  };

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
  };

  const onListKey = (e: KeyboardEvent) => {
    const last = PHONE_COUNTRIES.length - 1;
    if (e.key === "ArrowDown") setActive((i) => (i >= last ? 0 : i + 1));
    else if (e.key === "ArrowUp") setActive((i) => (i <= 0 ? last : i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") pick(PHONE_COUNTRIES[active].code);
    else if (e.key === "Escape" || e.key === "Tab") {
      // Escape stays inside the picker, so the dialog around it doesn't close.
      if (e.key === "Escape") e.stopPropagation();
      setOpen(false);
      if (e.key === "Escape") rootRef.current?.querySelector("button")?.focus();
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label} +${current.code}`}
        className={`flex h-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white outline-none transition-all hover:bg-white/10 focus:border-blue-500/50 ${className}`}
        data-testid="select-country-code"
      >
        <CountryFlag iso={current.iso} />
        <span className="tabular-nums">+{current.code}</span>
        <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`country-${PHONE_COUNTRIES[active].code}`}
          onKeyDown={onListKey}
          className="absolute left-0 top-full z-50 mt-1.5 min-w-[11rem] rounded-xl border border-white/10 bg-[#0d1424] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)] outline-none"
        >
          {PHONE_COUNTRIES.map((c, i) => (
            <li
              key={c.code}
              id={`country-${c.code}`}
              role="option"
              aria-selected={c.code === current.code}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(c.code)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-white ${i === active ? "bg-white/10" : ""}`}
            >
              <CountryFlag iso={c.iso} />
              <span className="flex-1">{c.label}</span>
              <span className="tabular-nums text-white/50">+{c.code}</span>
              {c.code === current.code ? <Check className="h-4 w-4 text-blue-400" /> : <span className="h-4 w-4" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
