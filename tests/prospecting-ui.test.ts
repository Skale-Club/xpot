import { describe, expect, it } from "vitest";
import {
  exclusionCounts,
  moveIdByOffset,
  parseSectorSearches,
  persistentProspectingJob,
  prospectingProgress,
  reorderIdsAroundTarget,
  routeDisplayName,
  selectableCandidateIds,
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
    expect(prospectingProgress({
      jobStatus: "running",
      runs: [{ status: "completed", progress: 100, wave: 0 }, { status: "running", progress: 50, wave: 1 }],
      eligibleCount: 4,
      hasRoute: false,
    }).stage).toBe("filtering");
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "pending" }))
      .toEqual({ stage: "review", percent: 88 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "building" }))
      .toEqual({ stage: "review", percent: 94 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false, routePlanningStatus: "failed" }))
      .toEqual({ stage: "failed", percent: 100 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: true }))
      .toEqual({ stage: "route", percent: 100 });
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
