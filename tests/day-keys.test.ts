import { beforeAll, describe, expect, it } from "vitest";
import { calendarDayKeys, localDayKey, windowStart } from "../shared/dayKeys";

// The night US clocks went back (2026-11-01) is the day the chart showed "Nov 1" twice.
beforeAll(() => {
  process.env.TZ = "America/New_York";
});

describe("calendarDayKeys", () => {
  it("never repeats or skips a date across the end of daylight saving time", () => {
    const from = windowStart(new Date(2026, 10, 2, 9, 30), 30);
    const keys = calendarDayKeys(from, 30);
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(30);
    expect(keys[0]).toBe("2026-10-04");
    expect(keys.slice(-4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("never repeats or skips a date across the start of daylight saving time", () => {
    const keys = calendarDayKeys(windowStart(new Date(2026, 2, 10, 12), 10), 10);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  });

  it("counts a window of one day as today", () => {
    const now = new Date(2026, 10, 1, 23, 59);
    expect(calendarDayKeys(windowStart(now, 1), 1)).toEqual(["2026-11-01"]);
  });

  it("steps by 24 hours only wrongly: the old way repeated the day", () => {
    const from = new Date(2026, 10, 1, 0, 0, 0);
    const old = [0, 1].map((i) => localDayKey(new Date(from.getTime() + (i + 1) * 24 * 60 * 60 * 1000)));
    // 00:00 on Nov 1 + 24 h is 23:00 on Nov 1 again.
    expect(old[0]).toBe("2026-11-01");
    expect(calendarDayKeys(from, 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});
