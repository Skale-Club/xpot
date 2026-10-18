import { describe, expect, it } from "vitest";
import { FILTER_CHIP_ON } from "../client/src/components/xpot/filters";

// The quick filter chips take the module accent like Tabs and Segmented: indigo by default
// (unchanged for Visits and the account pages), violet on the Tags screens (accent="tags").
describe("FilterChips accent", () => {
  it("keeps the indigo chip by default and draws Tags in violet", () => {
    expect(FILTER_CHIP_ON.visits.chip).toContain("indigo");
    expect(FILTER_CHIP_ON.account.chip).toBe(FILTER_CHIP_ON.visits.chip);
    expect(FILTER_CHIP_ON.tags.chip).toContain("violet");
    expect(FILTER_CHIP_ON.tags.count).toContain("violet");
    expect(FILTER_CHIP_ON.tags.chip).not.toContain("indigo");
  });
});
