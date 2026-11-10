import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "../client/src/lib/queryClient";
import { calendarDayKey, calendarMonthDays, fetchCalendarTasks, parseCalendarDay } from "../client/src/pages/xpot/taskCalendar";

afterEach(() => vi.resetAllMocks());

describe("task calendar dates", () => {
  it("rejects impossible and malformed days instead of moving them into another month", () => {
    for (const value of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01", "2026-11-00", "bad", "2026-1-01"]) {
      expect(parseCalendarDay(value)).toBeNull();
    }
    expect(calendarDayKey(parseCalendarDay("2028-02-29")!)).toBe("2028-02-29");
  });

  it("uses the task's local day, including evening times", () => {
    expect(calendarDayKey(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-04");
  });

  it.each([[2026, 1, 28], [2028, 1, 35], [2026, 7, 42]])("fits the full month into complete weeks (%i, %i)", (year, month, length) => {
    const days = calendarMonthDays(new Date(year, month, 15));
    expect(days).toHaveLength(length);
    expect(days[0].getDay()).toBe(0);
    expect(days.at(-1)!.getDay()).toBe(6);
    expect(new Set(days.map(calendarDayKey)).size).toBe(length);
    expect(days.filter((day) => day.getMonth() === month)).toHaveLength(new Date(year, month + 1, 0).getDate());
  });

  it("includes adjacent dates across the year boundary", () => {
    const days = calendarMonthDays(new Date(2026, 0, 1));
    expect(calendarDayKey(days[0])).toBe("2025-12-28");
    expect(calendarDayKey(days.at(-1)!)).toBe("2026-01-31");
  });
});

describe("complete calendar loading", () => {
  it("loads past the first page while preserving filters and cancellation", async () => {
    const first = Array.from({ length: 500 }, (_, id) => ({ id }));
    const last = [{ id: 500 }];
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify(last)));
    const controller = new AbortController();
    const items = await fetchCalendarTasks("/api/xpot/tasks?status=pending&priority=high", controller.signal);
    expect(items).toHaveLength(501);
    expect(items.at(-1)).toEqual({ id: 500 });
    expect(apiRequest).toHaveBeenNthCalledWith(1, "GET", "/api/xpot/tasks?status=pending&priority=high&limit=500&offset=0", undefined, controller.signal);
    expect(apiRequest).toHaveBeenNthCalledWith(2, "GET", "/api/xpot/tasks?status=pending&priority=high&limit=500&offset=500", undefined, controller.signal);
  });

  it("reports a later page failure instead of displaying an incomplete calendar", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 500 }, (_, id) => ({ id })))))
      .mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(fetchCalendarTasks("/api/xpot/tasks?status=pending")).rejects.toThrow("Network unavailable");
  });
});
