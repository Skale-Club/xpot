import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, X } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useT } from "@/i18n";
import { filtersMessages } from "@/i18n/messages/filters";
import { MiniCalendar } from "./MiniCalendar";
import { GLASS_SUBTLE_CLASS, SURFACE_MODAL } from "./surface";

// The one filter bar of the app. Every list (Leads, Visits, Pieces, Tasks,
// Sales, the Tags admin) builds its filters from these parts, so they look and
// behave the same everywhere:
//   - one card, always the same rows: search + selects + actions, then chips
//     (or the day picker), then "Showing 12 of 340 · Clear filters" while
//     anything is narrowed;
//   - one height (40px) for search, selects, toggles and the day picker;
//   - one "on" colour (indigo) for whatever is narrowing the list. Status
//     colours only show as a dot, never as the whole chip;
//   - keyboard focus is the global outline (index.css), no rings of their own.

const CONTROL = "h-10 rounded-xl border text-sm outline-none transition-colors";
const CONTROL_IDLE = "border-white/[0.08] bg-black/20 text-white/65 hover:border-white/[0.15] hover:bg-white/[0.04] hover:text-white/85";
const CONTROL_ON = "border-indigo-400/40 bg-indigo-500/[0.14] text-white";

// ─── Bar ──────────────────────────────────────────────────────────────────────

export type FilterSummary = {
  /** Rows on screen after filtering; leave out when the list counts itself. */
  shown?: number;
  /** Rows before filtering, when known (client-side filters). */
  total?: number;
  /** Something narrows the list: shows the line and the clear button. */
  active: boolean;
  onClear: () => void;
};

export function FilterBar({
  search,
  controls,
  actions,
  secondary,
  summary,
  className = "",
  testId,
}: {
  /** Usually a <FilterSearch>; takes the free width of the first row. */
  search?: ReactNode;
  /** Selects and toggles. Beside the search on desktop, a 2-column grid on phones. */
  controls?: ReactNode;
  /** Buttons that act on the list ("New lead"). End of the first row. */
  actions?: ReactNode;
  /** Second row: <FilterChips>, <FilterDay> or a view switch. */
  secondary?: ReactNode;
  summary?: FilterSummary;
  className?: string;
  testId?: string;
}) {
  const hasFirstRow = Boolean(search || controls || actions);
  return (
    <div
      className={`space-y-2.5 rounded-2xl ${GLASS_SUBTLE_CLASS} p-2.5 ${className}`}
      data-testid={testId}
    >
      {hasFirstRow ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? <div className="order-1 min-w-0 flex-1 basis-[200px]">{search}</div> : null}
          {actions ? <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3">{actions}</div> : null}
          {controls ? (
            <div
              // Phones: two per row; a lone last control takes the whole row instead of leaving a hole.
              className={`order-3 grid min-w-0 basis-full grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:order-2 lg:basis-auto [&>*:last-child:nth-child(odd)]:col-span-2 ${search ? "" : "lg:flex-1"}`}
            >
              {controls}
            </div>
          ) : null}
        </div>
      ) : null}
      {secondary}
      {summary?.active ? <FilterSummaryLine {...summary} /> : null}
    </div>
  );
}

function FilterSummaryLine({ shown, total, onClear }: FilterSummary) {
  const t = useT(filtersMessages);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-1 pt-2" data-testid="filter-summary">
      <span className="text-xs tabular-nums text-white/45">
        {shown == null ? null : total != null && total !== shown ? t("showingOf", { shown, total }) : t.plural("resultsCount", shown)}
      </span>
      <FilterClear onClear={onClear} />
    </div>
  );
}

