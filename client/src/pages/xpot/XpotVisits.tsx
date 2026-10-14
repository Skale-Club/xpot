import { useState, useCallback, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useVisits } from "./hooks/useVisits";
import { VisitRow, VisitDeleteConfirm, VisitSummaryPage } from "./components/VisitRow";
import { VisitsTable } from "./components/VisitsTable";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import type { EnrichedSalesVisit } from "./types";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { visitsMessages } from "@/i18n/messages/visits";
import { Segmented } from "@/components/xpot/Segmented";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterDay, fromDayKey, toDayKey } from "@/components/xpot/filters";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";

type VisitsT = Translate<(typeof visitsMessages)["en"]>;

// VND-12: the picker could set sale_made / follow_up / no_answer /
// not_interested / came_back_later, and none were filterable — a rep could
// not list where they sold or where they need to go back. The dot is the
// status colour; the chip itself turns indigo like every other filter.
const STATUS_FILTERS = [
  { id: "sale_made", labelKey: "filterSold", dot: "bg-emerald-400" },
  { id: "follow_up", labelKey: "filterFollowUp", dot: "bg-violet-300" },
  { id: "came_back_later", labelKey: "filterComeBack", dot: "bg-amber-300" },
  { id: "no_answer", labelKey: "filterNoAnswer", dot: "bg-orange-400" },
  { id: "not_interested", labelKey: "filterNotInterested", dot: "bg-red-300" },
  { id: "completed", labelKey: "filterCompleted", dot: "bg-sky-300" },
  { id: "planned", labelKey: "filterPlanned", dot: "bg-slate-300" },
  { id: "in_progress", labelKey: "filterInProgress", dot: "bg-blue-400" },
  { id: "cancelled", labelKey: "filterCancelled", dot: "bg-red-500" },
] as const;

function isYesterday(date: Date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toDayKey(date) === toDayKey(yesterday);
}

function formatDayLabel(date: Date, t: VisitsT) {
  if (toDayKey(date) === toDayKey(new Date())) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return date.toLocaleDateString(t.locale, { weekday: "short", month: "short", day: "numeric" });
}

const visitDay = (visit: EnrichedSalesVisit) => {
  const when = visit.checkedInAt ?? visit.scheduledAt;
  return when ? toDayKey(new Date(when)) : null;
};

