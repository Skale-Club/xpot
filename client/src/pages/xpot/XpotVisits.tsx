import { useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from "lucide-react";
import { useVisits } from "./hooks/useVisits";
import { VisitRow } from "./components/VisitRow";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { visitsMessages } from "@/i18n/messages/visits";

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

  const today = new Date();
  const selectedDate = new Date();
  selectedDate.setDate(today.getDate() + dayOffset);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const picked = new Date(e.target.value + "T12:00:00");
    const todayMid = new Date(toLocalDateString(today) + "T12:00:00");
    const diff = Math.round((picked.getTime() - todayMid.getTime()) / (1000 * 60 * 60 * 24));
    setDayOffset(Math.min(0, diff));
  }, []);

  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in_progress" | "cancelled">("all");

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

  return (
    <div className="space-y-4">
      <div
        className="space-y-3 rounded-2xl px-3 py-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {(["all", "day"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className="relative flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
              style={viewMode === mode
                ? { background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.3))", color: "white" }
                : { color: "rgba(255,255,255,0.35)" }
              }
            >
              {mode === "all" ? (
                <>{t("allVisits")}{allVisits.length > 0 && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>{allVisits.length}</span>}</>
              ) : (
                <>{t("byDay")}{visitsForDay.length > 0 && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.1)" }}>{visitsForDay.length}</span>}</>
              )}
            </button>
          ))}
        </div>

        {viewMode === "all" ? (
          <div className="flex justify-center gap-1.5">
            {([
              { id: "all",         label: t("filterAll"),         active: "rgba(99,102,241,0.25)",  border: "rgba(99,102,241,0.4)",  text: "white" },
              { id: "completed",   label: t("filterCompleted"),   active: "rgba(16,185,129,0.2)",   border: "rgba(16,185,129,0.4)",  text: "#34d399" },
              { id: "in_progress", label: t("filterInProgress"), active: "rgba(59,130,246,0.2)",   border: "rgba(59,130,246,0.4)",  text: "#60a5fa" },
              { id: "cancelled",   label: t("filterCancelled"),   active: "rgba(239,68,68,0.2)",    border: "rgba(239,68,68,0.4)",   text: "#f87171" },
            ] as const).map(({ id, label, active, border, text }) => (
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
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDayOffset((d) => d - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker()}
              className="relative flex flex-col items-center gap-0.5"
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
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center"
          style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)" }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(239,68,68,0.12)" }}>
            <CalendarDays className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/70">{t("loadFailed")}</div>
            <div className="mt-0.5 text-xs text-white/35">
              {(visitsQuery.error as Error).message || t("loadFailedDesc")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void visitsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <RefreshCw className="h-4 w-4" />
            {tc("retry")}
          </button>
        </div>
      ) : null}

      {/* Visit list */}
      {!visitsQuery.isLoading && !visitsQuery.isError && visitsToRender.length ? (
        <div className="space-y-2">
          {visitsToRender.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
        </div>
      ) : !visitsQuery.isLoading && !visitsQuery.isError ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-10 text-center"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(99,102,241,0.12)" }}>
            <CalendarDays className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-white/60">
              {viewMode === "all"
                ? t("noVisitsYet")
                : isToday
                  ? t("noVisitsToday")
                  : isYesterday(selectedDate)
                    ? t("noVisitsYesterday")
                    : t("noVisitsOn", { day: formatDayLabel(selectedDate, t).toLowerCase() })}
            </div>
            <div className="mt-0.5 text-xs text-white/30">
              {viewMode === "all"
                ? t("firstVisitHint")
                : isToday
                  ? t("startVisitHint")
                  : t("nothingThisDay")}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
