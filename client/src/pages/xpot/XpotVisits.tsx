import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw, Building2, MousePointerClick, X } from "lucide-react";
import { useVisits } from "./hooks/useVisits";
import { VisitRow, VisitDetail, VisitDeleteConfirm } from "./components/VisitRow";
import { VisitsTable } from "./components/VisitsTable";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { MiniCalendar } from "@/components/xpot/MiniCalendar";
import { GLASS } from "@/components/xpot/surface";
import type { EnrichedSalesVisit } from "./types";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { visitsMessages } from "@/i18n/messages/visits";
import { Segmented } from "@/components/xpot/Segmented";
import { EmptyState } from "@/components/xpot/EmptyState";

type VisitsT = Translate<(typeof visitsMessages)["en"]>;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isYesterday(date: Date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

function formatDayLabel(date: Date, t: VisitsT) {
  if (isSameDay(date, new Date())) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return date.toLocaleDateString(t.locale, { weekday: "short", month: "short", day: "numeric" });
}

function toLocalDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function XpotVisits() {
  const t = useT(visitsMessages);
  const tc = useT(commonMessages);
  const { visitsQuery } = useVisits();
  const [viewMode, setViewMode] = useState<"all" | "day">("all");
  const [dayOffset, setDayOffset] = useState(0);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const [routeMatch, routeParams] = useRoute("/visits/:id");
  const routeId = routeMatch ? Number(routeParams.id) : null;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const today = new Date();
  const selectedDate = new Date();
  selectedDate.setDate(today.getDate() + dayOffset);

  const pickDay = useCallback((day: Date) => {
    const picked = new Date(toLocalDateString(day) + "T12:00:00");
    const todayMid = new Date(toLocalDateString(new Date()) + "T12:00:00");
    const diff = Math.round((picked.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24));
    setDayOffset(Math.min(0, diff));
  }, []);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    pickDay(new Date(e.target.value + "T12:00:00"));
  }, [pickDay]);

  // VND-12: the picker could set sale_made / follow_up / no_answer /
  // not_interested / came_back_later, and none were filterable — a rep could
  // not list where they sold or where they need to go back.
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const allVisits = visitsQuery.data || [];

  const visitsForDay = allVisits.filter((visit) => {
    if (!visit.checkedInAt) return false;
    return isSameDay(new Date(visit.checkedInAt), selectedDate);
  });

  const isToday = dayOffset === 0;

  const filteredAll = statusFilter === "all"
    ? allVisits
    : allVisits.filter((v) => v.status === statusFilter);

  const visitsToRender = viewMode === "all" ? filteredAll : visitsForDay;

  // Visits per day, for the dots on the desktop calendar.
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of allVisits) {
      if (!v.checkedInAt) continue;
      const k = toLocalDateString(new Date(v.checkedInAt));
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [allVisits]);

  const selectedVisit = routeId ? allVisits.find((v) => v.id === routeId) ?? null : null;
  // Moving between visits and closing replace history; only the first open pushes.
  const closeVisit = useCallback(() => navigate("/visits", { replace: true }), [navigate]);
  const openVisit = (v: EnrichedSalesVisit) => navigate(`/visits/${v.id}`, { replace: routeId != null });

  // Close the calendar popover on Escape.
  useEffect(() => {
    if (!calendarOpen) return;
    // Capture phase + preventDefault: MasterDetail skips handled events, so one
    // Escape closes the popover without also closing the open visit.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setCalendarOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [calendarOpen]);

  const emptyVisits = (
    <EmptyState
      icon={CalendarDays}
      title={viewMode === "all"
        ? t("noVisitsYet")
        : isToday
          ? t("noVisitsToday")
          : isYesterday(selectedDate)
            ? t("noVisitsYesterday")
            : t("noVisitsOn", { day: formatDayLabel(selectedDate, t).toLowerCase() })}
      hint={viewMode === "all"
        ? t("firstVisitHint")
        : isToday
          ? t("startVisitHint")
          : t("nothingThisDay")}
    />
  );

  return (
    <div className="space-y-4">
      <div
        className="space-y-3 rounded-2xl px-3 py-3 lg:flex lg:items-center lg:gap-4 lg:space-y-0"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Segmented
          className="lg:w-72 lg:shrink-0"
          items={[
            { id: "all" as const, label: t("allVisits"), count: allVisits.length },
            { id: "day" as const, label: t("byDay"), count: visitsForDay.length },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />

        {viewMode === "all" ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {([
              { id: "all",             label: t("filterAll"),          active: "rgba(99,102,241,0.25)",  border: "rgba(99,102,241,0.4)",  text: "white" },
              { id: "sale_made",       label: t("filterSold"),         active: "rgba(16,185,129,0.2)",   border: "rgba(16,185,129,0.4)",  text: "#34d399" },
              { id: "follow_up",       label: t("filterFollowUp"),     active: "rgba(167,139,250,0.2)",  border: "rgba(167,139,250,0.4)", text: "#c4b5fd" },
              { id: "came_back_later", label: t("filterComeBack"),     active: "rgba(251,191,36,0.2)",   border: "rgba(251,191,36,0.4)",  text: "#fde68a" },
              { id: "no_answer",       label: t("filterNoAnswer"),     active: "rgba(251,146,60,0.2)",   border: "rgba(251,146,60,0.4)",  text: "#fdba74" },
              { id: "not_interested",  label: t("filterNotInterested"), active: "rgba(248,113,113,0.2)", border: "rgba(248,113,113,0.4)", text: "#fca5a5" },
              { id: "completed",       label: t("filterCompleted"),    active: "rgba(56,189,248,0.2)",   border: "rgba(56,189,248,0.4)",  text: "#7dd3fc" },
              { id: "in_progress",     label: t("filterInProgress"),   active: "rgba(59,130,246,0.2)",   border: "rgba(59,130,246,0.4)",  text: "#60a5fa" },
              { id: "cancelled",       label: t("filterCancelled"),    active: "rgba(239,68,68,0.2)",    border: "rgba(239,68,68,0.4)",   text: "#f87171" },
            ]).map(({ id, label, active, border, text }) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                style={statusFilter === id
                  ? { background: active, color: text, border: `1px solid ${border}` }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        ) : viewMode === "day" ? (
          <div className="relative flex items-center justify-between gap-2 lg:flex-1 lg:justify-center lg:gap-4">
            <button
              type="button"
              onClick={() => setDayOffset((d) => d - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => (isDesktop ? setCalendarOpen((o) => !o) : dateInputRef.current?.showPicker())}
              aria-expanded={isDesktop ? calendarOpen : undefined}
              aria-label={isDesktop ? t("pickDay") : undefined}
              className="relative flex flex-col items-center gap-0.5 lg:rounded-xl lg:px-3 lg:py-1 lg:hover:bg-white/[0.05]"
            >
              <span className="text-sm font-semibold text-white">{formatDayLabel(selectedDate, t)}</span>
              <span className="text-[11px] text-white/35">
                {t.plural("visitCount", visitsForDay.length)}
              </span>
              <input
                ref={dateInputRef}
                type="date"
                max={toLocalDateString(today)}
                value={toLocalDateString(selectedDate)}
                onChange={handleDateChange}
                className="absolute inset-0 opacity-0 pointer-events-none h-0 w-0"
              />
            </button>

            <button
              type="button"
              onClick={() => setDayOffset((d) => Math.min(0, d + 1))}
              disabled={isToday}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/8 hover:text-white/80 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {isDesktop && calendarOpen && (
              <>
                <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setCalendarOpen(false)} />
                <div
                  className="absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-2xl p-3 shadow-2xl"
                  style={{ background: "#0e1424", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <MiniCalendar
                    value={selectedDate}
                    onChange={(d) => { pickDay(d); setCalendarOpen(false); }}
                    counts={countsByDay}
                    max={today}
                    locale={t.locale}
                    labels={{ prev: t("prevMonth"), next: t("nextMonth") }}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

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

      {/* Visit list. On desktop the open visit stays beside an empty list
          (a filter or day with nothing in it) instead of disappearing. */}
      {!visitsQuery.isLoading && !visitsQuery.isError ? (
        isDesktop ? (
          <MasterDetail
            closeLabel={t("closePane")}
            onClose={closeVisit}
            list={visitsToRender.length ? <VisitsTable visits={visitsToRender} selectedId={routeId} onSelect={openVisit} /> : emptyVisits}
            detail={routeId == null ? null : selectedVisit ? (
              <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }} data-testid="visit-detail-pane">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
                  <Link href={`/leads/${selectedVisit.leadId}`} className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300">
                    <Building2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t("openCompany")}</span>
                  </Link>
                  <button type="button" onClick={closeVisit} aria-label={t("closePane")} title={t("closePane")} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5">
                  <VisitDetail key={selectedVisit.id} visit={selectedVisit} layout="pane" onDelete={() => setDeleteId(selectedVisit.id)} />
                </div>
              </div>
            ) : (
              <EmptyState icon={CalendarDays} title={t("visitNotFound")} cardStyle={GLASS} />
            )}
            placeholder={<EmptyState icon={MousePointerClick} title={t("selectVisit")} hint={t("selectVisitHint")} cardStyle={GLASS} />}
          />
        ) : visitsToRender.length ? (
          <div className="space-y-2">
            {visitsToRender.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
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