export function XpotVisits({ basePath = "/dashboard/history" }: { basePath?: string }) {
  const t = useT(visitsMessages);
  const tc = useT(commonMessages);
  const { visitsQuery } = useVisits();
  // ?view=day&day=2026-10-12&status=sale_made
  const filters = useUrlFilters({ view: "all", day: "", status: "all" });
  const viewMode: "all" | "day" = filters.values.view === "day" ? "day" : "all";
  const selectedDate = fromDayKey(filters.values.day) ?? new Date();
  const selectedKey = toDayKey(selectedDate);
  const statusFilter = filters.values.status;
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const [routeMatch, routeParams] = useRoute(`${basePath}/:id`);
  const routeId = routeMatch ? Number(routeParams.id) : null;
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const isToday = selectedKey === toDayKey(new Date());

  const allVisits = visitsQuery.data || [];

  const visitsForDay = useMemo(
    () =>
      allVisits
        .filter((visit) => visitDay(visit) === selectedKey)
        .sort((a, b) => new Date(a.checkedInAt ?? a.scheduledAt!).getTime() - new Date(b.checkedInAt ?? b.scheduledAt!).getTime()),
    [allVisits, selectedKey],
  );

  // The view picks the rows (everything or one day); the status narrows them.
  const viewVisits = viewMode === "all" ? allVisits : visitsForDay;
  const visitsToRender = statusFilter === "all" ? viewVisits : viewVisits.filter((v) => v.status === statusFilter);
  // A long history renders 50 at a time; the open visit is always on the page.
  const pagedVisits = usePagedList(visitsToRender, {
    resetKey: `${viewMode}|${selectedKey}|${statusFilter}`,
    keepIndex: routeId == null ? -1 : visitsToRender.findIndex((v) => v.id === routeId),
  });
  const visitsPager = <ListPager shown={pagedVisits.shown} total={pagedVisits.total} hasMore={pagedVisits.hasMore} onMore={pagedVisits.showMore} />;

  // Statuses with nothing in view stay out of the row (unless chosen), so a
  // rep with three outcomes sees three chips, not ten.
  const statusChips = [
    { id: "all", label: t("filterAll"), count: viewVisits.length },
    ...STATUS_FILTERS.map(({ id, labelKey, dot }) => ({ id, label: t(labelKey), dot, count: viewVisits.filter((v) => v.status === id).length }))
      .filter((chip) => chip.count > 0 || chip.id === statusFilter),
  ];

  // Visits per day, for the dots on the desktop calendar.
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of allVisits) {
      const k = visitDay(v);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [allVisits]);

  const selectedVisit = routeId ? allVisits.find((v) => v.id === routeId) ?? null : null;
  // Moving between visits and closing replace history; only the first open
  // pushes. The query string rides along so the filters stay put.
  const closeVisit = useCallback(() => navigate(`${basePath}${currentSearch()}`, { replace: true }), [basePath, navigate]);
  const openVisit = (v: EnrichedSalesVisit) => navigate(`${basePath}/${v.id}${currentSearch()}`, { replace: routeId != null });

  const emptyVisits = (
    <EmptyState
      icon={CalendarDays}
      title={statusFilter !== "all"
        ? t("noVisitsInFilter")
        : viewMode === "all"
          ? t("noVisitsYet")
          : isToday
            ? t("noVisitsToday")
            : isYesterday(selectedDate)
              ? t("noVisitsYesterday")
              : t("noVisitsOn", { day: formatDayLabel(selectedDate, t).toLowerCase() })}
      hint={statusFilter !== "all"
        ? t("chooseAnotherStatus")
        : viewMode === "all"
          ? t("firstVisitHint")
          : isToday
            ? t("startVisitHint")
            : t("nothingThisDay")}
    />
  );

  if (routeId != null) {
    return (
      <>
        {visitsQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-300" />
          </div>
        ) : visitsQuery.isError ? (
          <EmptyState
            tone="red"
            icon={CalendarDays}
            title={t("loadFailed")}
            hint={(visitsQuery.error as Error).message || t("loadFailedDesc")}
          >
            <button
              type="button"
              onClick={() => void visitsQuery.refetch()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white"
            >
              <RefreshCw className="h-4 w-4" />
              {tc("retry")}
            </button>
          </EmptyState>
        ) : selectedVisit ? (
          <VisitSummaryPage
            visit={selectedVisit}
            onBack={closeVisit}
            onDelete={() => setDeleteId(selectedVisit.id)}
          />
        ) : (
          <EmptyState icon={CalendarDays} title={t("visitNotFound")} />
        )}

        {deleteId != null && (
          <VisitDeleteConfirm
            visitId={deleteId}
            open
            onOpenChange={(open) => { if (!open) setDeleteId(null); }}
            onDeleted={() => { setDeleteId(null); closeVisit(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar
        testId="visits-filters"
        controls={
          <Segmented
            className="col-span-2 sm:w-72"
            items={[
              { id: "all" as const, label: t("allVisits"), count: allVisits.length },
              { id: "day" as const, label: t("byDay"), count: visitsForDay.length },
            ]}
            value={viewMode}
            onChange={(view) => filters.set({ view, day: view === "day" ? filters.values.day : null })}
          />
        }
        secondary={
          <div className="space-y-2.5">
            {viewMode === "day" ? (
              <FilterDay
                value={selectedDate}
                onChange={(next) => filters.set({ day: toDayKey(next) === toDayKey(new Date()) ? null : toDayKey(next) })}
                counts={countsByDay}
                detail={t.plural("visitCount", visitsForDay.length)}
              />
            ) : null}
            <FilterChips items={statusChips} value={statusFilter} onChange={(status) => filters.set({ status })} ariaLabel={t("filterByStatus")} />
          </div>
        }
        summary={{
          shown: visitsToRender.length,
          total: viewVisits.length,
          active: statusFilter !== "all",
          onClear: () => filters.set({ status: null }),
        }}
      />

      {visitsQuery.isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-2xl animate-pulse"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            />
          ))}
        </div>
      ) : visitsQuery.isError ? (
        <EmptyState
          tone="red"
          icon={CalendarDays}
          title={t("loadFailed")}
          hint={(visitsQuery.error as Error).message || t("loadFailedDesc")}
        >
          <button
            type="button"
            onClick={() => void visitsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <RefreshCw className="h-4 w-4" />
            {tc("retry")}
          </button>
        </EmptyState>
      ) : null}

      {/* Every visit opens the same dedicated summary route on desktop and mobile. */}
      {!visitsQuery.isLoading && !visitsQuery.isError ? (
        isDesktop ? (
          visitsToRender.length ? <><VisitsTable visits={pagedVisits.visible} selectedId={null} onSelect={openVisit} />{visitsPager}</> : emptyVisits
        ) : visitsToRender.length ? (
          <div className="space-y-2">
            {pagedVisits.visible.map((visit) => <VisitRow key={visit.id} visit={visit} onOpen={() => openVisit(visit)} />)}
            {visitsPager}
          </div>
        ) : (
          emptyVisits
        )
      ) : null}

      {deleteId != null && (
        <VisitDeleteConfirm
          visitId={deleteId}
          open
          onOpenChange={(o) => { if (!o) setDeleteId(null); }}
          onDeleted={() => { setDeleteId(null); closeVisit(); }}
        />
      )}
    </div>
  );
}
