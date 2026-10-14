import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { PHONE_COUNTRIES } from "@shared/phone";
import { CountryFlag } from "@/components/CountryFlag";

// The country code next to a phone field. A native <select> can't show an
// image inside its options, so this is a small listbox with SVG flags.

const POPUP_GAP = 6;
const VIEWPORT_GAP = 8;
const POPUP_WIDTH = 224;
const POPUP_ID = "country-code-picker-popup";

type PopupPosition = Pick<CSSProperties, "left" | "top" | "width" | "maxHeight">;

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
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = PHONE_COUNTRIES.find((c) => c.code === value) ?? PHONE_COUNTRIES[0];

  const positionPopup = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const desiredHeight = Math.min(PHONE_COUNTRIES.length * 44 + 8, 280);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP - POPUP_GAP;
    const spaceAbove = rect.top - VIEWPORT_GAP - POPUP_GAP;
    const placeBelow = spaceBelow >= Math.min(desiredHeight, 176) || spaceBelow >= spaceAbove;
    const availableHeight = placeBelow ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(120, Math.min(desiredHeight, availableHeight));
    const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const left = Math.max(VIEWPORT_GAP, Math.min(rect.left, window.innerWidth - width - VIEWPORT_GAP));
    const top = placeBelow
      ? rect.bottom + POPUP_GAP
      : Math.max(VIEWPORT_GAP, rect.top - POPUP_GAP - maxHeight);

    setPopupPosition({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [open, positionPopup]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`#country-${PHONE_COUNTRIES[active].code}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Escape closes the list, not the dialog around it. Radix dialogs listen for Escape on the
  // document in the capture phase, before any handler on this element runs, so stopping the
  // event here is too late; a window capture listener runs first and keeps it.
  useEffect(() => {
    if (!open) return;
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector("button")?.focus();
    };
    window.addEventListener("keydown", onEscape, { capture: true });
    return () => window.removeEventListener("keydown", onEscape, { capture: true });
  }, [open]);

  const show = () => {
    setActive(Math.max(0, PHONE_COUNTRIES.findIndex((c) => c.code === current.code)));
    positionPopup();
    setOpen(true);
  };

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      show();
      return;
    }
    if (!open) return;

    const last = PHONE_COUNTRIES.length - 1;
    if (e.key === "ArrowDown") setActive((i) => (i >= last ? 0 : i + 1));
    else if (e.key === "ArrowUp") setActive((i) => (i <= 0 ? last : i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") pick(PHONE_COUNTRIES[active].code);
    else if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onTriggerKey}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={POPUP_ID}
        aria-activedescendant={open ? `country-${PHONE_COUNTRIES[active].code}` : undefined}
        aria-label={`${label}: ${current.label} +${current.code}`}
        className={`flex h-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-base text-white outline-none transition-all hover:bg-white/10 focus:border-blue-500/50 ${className}`}
        data-testid="select-country-code"
      >
        <CountryFlag iso={current.iso} />
        <span className="tabular-nums">+{current.code}</span>
        <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && popupPosition && typeof document !== "undefined" && createPortal(
        <ul
          ref={listRef}
          id={POPUP_ID}
          role="listbox"
          aria-label={label}
          data-country-code-picker-popup
          style={popupPosition}
          className="pointer-events-auto fixed z-[100] overflow-y-auto rounded-xl border border-white/10 bg-[#0d1424] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.6)] outline-none"
        >
          {PHONE_COUNTRIES.map((c, i) => (
            <li
              key={c.code}
              id={`country-${c.code}`}
              role="option"
              aria-selected={c.code === current.code}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(c.code)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-white ${i === active ? "bg-white/10" : ""}`}
            >
              <CountryFlag iso={c.iso} />
              <span className="flex-1">{c.label}</span>
              <span className="tabular-nums text-white/50">+{c.code}</span>
              {c.code === current.code ? <Check className="h-4 w-4 text-blue-400" /> : <span className="h-4 w-4" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
