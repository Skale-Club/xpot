import { describe, expect, it } from "vitest";
import { openWindowsOn, parseHoursRange, secondsUntilDayEnd } from "../server/prospecting/opening-hours.js";
import { optimizeRouteHeuristic } from "../server/prospecting/route-optimizer.js";
import { buildGoogleOptimizeToursRequest } from "../server/prospecting/google-route-optimizer.js";
import { minutesUntilProspectingDayEnd } from "../shared/prospecting.js";

const timeZone = "America/New_York";
// Tuesday 2026-10-13, 2 PM in Boston (EDT, UTC-4).
const tuesdayAfternoon = new Date("2026-10-13T18:00:00.000Z");
const hours = (week: Record<string, string[]>) => ({ openHours: JSON.stringify(week), timeZone });

describe("opening hours", () => {
  it("reads the engine's ranges, sharing the close's AM/PM when the open has none", () => {
    expect(parseHoursRange("9 AM–7 PM")).toEqual([[9 * 60, 19 * 60]]);
    expect(parseHoursRange("1–8 PM")).toEqual([[13 * 60, 20 * 60]]);
    expect(parseHoursRange("11–2 PM")).toEqual([[11 * 60, 14 * 60]]);
    expect(parseHoursRange("8:30 AM–5:30 PM")).toEqual([[8 * 60 + 30, 17 * 60 + 30]]);
    expect(parseHoursRange("5 PM–2 AM")).toEqual([[17 * 60, 26 * 60]]);
    expect(parseHoursRange("Closed")).toEqual([]);
    expect(parseHoursRange("Open 24 hours")).toEqual([[0, 24 * 60]]);
    expect(parseHoursRange("Hours might differ")).toBeUndefined();
  });

  it("turns the route day's hours into instants in the business's timezone", () => {
    const windows = openWindowsOn(hours({ Tuesday: ["9 AM–7 PM"] }), tuesdayAfternoon);
    expect(windows).toEqual([{ start: new Date("2026-10-13T13:00:00.000Z"), end: new Date("2026-10-13T23:00:00.000Z") }]);
  });

  it("keeps a previous evening that runs past midnight", () => {
    const windows = openWindowsOn(hours({ Monday: ["6 PM–1 AM"], Tuesday: ["6 PM–1 AM"] }), tuesdayAfternoon);
    expect(windows?.map((window) => window.end.toISOString())).toEqual(["2026-10-13T05:00:00.000Z", "2026-10-14T05:00:00.000Z"]);
  });

  it("knows a closed day, and treats missing or unreadable hours as unknown", () => {
    expect(openWindowsOn(hours({ Tuesday: ["Closed"] }), tuesdayAfternoon)).toEqual([]);
    expect(openWindowsOn(hours({ Monday: ["9 AM–5 PM"] }), tuesdayAfternoon)).toBeNull();
    expect(openWindowsOn({ openHours: "not json", timeZone }, tuesdayAfternoon)).toBeNull();
    expect(openWindowsOn({ openHours: JSON.stringify({ Tuesday: ["9 AM–5 PM"] }), timeZone: null }, tuesdayAfternoon)).toBeNull();
  });

  it("ends same-day routes at 10 PM", () => {
    expect(secondsUntilDayEnd(timeZone, tuesdayAfternoon)).toBe(8 * 3600);
    expect(secondsUntilDayEnd(timeZone, new Date("2026-10-14T03:00:00.000Z"))).toBe(0);
    expect(secondsUntilDayEnd(undefined, tuesdayAfternoon)).toBeNull();
    const sixPm = new Date(2026, 9, 13, 18, 0);
    expect(minutesUntilProspectingDayEnd(sixPm)).toBe(4 * 60);
  });
});

describe("routes respect opening hours", () => {
  const plannedStartAt = tuesdayAfternoon;
  const candidate = (id: number, lng: number, week?: Record<string, string[]>) => ({
    id,
    leadId: id,
    name: `Business ${id}`,
    address: `${id} Main St`,
    lat: 42.35,
    lng,
    score: 70,
    scoreReasons: ["test"],
    serviceDurationSeconds: 20 * 60,
    openWindows: week ? openWindowsOn(hours(week), plannedStartAt) : null,
  });

  it("leaves out a business that is closed or closes before a visit fits", () => {
    const result = optimizeRouteHeuristic({
      plannedStartAt,
      shiftDurationSeconds: 4 * 3600,
      maxStops: 5,
      candidates: [
        candidate(1, -71.55, { Tuesday: ["9 AM–7 PM"] }),
        candidate(2, -71.551, { Tuesday: ["Closed"] }),
        candidate(3, -71.552, { Tuesday: ["9 AM–2:10 PM"] }),
        candidate(4, -71.553),
      ],
    });
    expect(result.stops.map((stop) => stop.id).sort()).toEqual([1, 4]);
    expect(result.excludedCandidateIds.sort()).toEqual([2, 3]);
  });

  it("does not schedule a visit after closing time", () => {
    const result = optimizeRouteHeuristic({
      plannedStartAt,
      shiftDurationSeconds: 8 * 3600,
      maxStops: 20,
      candidates: Array.from({ length: 12 }, (_, index) => candidate(index + 1, -71.55 - index * 0.001, { Tuesday: ["9 AM–4 PM"] })),
    });
    const closesAt = new Date("2026-10-13T20:00:00.000Z").getTime();
    expect(result.stops.length).toBeGreaterThan(0);
    for (const stop of result.stops) {
      expect(stop.estimatedArrivalAt.getTime() + stop.serviceDurationSeconds * 1000).toBeLessThanOrEqual(closesAt);
    }
  });

  it("waits for the first business to open instead of dropping it", () => {
    const result = optimizeRouteHeuristic({
      plannedStartAt,
      shiftDurationSeconds: 6 * 3600,
      maxStops: 5,
      candidates: [candidate(1, -71.55, { Tuesday: ["5–9 PM"] })],
    });
    expect(result.stops[0]?.estimatedArrivalAt.toISOString()).toBe("2026-10-13T21:00:00.000Z");
  });

  it("asks Google to start each visit early enough to end before closing", () => {
    const request = buildGoogleOptimizeToursRequest({
      plannedStartAt,
      shiftDurationSeconds: 4 * 3600,
      maxStops: 5,
      candidates: [candidate(1, -71.55, { Tuesday: ["9 AM–5 PM"] }), candidate(2, -71.56)],
    });
    expect(request.model.shipments[0].deliveries[0].timeWindows).toEqual([
      { startTime: "2026-10-13T18:00:00Z", endTime: "2026-10-13T20:40:00Z" },
    ]);
    expect(request.model.shipments[1].deliveries[0]).not.toHaveProperty("timeWindows");
  });
});
