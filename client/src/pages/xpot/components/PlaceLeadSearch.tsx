import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, LocateFixed, Plus, Search, X } from "lucide-react";
import { DotsLoader } from "@/components/ui/spinner";
import { Pill } from "@/components/xpot/StatusPill";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { GoogleLogo } from "@/components/ui/google-logo";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { usePlaceSearch } from "../usePlaceSearch";
import { findMatchingLead } from "../utils";
import { leadMatchesSearch } from "../hooks/useLeads";
import type { FullSalesLead, GeoState, GooglePlaceResult } from "../types";

const MAX_LEADS = 6;

type Item =
  | { kind: "lead"; key: string; lead: FullSalesLead }
  | { kind: "place"; key: string; place: GooglePlaceResult; match?: FullSalesLead }
  | { kind: "create"; key: string };

export type PlaceLeadSearchHandle = { focus: () => void };

/**
 * One search for "where am I checking in": the rep's saved customers and
 * Google Places side by side, plus "create a company" when neither has it.
 * On a computer the results open as two columns and the keyboard drives them
 * (↑ ↓ Enter Esc); on a phone they stack in one list.
 */
export const PlaceLeadSearch = forwardRef<PlaceLeadSearchHandle, {
  value: string;
  onChange: (value: string) => void;
  leads: FullSalesLead[];
  geoState: GeoState;
  enabled?: boolean;
  placeholder: string;
  busy?: boolean;
  /** Shown at the end of the input row, e.g. a keyboard hint. */
  trailing?: ReactNode;
  onPickLead: (lead: FullSalesLead) => void;
  onPickPlace: (place: GooglePlaceResult) => void;
  onCreate: (name: string) => void;
  onNearby: () => void;
  onOpenChange?: (open: boolean) => void;
  size?: "lg" | "md";
}>(function PlaceLeadSearch({
  value,
  onChange,
  leads,
  geoState,
  enabled = true,
  placeholder,
  busy = false,
  trailing,
  onPickLead,
  onPickPlace,
  onCreate,
  onNearby,
  onOpenChange,
  size = "lg",
}, ref) {
  const t = useT(checkinMessages);
  const isDesktop = useIsDesktop();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpenState] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const placeQuery = usePlaceSearch(value, enabled && open, geoState);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const query = value.trim();
  const leadResults = useMemo(
    () => leads.filter((lead) => leadMatchesSearch(lead, query)).slice(0, MAX_LEADS),
    [leads, query],
  );
  const places = query.length >= 2 ? placeQuery.data?.results ?? [] : [];

  // Visual order and keyboard order are the same list.
  const items: Item[] = useMemo(() => [
    ...leadResults.map((lead) => ({ kind: "lead" as const, key: `lead-${lead.id}`, lead })),
    ...(isDesktop ? [{ kind: "create" as const, key: "create" }] : []),
    ...places.map((place) => ({ kind: "place" as const, key: `place-${place.placeId}`, place, match: findMatchingLead(place, leads) })),
    ...(isDesktop ? [] : [{ kind: "create" as const, key: "create" }]),
  ], [isDesktop, leadResults, leads, places]);

  useEffect(() => { setActiveIndex(-1); }, [query]);

  const pick = (item: Item) => {
    setOpen(false);
    inputRef.current?.blur();
    if (item.kind === "lead") onPickLead(item.lead);
    else if (item.kind === "place") onPickPlace(item.place);
    else onCreate(query);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (!items.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex] ?? items.find((candidate) => candidate.kind !== "create");
      if (item) pick(item);
    }
  };

  const indexOf = (key: string) => items.findIndex((item) => item.key === key);

  // Phones wrap to two lines: a single-line ellipsis cut off exactly the part
  // of a name or address that tells two shops apart.
  const lineClamp = isDesktop ? "truncate" : "line-clamp-2 break-words";

  const rowClass = (key: string) =>
    `flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${indexOf(key) === activeIndex ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`;

  const leadRows = leadResults.map((lead) => {
    const key = `lead-${lead.id}`;
    const address = lead.locations?.[0]?.addressLine1;
    return (
      <button key={key} type="button" id={key} role="option" aria-selected={indexOf(key) === activeIndex} onMouseEnter={() => setActiveIndex(indexOf(key))} onClick={() => pick({ kind: "lead", key, lead })} className={rowClass(key)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.05] text-white/55">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold text-white/90 ${lineClamp}`}>{lead.name}</span>
          <span className={`block text-xs text-white/40 ${lineClamp}`}>{address || lead.industry || t("localLead")}</span>
        </span>
        {/* Already saved: neutral, green is money. */}
        <Pill tone="slate" className="mt-0.5 shrink-0">{t("badgeLocal")}</Pill>
      </button>
    );
  });

  const createRow = (
    <button
      key="create"
      type="button"
      id="create"
      role="option"
      aria-selected={indexOf("create") === activeIndex}
      onMouseEnter={() => setActiveIndex(indexOf("create"))}
      onClick={() => pick({ kind: "create", key: "create" })}
      className={rowClass("create")}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
        <Plus className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/90">{query.length >= 2 ? t("createNamed", { name: query }) : t("addNewLead")}</span>
        <span className="block truncate text-xs text-white/40">{t("addAsCompany")}</span>
      </span>
    </button>
  );

  const placeRows = places.map((place) => {
    const key = `place-${place.placeId}`;
    const match = findMatchingLead(place, leads);
    return (
      <button key={key} type="button" id={key} role="option" aria-selected={indexOf(key) === activeIndex} onMouseEnter={() => setActiveIndex(indexOf(key))} onClick={() => pick({ kind: "place", key, place, match })} className={rowClass(key)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-300">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold text-white/90 ${lineClamp}`}>{place.name}</span>
          <span className={`block text-xs text-white/40 ${lineClamp}`}>{place.address}</span>
          {place.primaryType || place.phone ? (
            <span className="mt-0.5 flex gap-2 truncate text-[10px] font-medium uppercase tracking-wider text-white/30">
              {place.primaryType ? <span className="truncate">{place.primaryType.replace(/_/g, " ")}</span> : null}
              {place.phone ? <span className="shrink-0">{place.phone}</span> : null}
            </span>
          ) : null}
        </span>
        {match ? (
          <span className="mt-0.5 shrink-0 rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">{t("badgeMatch")}</span>
        ) : (
          <span className="mt-1 flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
            <GoogleLogo className="h-3 w-3" /> Google
          </span>
        )}
      </button>
    );
  });

  const googleStatus = query.length < 2 ? (
    <div className="px-3 py-6 text-center text-xs text-white/35">{t("searchGoogleHint")}</div>
  ) : placeQuery.error ? (
    <div className="mx-1 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">{(placeQuery.error as Error).message}</div>
  ) : placeQuery.isFetching && !places.length ? (
    <div className="space-y-1.5 px-1">
      {[0, 1, 2].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}
    </div>
  ) : !places.length && !placeQuery.isFetching && placeQuery.isFetched ? (
    <div className="px-3 py-6 text-center text-xs text-white/35">{t("searchGoogleEmpty")}</div>
  ) : null;

  const sectionLabel = (label: string, extra?: ReactNode) => (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</span>
      {extra}
    </div>
  );

  const tall = size === "lg";

  return (
    <div className="relative">
      <div className={`xpot-place-search group relative flex items-center rounded-2xl border bg-[#0b1120]/80 transition-colors ${open ? "border-indigo-400/45 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]" : "border-white/[0.1] hover:border-white/[0.16]"}`}>
        <Search className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-indigo-300/80" />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={items[activeIndex]?.key}
          className={`w-full bg-transparent pl-12 pr-2 font-medium text-white placeholder:text-white/30 focus:outline-none ${tall ? "h-14 text-[16px]" : "h-12 text-[15px]"}`}
          data-testid="place-lead-search"
        />
        <div className="flex shrink-0 items-center gap-1 pr-2">
          {busy || placeQuery.isFetching ? <DotsLoader size="xs" tone="muted" /> : null}
          {value ? (
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); inputRef.current?.focus(); }} aria-label={t("searchClear")} title={t("searchClear")} className="flex h-10 w-10 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/80">
              <X className="h-4 w-4" />
            </button>
          ) : trailing}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { onNearby(); setOpen(true); inputRef.current?.focus(); }}
            className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-indigo-200/80 transition-colors hover:bg-indigo-500/15 hover:text-indigo-100"
            title={t("searchNearby")}
          >
            <LocateFixed className="h-4 w-4" />
            <span className="hidden sm:inline">{t("searchNearby")}</span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          role="listbox"
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0d1322]/[0.98] shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          {isDesktop ? (
            <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
              <div className="max-h-[420px] overflow-y-auto p-2">
                {sectionLabel(t("searchSectionLeads"), leadResults.length ? <span className="text-[10px] tabular-nums text-white/25">{leadResults.length}</span> : null)}
                {leadRows.length ? leadRows : <div className="px-3 py-4 text-xs text-white/35">{t("searchNoLeads")}</div>}
                <div className="mt-1 border-t border-white/[0.06] pt-1">{createRow}</div>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-2">
                {sectionLabel(t("searchSectionGoogle"), <GoogleLogo className="h-3.5 w-3.5 opacity-70" />)}
                {placeRows}
                {googleStatus}
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {leadRows.length ? <>{sectionLabel(t("searchSectionLeads"))}{leadRows}</> : null}
              <div className={leadRows.length ? "mt-2 border-t border-white/[0.06] pt-2" : ""}>
                {sectionLabel(t("searchSectionGoogle"), <GoogleLogo className="h-3.5 w-3.5 opacity-70" />)}
                {placeRows}
                {googleStatus}
              </div>
              <div className="mt-1 border-t border-white/[0.06] pt-1">{createRow}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
