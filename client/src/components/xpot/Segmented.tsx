import type { ReactNode } from "react";

export type SegmentedItem<T extends string | number | undefined> = {
  id: T;
  label: ReactNode;
  /** Small badge after the label; hidden when 0 or missing. */
  count?: number;
};

/**
 * One-of-N switch. `tabs` is the track with a gradient on the active segment
 * (Leads/Prospects, All/By day, the Sales tabs); `chips` is a row of separate
 * pills (date ranges, active/closed).
 */
export function Segmented<T extends string | number | undefined>({
  items,
  value,
  onChange,
  variant = "tabs",
  className = "",
  itemClassName = "",
}: {
  items: ReadonlyArray<SegmentedItem<T>>;
  value: T;
  onChange: (id: T) => void;
  variant?: "tabs" | "chips";
  className?: string;
  itemClassName?: string;
}) {
  if (variant === "chips") {
    return (
      <div className={`flex gap-1.5 ${className}`}>
        {items.map(({ id, label }) => (
          <button
            key={String(id)}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={value === id}
            className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all ${itemClassName}`}
            style={value === id
              ? { background: "rgba(99,102,241,0.25)", color: "white", border: "1px solid rgba(99,102,241,0.4)" }
              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={`flex gap-1 rounded-xl p-1 ${className}`}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {items.map(({ id, label, count }) => (
        <button
          key={String(id)}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`relative flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${itemClassName}`}
          style={value === id
            ? { background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.3))", color: "white" }
            : { color: "rgba(255,255,255,0.35)" }}
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
