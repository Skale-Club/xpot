import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ACCENT_SELECTED, type ModuleAccent } from "./surface";

// The one tab bar of the app (first made for Settings): a recessed track with
// the active tab lifted in the module accent (blue by default, violet in Tags
// with accent="tags"). Arrow keys, Home and End move between tabs.

export type TabItem<T extends string> = { id: T; label: string; icon?: LucideIcon; testId?: string };

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  fill = true,
  className = "",
  testId,
  accent = "visits",
}: {
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Tab ids become `${idPrefix}-tab-<id>`; panels can point at them with aria-labelledby. */
  idPrefix: string;
  /** Spread the tabs over the full width (default) or keep them as wide as their labels. */
  fill?: boolean;
  className?: string;
  testId?: string;
  /** Module tint of the active tab (MODULE_ACCENT); Visits blue by default. */
  accent?: ModuleAccent;
}) {
  const selected = ACCENT_SELECTED[accent];
  const move = (event: KeyboardEvent<HTMLButtonElement>, current: T) => {
    const i = tabs.findIndex((tab) => tab.id === current);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${idPrefix}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${fill ? "flex" : "inline-flex max-w-full"} gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-black/20 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            data-testid={tab.testId}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, tab.id)}
            className={`group relative flex min-w-max items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${fill ? "flex-1" : ""} ${
              active ? selected.fill : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"
            }`}
          >
            {Icon ? <Icon className={`h-4 w-4 ${active ? selected.icon : "text-white/35 group-hover:text-white/55"}`} /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
