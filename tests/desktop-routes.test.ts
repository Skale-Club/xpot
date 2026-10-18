// The desktop panes are driven by the URL, so the parsing is pinned here: a
// wrong tab or id opens the wrong pane (or none) from a shared link.

import { describe, expect, it } from "vitest";
import { parseSalesPath, salesPath } from "../client/src/pages/xpot/salesPath";

describe("parseSalesPath", () => {
  it("defaults to the overview", () => {
    expect(parseSalesPath("/sales")).toEqual({ tab: "overview", id: null });
    expect(parseSalesPath("/sales/unknown")).toEqual({ tab: "overview", id: null });
  });

  it("maps stock to the consignments tab", () => {
    expect(parseSalesPath("/sales/stock")).toEqual({ tab: "consignments", id: null });
    expect(parseSalesPath("/sales/stock/12")).toEqual({ tab: "consignments", id: 12 });
  });

  it("reads the open sale and ignores bad ids and query strings", () => {
    expect(parseSalesPath("/sales/sales/28")).toEqual({ tab: "sales", id: 28 });
    expect(parseSalesPath("/sales/sales/abc")).toEqual({ tab: "sales", id: null });
    expect(parseSalesPath("/sales/sales/-3")).toEqual({ tab: "sales", id: null });
    expect(parseSalesPath("/sales/pipeline?x=1")).toEqual({ tab: "pipeline", id: null });
  });

  it("round-trips with salesPath", () => {
    for (const tab of ["overview", "sales", "consignments", "pipeline"] as const) {
      expect(parseSalesPath(salesPath(tab)).tab).toBe(tab);
      if (tab !== "overview") expect(parseSalesPath(salesPath(tab, 7))).toEqual({ tab, id: 7 });
    }
    expect(salesPath("overview")).toBe("/sales");
  });
});
