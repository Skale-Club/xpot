import type { ReactNode } from "react";
import { ACCENT_SELECTED, GLASS, type ModuleAccent } from "./surface";

export type SegmentedItem<T extends string | number | undefined> = {
  id: T;
  label: ReactNode;
  /** Small badge after the label; hidden when 0 or missing. */
  count?: number;
};

/**
 * One-of-N view switch: the track with a gradient on the active segment
 * (All/By day, the dashboard period). It changes what the screen shows; filters
 * that narrow a list use FilterChips (components/xpot/filters.tsx) instead.
 * `size="sm"` is the compact form for section headers; `accent` tints the
 * active segment per module (violet in Tags).
 */
export function Segmented<T extends string | number | undefined>({
  items,
  value,
  onChange,
  className = "",
  itemClassName = "",
  accent = "visits",
  size = "md",
  ariaLabel,
}: {
  items: ReadonlyArray<SegmentedItem<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  itemClassName?: string;
  /** Module tint of the active segment (MODULE_ACCENT); Visits blue by default. */
  accent?: ModuleAccent;
  /** `sm`: a compact inline switch (section headers, the dashboard period). */
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const selected = ACCENT_SELECTED[accent];
  const small = size === "sm";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${small ? "inline-flex gap-0.5 rounded-lg p-0.5" : "flex gap-1 rounded-xl p-1"} ${className}`}
      style={{ background: GLASS.background, border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {items.map(({ id, label, count }) => (
        <button
          key={String(id)}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`relative font-semibold transition-all ${small ? "rounded-md px-2 py-1 text-[11px] tracking-wide" : "flex-1 rounded-lg py-2 text-xs"} ${
            value === id ? selected.fill : "text-white/40 hover:text-white/70"
          } ${itemClassName}`}
        >
          {label}
          {count ? (
            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>
              {count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
