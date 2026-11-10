import { apiRequest } from "@/lib/queryClient";

/** Local dates: UTC slicing would move evening tasks into the following day. */
export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseCalendarDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && calendarDayKey(date) === value ? date : null;
}

export function calendarMonthDays(value: Date): Date[] {
  const first = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  const count = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const length = Math.ceil((first.getDay() + count) / 7) * 7;
  return Array.from({ length }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + index, 12));
}

/** The calendar needs the complete filtered set, including undated tasks. */
export async function fetchCalendarTasks<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await (await apiRequest("GET", `${url}&limit=${limit}&offset=${offset}`, undefined, signal)).json() as T[];
    items.push(...page);
    if (page.length < limit) return items;
  }
}
