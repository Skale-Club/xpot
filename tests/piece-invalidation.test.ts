import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidatePieceViews } from "../client/src/components/piece/PieceContext";

// A sale, a cancel or any piece write must refresh both piece screens: the reseller one
// (["tags", "piece", code]) and the admin page (["admin-tags", "piece", id]), plus the lists
// and dashboards that count the piece. TagSaleDialog relies on this after recording a sale.
describe("invalidatePieceViews", () => {
  it("invalidates the reseller screen, the admin page, the activity and the dashboards", () => {
    const qc = new QueryClient();
    const keys = [
      ["tags", "piece", "3KC26A11"],
      ["tags", "piece-activity", "id-1", "2026-10-18T00:00:00Z"],
      ["tags", "list", null, null],
      ["admin-tags", "piece", "id-1"],
      ["admin-tags", "overview"],
      ["/api/xpot/tags/dashboard"],
      ["/api/xpot/tags/by-lead"],
    ];
    for (const key of keys) qc.setQueryData(key, { ok: true });
    qc.setQueryData(["/api/xpot/leads"], []);

    invalidatePieceViews(qc);

    for (const key of keys) expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    expect(qc.getQueryState(["/api/xpot/leads"])?.isInvalidated).toBe(false);
  });
});
