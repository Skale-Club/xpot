import { describe, expect, it } from "vitest";
import {
  TEAM_PERIODS,
  teamPeriodSince,
  teamVisitsFilterFromQuery,
  teamVisitsHref,
  visitCountsInTeamResults,
} from "../shared/teamActivity.js";

// The visits behind a Team results number are the visits the number counts: same period, same meaning of
// "finished" and "checked in away" (server/routes/xpot/teamActivity.ts counts them in SQL with the same lists).

const NOW = new Date(2026, 10, 2, 15, 0, 0);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const visits = [
  { id: 1, status: "completed", validationStatus: "inside_geofence", checkedInAt: daysAgo(1) },
  { id: 2, status: "sale_made", validationStatus: "outside_geofence", checkedInAt: daysAgo(3) },
  { id: 3, status: "in_progress", validationStatus: "manual_override", checkedInAt: daysAgo(10) },
  { id: 4, status: "no_answer", validationStatus: "gps_unavailable", checkedInAt: daysAgo(40) },
  { id: 5, status: "planned", validationStatus: "gps_unavailable", checkedInAt: null },
  { id: 6, status: "cancelled", validationStatus: "outside_geofence", checkedInAt: daysAgo(100) },
];
const ids = (period: (typeof TEAM_PERIODS)[number], show: "finished" | "away" | null) =>
  visits.filter((v) => visitCountsInTeamResults(v, { period, show }, NOW)).map((v) => v.id);

describe("visits behind a Team results number", () => {
  it("counts every visit checked in during the period", () => {
    expect(ids("7", null)).toEqual([1, 2]);
    expect(ids("30", null)).toEqual([1, 2, 3]);
    expect(ids("90", null)).toEqual([1, 2, 3, 4]);
  });

  it("never counts a visit that was not checked in", () => {
    expect(ids("90", null)).not.toContain(5);
  });

  it("counts finished visits by outcome, not only 'completed'", () => {
    expect(ids("30", "finished")).toEqual([1, 2]);
    expect(ids("90", "finished")).toEqual([1, 2, 4]);
  });

  it("counts checked in away: outside the area or let through with a reason", () => {
    expect(ids("30", "away")).toEqual([2, 3]);
    expect(ids("90", "away")).toEqual([2, 3]);
  });

  it("starts today at the viewer's midnight", () => {
    const morning = { status: "completed", validationStatus: "inside_geofence", checkedInAt: new Date(2026, 10, 2, 8, 0, 0) };
    const lastNight = { ...morning, checkedInAt: new Date(2026, 10, 1, 23, 0, 0) };
    expect(visitCountsInTeamResults(morning, { period: "today", show: null }, NOW)).toBe(true);
    expect(visitCountsInTeamResults(lastNight, { period: "today", show: null }, NOW)).toBe(false);
    expect(teamPeriodSince("today", NOW).getHours()).toBe(0);
  });

  it("reads the filter from the address, and ignores what it does not know", () => {
    expect(teamVisitsFilterFromQuery({ period: "30", show: "finished" })).toEqual({ period: "30", show: "finished" });
    expect(teamVisitsFilterFromQuery({ period: "today", show: "away" })).toEqual({ period: "today", show: "away" });
    expect(teamVisitsFilterFromQuery({ period: "7" })).toEqual({ period: "7", show: null });
    expect(teamVisitsFilterFromQuery({ period: "7", show: "bogus" })).toEqual({ period: "7", show: null });
    expect(teamVisitsFilterFromQuery({ period: "5", show: "finished" })).toBeNull();
    expect(teamVisitsFilterFromQuery({ show: "finished" })).toBeNull();
  });

  it("builds addresses that read back to the same filter", () => {
    for (const period of TEAM_PERIODS) {
      for (const show of [undefined, "finished", "away"] as const) {
        const href = teamVisitsHref("/admin/work/dashboard/history", period, show);
        const params = new URL(href, "http://x.test").searchParams;
        expect(teamVisitsFilterFromQuery({ period: params.get("period"), show: params.get("show") })).toEqual({ period, show: show ?? null });
      }
    }
  });
});
