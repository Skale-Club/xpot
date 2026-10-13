import { describe, expect, it } from "vitest";
import {
  exclusionCounts,
  parseSectorSearches,
  prospectingProgress,
  selectableCandidateIds,
} from "../client/src/pages/xpot/prospectingUi.js";

describe("prospecting UI helpers", () => {
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
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: false }))
      .toEqual({ stage: "review", percent: 82 });
    expect(prospectingProgress({ jobStatus: "completed", runs: [], eligibleCount: 8, hasRoute: true }))
      .toEqual({ stage: "route", percent: 100 });
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
});
