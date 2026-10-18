import { describe, expect, it } from "vitest";
import {
  exclusionCounts,
  moveIdByOffset,
  parseSectorSearches,
  persistentProspectingJob,
  prospectingProgress,
  reorderIdsAroundTarget,
  routeDisplayName,
  routeStopProgress,
  stopMarkerTone,
  STOP_MARKER_TONES,
  ROUTE_STATUS_ICON,
  ROUTE_STATUS_TONE,
  STOP_STATUS_TONE,
  routeStatusLabel,
  routeStatusTone,
  routeStatusIcon,
  stopStatusLabelKey,
  stopStatusTone,
  isStopOpen,
  eligibleCandidates,
  routeFill,
  samePlace,
  todayRouteOf,
  selectableCandidateIds,
  activeRunTiming,
  estimatedRunPercent,
  foundRunPercent,
  searchPhase,
  serverNowMs,
  wholeMinutes,
} from "../client/src/pages/xpot/prospectingUi.js";
import { trimRoutePathToStops } from "../client/src/pages/xpot/components/RoutePreviewMap.js";

describe("prospecting UI helpers", () => {
  it("crops an old route polyline to the first and last business", () => {
    const path = [
      { lat: 42.3, lng: -71.5 },
      { lat: 41.2, lng: -72.1 },
      { lat: 40.75, lng: -73.99 },
      { lat: 40.74, lng: -73.98 },
    ];
    const stops = [path[2], path[3]];
    expect(trimRoutePathToStops(path, stops)).toEqual(stops);
  });
  it("normalizes, deduplicates and reports sector overflow instead of silently hiding it", () => {
    const parsed = parseSectorSearches("Hair salon, hair-salon; Barber shop\nSpa, Bakery, Café, Florist");
    expect(parsed.searches.map((search) => search.niche)).toEqual([
      "hair_salon",
      "barber_shop",
      "spa",
      "bakery",
      "cafe",
    ]);
    expect(parsed.duplicateCount).toBe(1);
    expect(parsed.overflow).toBe(1);
  });

  it("uses coarse, bounded stages instead of presenting false precision", () => {
    expect(prospectingProgress({ jobStatus: "queued", runs: [], eligibleCount: 0, hasRoute: false }))
      .toEqual({ stage: "queued", percent: 8 });
    // An expansion wave still running keeps the bar in the search, climbing.
    expect(prospectingProgress({
      jobStatus: "running",
      runs: [{ status: "completed", progress: 100, wave: 0 }, { status: "running", progress: 50, wave: 1 }],
      eligibleCount: 4,
      hasRoute: false,
    })).toEqual({ stage: "searching", percent: 64 });
    expect(prospectingProgress({
      jobStatus: "running",
      runs: [{ status: "completed", progress: 100, wave: 0 }],
      eligibleCount: 4,
      hasRoute: false,
    })).toEqual({ stage: "filtering", percent: 83 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "pending" }))
      .toEqual({ stage: "review", percent: 88 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "building" }))
      .toEqual({ stage: "review", percent: 94 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "failed" }))
      .toEqual({ stage: "failed", percent: 100 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: true }))
      .toEqual({ stage: "route", percent: 100 });
  });

  it("moves a running search by its elapsed time against the usual duration", () => {
    const min = 60_000;
    expect(estimatedRunPercent(0, 6 * min)).toBe(0);
    expect(estimatedRunPercent(3 * min, 6 * min)).toBe(60);
    expect(estimatedRunPercent(6 * min, 6 * min)).toBe(82);
    expect(estimatedRunPercent(60 * min, 6 * min)).toBe(95);
    const startedAt = "2026-10-17T13:55:56.000Z";
    const nowMs = Date.parse(startedAt) + 3 * min;
    const runs = [{ status: "running", progress: 50, wave: 0, startedAt }];
    // The engine's flat "50" no longer decides it: 3 of 6 minutes is 8 + 60 * 0.75.
    expect(prospectingProgress({ jobStatus: "running", runs, eligibleCount: 0, hasRoute: false, typicalRunMs: 6 * min, nowMs }))
      .toEqual({ stage: "searching", percent: 53 });
    expect(prospectingProgress({ jobStatus: "running", runs, eligibleCount: 0, hasRoute: false, typicalRunMs: 6 * min, nowMs: nowMs + 2 * min }).percent)
      .toBeGreaterThan(53);
    // Without history it keeps the engine's coarse value...
    expect(prospectingProgress({ jobStatus: "running", runs, eligibleCount: 0, hasRoute: false, typicalRunMs: null, nowMs }).percent).toBe(46);
    // ...unless the engine has already found businesses: 27 of 30 is 81%.
    const found = [{ ...runs[0], resultCount: 27, requestedMaxResults: 30 }];
    expect(foundRunPercent(found[0])).toBe(81);
    expect(prospectingProgress({ jobStatus: "running", runs: found, eligibleCount: 0, hasRoute: false, typicalRunMs: null, nowMs }).percent).toBe(69);
    expect(activeRunTiming(runs, 6 * min, nowMs)).toEqual({ elapsedMs: 3 * min, typicalMs: 6 * min, found: 0, target: null });
    expect(wholeMinutes(10_000)).toBe(1);
    expect(wholeMinutes(5.2 * min)).toBe(5);
  });

  it("names the step a running search is on", () => {
    const min = 60_000;
    expect(searchPhase({ elapsedMs: 10_000, typicalMs: 6 * min, found: 0, target: 30 })).toBe("opening");
    expect(searchPhase({ elapsedMs: min, typicalMs: 6 * min, found: 0, target: 30 })).toBe("scrolling");
    expect(searchPhase({ elapsedMs: 2 * min, typicalMs: 6 * min, found: 12, target: 30 })).toBe("collecting");
    expect(searchPhase({ elapsedMs: 3 * min, typicalMs: 6 * min, found: 30, target: 30 })).toBe("contacts");
    expect(searchPhase({ elapsedMs: 5 * min, typicalMs: 6 * min, found: 20, target: 30 })).toBe("contacts");
  });

  it("measures elapsed time on the server's clock", () => {
    const timing = { typicalRunMs: 1, serverNow: "2026-10-17T14:00:00.000Z" };
    // Fetched at local 1000, now local 6000: five seconds after the server's answer.
    expect(serverNowMs(timing, 1000, 6000)).toBe(Date.parse(timing.serverNow) + 5000);
    expect(serverNowMs(undefined, 1000, 6000)).toBe(6000);
  });

  it("keeps active and recent unrouted searches resumable from the shell", () => {
    const now = new Date("2026-10-14T16:00:00Z");
    const jobs = [
      { id: 4, status: "completed", createdAt: "2026-10-14T15:00:00Z" },
      { id: 3, status: "running", createdAt: "2026-10-14T14:00:00Z" },
      { id: 2, status: "completed", createdAt: "2026-10-12T14:00:00Z" },
    ];
    expect(persistentProspectingJob(jobs, [], now)?.job.id).toBe(3);
    expect(persistentProspectingJob(jobs, [{ id: 9, jobId: 4, status: "published" }], now)?.job.id).toBe(3);
    expect(persistentProspectingJob(jobs.filter((job) => job.id !== 3), [{ id: 9, jobId: 4, status: "published" }], now))
      .toMatchObject({ job: { id: 4 }, route: { id: 9 } });
    expect(persistentProspectingJob([
      { id: 5, status: "completed", routePlanningStatus: "ready", createdAt: "2026-10-14T15:30:00Z" },
    ], [], now)).toBeNull();
  });

  it("summarizes exclusions and caps the explicit route selection", () => {
    expect(exclusionCounts([
      { status: "discarded", exclusionReason: "existing_customer" },
      { status: "discarded", exclusionReason: "existing_customer" },
      { status: "discarded", exclusionReason: "previously_visited" },
      { status: "discovered", exclusionReason: null },
    ])).toEqual({ existing_customer: 2, previously_visited: 1 });
    const candidates = Array.from({ length: 80 }, (_, index) => ({ id: index + 1, status: "discovered" }));
    expect(selectableCandidateIds(candidates)).toHaveLength(60);
  });

  it("replaces internal generated route names with the human date", () => {
    const referenceDate = new Date("2026-10-13T12:00:00");
    expect(routeDisplayName({ name: "Prospecting — 2026-10-12", routeDate: "2026-10-12" }, "en-US", referenceDate))
      .toBe("Monday, October 12");
    expect(routeDisplayName({ name: "Route — 2026-10-12", routeDate: "2026-10-12" }, "en-US", referenceDate))
      .toBe("Monday, October 12");
    expect(routeDisplayName({ name: "Downtown salons", routeDate: "2026-10-12" }, "en-US", referenceDate))
      .toBe("Downtown salons");
  });

  it("reorders stops before or after the hovered card without index drift", () => {
    const stops = [1, 2, 3, 4, 5];
    expect(reorderIdsAroundTarget(stops, 2, 4, "before")).toEqual([1, 3, 2, 4, 5]);
    expect(reorderIdsAroundTarget(stops, 2, 4, "after")).toEqual([1, 3, 4, 2, 5]);
    expect(reorderIdsAroundTarget(stops, 4, 2, "before")).toEqual([1, 4, 2, 3, 5]);
    expect(reorderIdsAroundTarget(stops, 4, 2, "after")).toEqual([1, 2, 4, 3, 5]);
  });

  it("moves a focused stop with arrow-key offsets and respects the list edges", () => {
    const stops = [1, 2, 3];
    expect(moveIdByOffset(stops, 2, -1)).toEqual([2, 1, 3]);
    expect(moveIdByOffset(stops, 2, 1)).toEqual([1, 3, 2]);
    expect(moveIdByOffset(stops, 1, -1)).toBe(stops);
    expect(moveIdByOffset(stops, 3, 1)).toBe(stops);
  });
});