export function FilterClear({ onClear, className = "" }: { onClear: () => void; className?: string }) {
  const t = useT(filtersMessages);
  return (
    <button
      type="button"
      onClick={onClear}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/10 hover:text-indigo-200 ${className}`}
      data-testid="clear-filters"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      {t("clearFilters")}
    </button>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search box. With `debounceMs` it reports after typing pauses (use it when the
 * search hits the server or the URL); Escape and the × clear it.
 */
export function FilterSearch({
  value,
  onChange,
  placeholder,
  debounceMs = 0,
  maxLength = 100,
  testId,
  shortcut = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  debounceMs?: number;
  maxLength?: number;
  testId?: string;
  /** Focus with the "/" desktop shortcut. */
  shortcut?: boolean;
}) {
  const t = useT(filtersMessages);
  const [draft, setDraft] = useState(value);
  const sent = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A change from outside (clear filters, back button) replaces what is typed.
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === sent.current) return;
    const send = () => {
      sent.current = draft;
      onChangeRef.current(draft);
    };
    if (!debounceMs) return send();
    const id = window.setTimeout(send, debounceMs);
    return () => window.clearTimeout(id);
  }, [draft, debounceMs]);

  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
      <input
        type="search"
        value={draft}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            event.stopPropagation();
            setDraft("");
          }
        }}
        placeholder={placeholder}
        className={`${CONTROL} w-full border-white/[0.08] bg-black/20 pl-9 pr-9 text-white placeholder:text-white/30 hover:border-white/[0.15] focus:border-indigo-400/50 [&::-webkit-search-cancel-button]:hidden`}
        data-testid={testId}
        data-shortcut={shortcut ? "search" : undefined}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => setDraft("")}
          aria-label={t("clearSearch")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

export type FilterOption = { value: string; label: string };

/**
 * One-of-many filter on the native picker (the phone's own wheel). The empty
 * value is "no filter" and shows `placeholder` ("All companies").
 */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  icon: Icon,
  testId,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: ReadonlyArray<FilterOption>;
  icon?: LucideIcon;
  testId?: string;
  disabled?: boolean;
  className?: string;
}) {
  const on = value !== "";
  // A value from the URL that the options don't hold (yet) still reads as chosen.
  const list = on && !options.some((option) => option.value === value) ? [...options, { value, label: value }] : options;
  return (
    <label className={`relative block min-w-0 lg:w-auto ${className}`}>
      <span className="sr-only">{placeholder}</span>
      {Icon ? (
        <Icon className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${on ? "text-indigo-300" : "text-white/30"}`} aria-hidden="true" />
      ) : null}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} ${on ? CONTROL_ON : CONTROL_IDLE} w-full appearance-none truncate font-medium [color-scheme:dark] disabled:opacity-40 lg:w-auto lg:min-w-[150px] lg:max-w-[240px] ${Icon ? "pl-9" : "pl-3"} pr-8`}
        data-testid={testId}
      >
        <option value="" className="bg-[#0d1322]">{placeholder}</option>
        {list.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0d1322]">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
    </label>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

/** On/off filter ("Whole team", "Show archived"), the same size as a select. */
export function FilterToggle({
  pressed,
  onChange,
  label,
  icon: Icon,
  testId,
}: {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  label: string;
  icon?: LucideIcon;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`${CONTROL} ${pressed ? CONTROL_ON : CONTROL_IDLE} inline-flex min-w-0 items-center justify-center gap-2 px-3 font-medium`}
      data-testid={testId}
    >
      {Icon ? <Icon className={`h-4 w-4 shrink-0 ${pressed ? "text-indigo-300" : "text-white/35"}`} aria-hidden="true" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────

export type FilterChip<T extends string> = {
  id: T;
  label: string;
  count?: number;
  /** Tailwind bg-* class for a status dot (e.g. "bg-emerald-400"). */
  dot?: string;
  testId?: string;
};

/** One-of-N quick filter. Scrolls sideways on phones, wraps on desktop. */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ReadonlyArray<FilterChip<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none transition-colors ${
              on ? "border-indigo-400/40 bg-indigo-500/[0.18] text-white" : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/[0.15] hover:text-white/80"
            }`}
            data-testid={item.testId}
          >
            {item.dot ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot} ${on ? "" : "opacity-70"}`} aria-hidden="true" /> : null}
            {item.label}
            {item.count != null ? (
              <span className={`rounded-full px-1.5 py-px text-[10px] tabular-nums ${on ? "bg-indigo-400/25 text-indigo-100" : "bg-white/[0.06] text-white/40"}`}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── Token ────────────────────────────────────────────────────────────────────

/** A filter that came from elsewhere ("Pieces of Acme"), removable with ×. */
export function FilterToken({ label, onRemove, testId }: { label: string; onRemove: () => void; testId?: string }) {
  const t = useT(filtersMessages);
  return (
    <span
      className="inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-indigo-400/40 bg-indigo-500/[0.14] pl-3 pr-1 text-xs font-semibold text-white"
      data-testid={testId}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("clearFilters")}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-indigo-200/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// ─── Day ──────────────────────────────────────────────────────────────────────

export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" (local) → noon that day, or null when malformed. */
export function fromDayKey(key: string | null | undefined): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date) {
  return toDayKey(a) === toDayKey(b);
}

/**
 * Day stepper: ‹ day › with the month calendar (desktop) or the phone's date
 * picker behind the label. Days after `max` (default today) can't be picked.
 */
export function FilterDay({
  value,
  onChange,
  counts,
  detail,
  max = new Date(),
}: {
  value: Date;
  onChange: (day: Date) => void;
  /** Items per "YYYY-MM-DD", for the calendar's dots. */
  counts?: Map<string, number>;
  /** Under the day ("3 visits"). */
  detail?: string;
  max?: Date;
}) {
  const t = useT(filtersMessages);
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = toDayKey(value) >= toDayKey(max);
  const isToday = sameDay(value, new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const label = isToday
    ? t("today")
    : sameDay(value, yesterday)
      ? t("yesterday")
      : value.toLocaleDateString(t.locale, { weekday: "short", month: "short", day: "numeric" });

  const shift = (days: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    onChange(next);
  };

  // Capture phase + preventDefault: MasterDetail skips handled events, so one
  // Escape closes the calendar without also closing the open row.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const step = "flex h-full w-10 shrink-0 items-center justify-center text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-10 min-w-0 flex-1 items-stretch overflow-visible rounded-xl border border-white/[0.08] bg-black/20 sm:flex-none">
        <button type="button" onClick={() => shift(-1)} aria-label={t("previousDay")} className={`${step} rounded-l-xl`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (isDesktop ? setOpen((current) => !current) : inputRef.current?.showPicker?.())}
          aria-expanded={isDesktop ? open : undefined}
          aria-label={t("pickDay")}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center border-x border-white/[0.06] px-4 leading-tight transition-colors hover:bg-white/[0.04] sm:min-w-[150px]"
        >
          <span className="truncate text-sm font-semibold text-white">{label}</span>
          {detail ? <span className="truncate text-[10px] font-medium text-white/40">{detail}</span> : null}
          <input
            ref={inputRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            max={toDayKey(max)}
            value={toDayKey(value)}
            onChange={(event) => {
              const picked = fromDayKey(event.target.value);
              if (picked) onChange(picked);
            }}
            className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 opacity-0"
          />
        </button>
        <button type="button" onClick={() => shift(1)} disabled={atMax} aria-label={t("nextDay")} className={`${step} rounded-r-xl`}>
          <ChevronRight className="h-4 w-4" />
        </button>

        {isDesktop && open ? (
          <>
            <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            <div className="absolute left-1/2 top-[calc(100%+6px)] z-40 w-72 -translate-x-1/2 rounded-2xl border border-white/[0.1] p-3 shadow-[0_16px_44px_rgba(0,0,0,0.5)] backdrop-blur-xl" style={{ background: SURFACE_MODAL }}>
              <MiniCalendar
                value={value}
                onChange={(day) => {
                  onChange(day);
                  setOpen(false);
                }}
                counts={counts ?? new Map()}
                max={max}
                locale={t.locale}
                labels={{ prev: t("previousMonth"), next: t("nextMonth") }}
              />
            </div>
          </>
        ) : null}
      </div>
      {!isToday ? (
        <button
          type="button"
          onClick={() => onChange(new Date())}
          className={`${CONTROL} ${CONTROL_IDLE} shrink-0 px-3 text-xs font-semibold`}
        >
          {t("today")}
        </button>
      ) : null}
    </div>
  );
}
