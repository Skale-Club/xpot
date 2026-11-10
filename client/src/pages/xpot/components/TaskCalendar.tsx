import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { tasksMessages } from "@/i18n/messages/tasks";
import { calendarDayKey, calendarMonthDays } from "../taskCalendar";

type CalendarTask = { id: number; title: string; dueAt: Date | string | null; priority: string; status: string };

export function TaskCalendar({ tasks, value, undated, onChange, onUndated, onCreate }: {
  tasks: readonly CalendarTask[];
  value: Date;
  undated: boolean;
  onChange: (date: Date) => void;
  onUndated: () => void;
  onCreate: () => void;
}) {
  const t = useT(tasksMessages);
  const days = calendarMonthDays(value);
  const today = calendarDayKey(new Date());
  const selected = calendarDayKey(value);
  const { byDay, withoutDate } = useMemo(() => {
    const byDay = new Map<string, CalendarTask[]>();
    let withoutDate = 0;
    for (const task of tasks) {
      if (!task.dueAt) { withoutDate++; continue; }
      const key = calendarDayKey(new Date(task.dueAt));
      const group = byDay.get(key) ?? [];
      group.push(task);
      byDay.set(key, group);
    }
    byDay.forEach((group) => group.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime()));
    return { byDay, withoutDate };
  }, [tasks]);
  const shiftMonth = (offset: number) => onChange(new Date(value.getFullYear(), value.getMonth() + offset, 1, 12));

  return (
    <section aria-label={t("viewCalendar")} className={`overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`} data-testid="tasks-calendar">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label={t("previousMonth")} data-testid="tasks-calendar-prev"><ChevronLeft aria-hidden="true" /></Button>
          <h2 className="min-w-0 text-center text-sm font-bold capitalize text-white sm:min-w-40" aria-live="polite" data-testid="tasks-calendar-month">{value.toLocaleDateString(t.locale, { month: "long", year: "numeric" })}</h2>
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label={t("nextMonth")} data-testid="tasks-calendar-next"><ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" className="h-10" onClick={() => onChange(new Date())} data-testid="tasks-calendar-today">{t("bucketToday")}</Button>
          <button type="button" aria-pressed={undated} onClick={onUndated} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${undated ? "bg-indigo-500/20 text-indigo-200" : "text-white/50 hover:bg-white/5 hover:text-white"}`} data-testid="tasks-calendar-undated">
            {t("bucketNoDate")}<span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 tabular-nums">{withoutDate}</span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-white/[0.06] bg-black/10">
        {days.slice(0, 7).map((day) => <div key={day.getDay()} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/35 sm:text-xs">{day.toLocaleDateString(t.locale, { weekday: "short" })}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-white/[0.06]">
        {days.map((day) => {
          const key = calendarDayKey(day);
          const items = byDay.get(key) ?? [];
          const chosen = !undated && key === selected;
          const inMonth = day.getMonth() === value.getMonth();
          return (
            <button key={key} type="button" onClick={() => onChange(day)} aria-pressed={chosen} aria-current={key === today ? "date" : undefined} aria-label={`${day.toLocaleDateString(t.locale, { dateStyle: "full" })} · ${t("calendarTaskCount", { count: items.length })}`} className={`flex min-h-16 min-w-0 flex-col gap-1 p-1.5 text-left transition-colors sm:min-h-24 sm:p-2 ${chosen ? "bg-[#172340] ring-1 ring-inset ring-blue-400/50" : inMonth ? "bg-[#0c1019] hover:bg-[#141b29]" : "bg-[#090d15] text-white/25 hover:bg-[#101722]"}`} data-testid={`tasks-calendar-day-${key}`}>
              <span className="flex w-full items-center justify-between gap-1">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${key === today ? "bg-blue-500 text-white" : chosen ? "text-blue-200" : inMonth ? "text-white/75" : "text-white/25"}`}>{day.getDate()}</span>
                {items.length > 0 && <span className="text-[10px] tabular-nums text-white/40 sm:hidden">{items.length}</span>}
              </span>
              {items.slice(0, 2).map((task) => <span key={task.id} className={`hidden w-full truncate rounded-md border-l-2 px-1.5 py-1 text-[11px] sm:block ${task.status === "completed" || task.status === "cancelled" ? "border-white/25 bg-white/5 text-white/40 line-through" : task.priority === "urgent" ? "border-red-400 bg-red-400/10 text-red-200" : task.priority === "high" ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-blue-400 bg-blue-400/10 text-blue-100"}`}>{task.title}</span>)}
              {items.length > 2 && <span className="hidden px-1 text-[10px] text-white/40 sm:block">{t("calendarMore", { count: items.length - 2 })}</span>}
              {items.length > 0 && <span className="mx-auto h-1 w-1 rounded-full bg-blue-400 sm:hidden" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2 sm:px-4">
        <h3 className="text-sm font-semibold capitalize text-white/80">{undated ? t("bucketNoDate") : value.toLocaleDateString(t.locale, { weekday: "long", month: "short", day: "numeric" })}</h3>
        <Button variant="ghost" size="sm" className="h-10 text-blue-300" onClick={onCreate} data-testid="tasks-calendar-create"><Plus aria-hidden="true" />{t("newTask")}</Button>
      </div>
    </section>
  );
}