describe("todayRouteOf", () => {
  const routes = [
    { id: 1, routeDate: "2026-10-18", status: "completed" },
    { id: 2, routeDate: "2026-10-18", status: "cancelled" },
    { id: 3, routeDate: "2026-10-18", status: "published" },
    { id: 4, routeDate: "2026-10-17", status: "in_progress" },
  ];

  it("picks the open route of the day, like the Route screen", () => {
    expect(todayRouteOf(routes, "2026-10-18")?.id).toBe(3);
    expect(todayRouteOf(routes, "2026-10-19")).toBeUndefined();
  });

  it("falls back to a route completed that day only when asked", () => {
    const finished = routes.filter((route) => route.id !== 3);
    expect(todayRouteOf(finished, "2026-10-18")).toBeUndefined();
    expect(todayRouteOf(finished, "2026-10-18", { includeCompleted: true })?.id).toBe(1);
  });
});

describe("routeStopProgress", () => {
  it("counts completed and skipped stops as done", () => {
    expect(routeStopProgress([
      { status: "completed" }, { status: "skipped" }, { status: "planned" }, { status: "checked_in" },
    ])).toEqual({ done: 2, total: 4, percent: 50 });
    expect(routeStopProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("stopMarkerTone", () => {
  it("mutes done and skipped stops with a glyph so they never look like future ones", () => {
    const done = stopMarkerTone({ id: 1, status: "completed" }, 2, 3);
    const skipped = stopMarkerTone({ id: 4, status: "skipped" }, 2, 3);
    const future = stopMarkerTone({ id: 5, status: "planned" }, 2, 3);
    expect(done.glyph).toBe("✓");
    expect(skipped.glyph).toBe("↷");
    expect(future.glyph).toBeNull();
    expect(done.background).not.toBe(future.background);
    expect(skipped.text).not.toBe(future.text);
  });

  it("marks the next stop in blue, not the Tags violet", () => {
    const next = stopMarkerTone({ id: 3, status: "planned" }, 2, 3);
    const current = stopMarkerTone({ id: 2, status: "en_route" }, 2, 3);
    expect(current.background).toBe("#3b82f6");
    expect(next.border).toBe("#60a5fa");
    expect(next.border).not.toBe("#a78bfa");
  });

  it("draws the map legend from the same colours", () => {
    expect(stopMarkerTone({ id: 1, status: "completed" }, null, null)).toBe(STOP_MARKER_TONES.done);
    expect(stopMarkerTone({ id: 9, status: "planned" }, 2, 3)).toBe(STOP_MARKER_TONES.planned);
  });
});

describe("route status", () => {
  const t = (key: string) => `<${key}>`;

  it("has one label per status; a past draft was never started", () => {
    expect(routeStatusLabel("draft", t)).toBe("<routeDraft>");
    expect(routeStatusLabel("draft", t, true)).toBe("<routeNotStarted>");
    expect(routeStatusLabel("published", t)).toBe("<published>");
    expect(routeStatusLabel("in_progress", t)).toBe("<routeInProgress>");
    expect(routeStatusLabel("completed", t)).toBe("<routeCompleted>");
    expect(routeStatusLabel("cancelled", t)).toBe("<routeCancelled>");
  });

  it("is green only when completed and checks only a completed route", () => {
    expect(routeStatusTone("completed")).toBe("green");
    expect(routeStatusTone("draft")).toBe("slate");
    expect(routeStatusTone("cancelled")).toBe("slate");
    expect(routeStatusTone("in_progress")).toBe("blue");
    expect(ROUTE_STATUS_TONE.published).toBe("blue");
    const icons = Object.entries(ROUTE_STATUS_ICON).filter(([, icon]) => icon === ROUTE_STATUS_ICON.completed).map(([status]) => status);
    expect(icons).toEqual(["completed"]);
    expect(routeStatusIcon("unknown")).toBe(ROUTE_STATUS_ICON.draft);
  });

  it("names and colours stops from one map", () => {
    expect(stopStatusLabelKey("checked_in")).toBe("stopCheckedIn");
    expect(stopStatusLabelKey("whatever")).toBe("stopPlanned");
    expect(stopStatusTone("completed")).toBe(STOP_STATUS_TONE.completed);
    expect(stopStatusTone("skipped")).toBe("muted");
    expect(isStopOpen("planned")).toBe(true);
    expect(isStopOpen("en_route")).toBe(true);
    expect(isStopOpen("checked_in")).toBe(false);
  });
});

describe("search results", () => {
  it("counts the places a route can use, the same ones it sends", () => {
    const candidates = [
      { id: 1, status: "eligible" },
      { id: 2, status: "discarded" },
      { id: 3, status: "visited" },
      { id: 4, status: "selected" },
    ];
    expect(eligibleCandidates(candidates).map((candidate) => candidate.id)).toEqual(selectableCandidateIds(candidates));
  });

  it("tells a short route from a full one", () => {
    expect(routeFill(0, 20)).toBe("none");
    expect(routeFill(8, 20)).toBe("short");
    expect(routeFill(20, 20)).toBe("full");
    expect(routeFill(5, 0)).toBe("full");
  });

  it("treats points ~50 m apart as one place", () => {
    expect(samePlace({ lat: 42.3, lng: -71.5 }, { lat: 42.3001, lng: -71.5001 })).toBe(true);
    expect(samePlace({ lat: 42.3, lng: -71.5 }, { lat: 42.31, lng: -71.5 })).toBe(false);
  });
});
