import { useState, useCallback, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, UserRound } from "lucide-react";
import { useVisits } from "./hooks/useVisits";
import { VisitRow, VisitDeleteConfirm, VisitSummaryPage } from "./components/VisitRow";
import { VisitsTable } from "./components/VisitsTable";
import { visitStatusLabel, visitStatusTone } from "./components/VisitStatus";
import { PILL_DOTS } from "@/components/xpot/StatusPill";
import { checkinMessages } from "@/i18n/messages/checkin";
import { formatDate } from "@/lib/format";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import type { EnrichedSalesVisit } from "./types";
import { useT, type Translate } from "@/i18n";
import { visitsMessages } from "@/i18n/messages/visits";
import { Segmented } from "@/components/xpot/Segmented";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { FilterBar, FilterChips, FilterDay, FilterSelect, fromDayKey, toDayKey } from "@/components/xpot/filters";
import { useViewerAccess } from "@/lib/adminMode";
import { apiRequest } from "@/lib/queryClient";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";

type VisitsT = Translate<(typeof visitsMessages)["en"]>;

// VND-12: the picker could set sale_made / follow_up / no_answer /
// not_interested / came_back_later, and none were filterable — a rep could
// not list where they sold or where they need to go back. Each chip takes
// its dot and its name from the status badge (VisitStatus.tsx), so the filter
// and the rows always say the same; the chip itself turns blue like every
// other filter.
const STATUS_FILTERS = [
  "sale_made",
  "follow_up",
  "came_back_later",
  "no_answer",
  "not_interested",
  "completed",
  "planned",
  "in_progress",
  "cancelled",
] as const;

function isYesterday(date: Date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toDayKey(date) === toDayKey(yesterday);
}

function formatDayLabel(date: Date, t: VisitsT) {
  if (toDayKey(date) === toDayKey(new Date())) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return formatDate(date, { weekday: "short", month: "short", day: "numeric" });
}

const visitDay = (visit: EnrichedSalesVisit) => {
  const when = visit.checkedInAt ?? visit.scheduledAt;
  return when ? toDayKey(new Date(when)) : null;
};

export function XpotVisits({ basePath = "/dashboard/history" }: { basePath?: string }) {
  const t = useT(visitsMessages);
  const tStatus = useT(checkinMessages);
  const { visitsQuery: everyVisitQuery } = useVisits();
  // ?view=day&day=2026-10-12&status=sale_made&rep=12
  const filters = useUrlFilters({ view: "all", day: "", status: "all", rep: "" });
  // A manager in management mode sees everyone's visits and may narrow them to
  // one seller (People's "Their visits" opens it with ?rep=); the server only
  // honours ?repId= for them, so the filter is not offered to anyone else.
  const { canManage } = useViewerAccess();
  const repParam = Number(filters.values.rep);
  const repFilter = canManage && Number.isInteger(repParam) && repParam > 0 ? repParam : null;
  const peopleQuery = useQuery<Array<{ id: number; displayName: string }>>({ queryKey: ["/api/xpot/admin/reps"], enabled: canManage });
  const sellerOptions = useMemo(
    () => [...(peopleQuery.data ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((person) => ({ value: String(person.id), label: person.displayName })),
    [peopleQuery.data],
  );
  const sellerVisitsQuery = useQuery<EnrichedSalesVisit[]>({
    queryKey: ["/api/xpot/visits", { repId: repFilter }],
    queryFn: async () => (await apiRequest("GET", `/api/xpot/visits?repId=${repFilter}`)).json(),
    enabled: repFilter !== null,
  });
  const visitsQuery = repFilter !== null ? sellerVisitsQuery : everyVisitQuery;
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
    resetKey: `${viewMode}|${selectedKey}|${statusFilter}|${repFilter ?? ""}`,
    keepIndex: routeId == null ? -1 : visitsToRender.findIndex((v) => v.id === routeId),
  });
  const visitsPager = <ListPager shown={pagedVisits.shown} total={pagedVisits.total} hasMore={pagedVisits.hasMore} onMore={pagedVisits.showMore} />;

  // Statuses with nothing in view stay out of the row (unless chosen), so a
  // rep with three outcomes sees three chips, not ten.
  const statusChips = [
    { id: "all", label: t("filterAll"), count: viewVisits.length },
    ...STATUS_FILTERS.map((id) => ({ id, label: visitStatusLabel(tStatus, id), dot: PILL_DOTS[visitStatusTone(id)], count: viewVisits.filter((v) => v.status === id).length }))
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
          <ListSkeleton rows={3} rowClassName="h-28 rounded-2xl" />
        ) : visitsQuery.isError ? (
          <ErrorState
            title={t("loadFailed")}
            message={(visitsQuery.error as Error).message || t("loadFailedDesc")}
            onRetry={() => void visitsQuery.refetch()}
          />
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
        controls={<>
          <Segmented
            className="col-span-2 sm:w-72"
            items={[
              { id: "all" as const, label: t("allVisits"), count: allVisits.length },
              { id: "day" as const, label: t("byDay"), count: visitsForDay.length },
            ]}
            value={viewMode}
            onChange={(view) => filters.set({ view, day: view === "day" ? filters.values.day : null })}
          />
          {canManage ? (
            <FilterSelect
              className="col-span-2 sm:w-56"
              icon={UserRound}
              value={repFilter === null ? "" : String(repFilter)}
              onChange={(rep) => filters.set({ rep })}
              placeholder={t("allSellers")}
              options={sellerOptions}
              testId="visits-filter-seller"
            />
          ) : null}
        </>}
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
          active: statusFilter !== "all" || repFilter !== null,
          onClear: () => filters.set({ status: null, rep: null }),
        }}
      />

      {visitsQuery.isLoading ? (
        <ListSkeleton rows={4} />
      ) : visitsQuery.isError ? (
        <ErrorState
          title={t("loadFailed")}
          message={(visitsQuery.error as Error).message || t("loadFailedDesc")}
          onRetry={() => void visitsQuery.refetch()}
        />
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
