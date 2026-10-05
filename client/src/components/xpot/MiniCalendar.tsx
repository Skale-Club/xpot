import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A month grid for picking a day. `counts` marks days that have something
 * (visits); days after `max` cannot be picked.
 */
export function MiniCalendar({
  value,
  onChange,
  counts,
  max,
  locale,
  labels,
}: {
  value: Date;
  onChange: (day: Date) => void;
  /** "YYYY-MM-DD" → number of items that day. */
  counts: Map<string, number>;
  max?: Date;
  locale: string;
  labels: { prev: string; next: string };
}) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  // Show the selected day's month when the selection moves from outside (the day arrows).
  const valueMonth = value.getFullYear() * 12 + value.getMonth();
  useEffect(() => {
    setMonth(new Date(Math.floor(valueMonth / 12), valueMonth % 12, 1));
  }, [valueMonth]);
  const today = new Date();

  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // Weeks start on Sunday, like the phone's date picker in en-US/pt-BR.
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        return day;
      }),
    );
  }, [month]);

  const weekdays = useMemo(
    () => weeks[0].map((d) => d.toLocaleDateString(locale, { weekday: "narrow" })),
    [weeks, locale],
  );

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const canGoNext = !max || new Date(month.getFullYear(), month.getMonth() + 1, 1) <= max;

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={labels.prev}
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-white">
          {month.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label={labels.next}
          disabled={!canGoNext}
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w, i) => (
          <div key={i} className="pb-1 text-[10px] font-semibold uppercase text-white/30">{w}</div>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const disabled = max ? day > max && !sameDay(day, max) : false;
          const selected = sameDay(day, value);
          const count = counts.get(key(day)) ?? 0;
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onChange(day)}
              aria-pressed={selected}
              aria-label={`${day.toLocaleDateString(locale, { dateStyle: "long" })}${count ? ` · ${count}` : ""}`}
              className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${
                selected
                  ? "bg-blue-500/30 font-bold text-white"
                  : inMonth
                    ? "text-white/75 hover:bg-white/[0.06]"
                    : "text-white/25 hover:bg-white/[0.04]"
              } ${sameDay(day, today) && !selected ? "ring-1 ring-inset ring-white/20" : ""}`}
            >
              {day.getDate()}
              {count > 0 && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-indigo-400"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
