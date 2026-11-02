// "My pieces": the filters behind "More filters" count from the URL and force the panel open while they narrow the list.

import { describe, expect, it } from "vitest";
import { countMorePieceFilters, MORE_PIECE_FILTERS, morePiecesOpen } from "../client/src/pages/tags/piecesFilters";

describe("countMorePieceFilters", () => {
  it("is zero for a clean URL and for the visible filters alone", () => {
    expect(countMorePieceFilters({})).toBe(0);
    expect(countMorePieceFilters({ status: "active", q: "abc", lead: "4", sale: "all", chip: "", scan: "all" })).toBe(0);
  });

  it("counts Paused, a status that waits behind them (the four chips in view are the ones that matter)", () => {
    expect(countMorePieceFilters({ status: "off" })).toBe(1);
    expect(countMorePieceFilters({ status: "finish" })).toBe(0);
  });

  it("counts a ?chip=missing link", () => {
    expect(countMorePieceFilters({ chip: "missing" })).toBe(1);
  });

  it("counts each hidden filter once", () => {
    expect(countMorePieceFilters({ sale: "sold", chip: "missing", company: "7", face: "google_review", scan: "with" })).toBe(5);
    expect(MORE_PIECE_FILTERS).toEqual(["sale", "chip", "company", "face", "scan"]);
  });
});

describe("morePiecesOpen", () => {
  it("stays closed until opened", () => {
    expect(morePiecesOpen(false, 0)).toBe(false);
    expect(morePiecesOpen(true, 0)).toBe(true);
  });

  it("is open whenever a hidden filter is active, even if closed by hand", () => {
    expect(morePiecesOpen(false, 1)).toBe(true);
  });
});
