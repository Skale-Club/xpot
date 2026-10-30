// Inventory's one "Where is it" filter: each option turns into the list endpoint's params (listQuerySchema), old
// ?status= / ?stock= URLs keep filtering, and a piece's table pill uses the same buckets as the filter and the chips.

import { describe, expect, it } from "vitest";
import { TAG_STATUSES, TAG_STOCK_STATUSES } from "../shared/tags";
import { matchesStockMetric, TAG_STOCK_METRIC_NAMES, type StockMetricPiece } from "../shared/tagMetrics";
import { isWhere, pieceWhere, WHERE_CHIPS, WHERE_OPTIONS, whereQuery, whereSelection } from "../client/src/pages/admin/tags/where-model";

const url = (where: string, status = "", stock = "") => ({ where, status, stock });
const piece = (p: Partial<StockMetricPiece>): StockMetricPiece => ({ repId: null, status: "inventory", stockStatus: "available", saleId: null, ...p });

describe("whereQuery", () => {
  it("turns each option into the params the list endpoint takes", () => {
    expect(Object.fromEntries(WHERE_OPTIONS.map((w) => [w, whereQuery(url(w))]))).toEqual({
      house: { metric: "house" },
      withResellers: { metric: "withResellers" },
      sold: { metric: "sold" },
      live: { metric: "live" },
      notReceived: { metric: "notReceived" },
      damaged: { metric: "damaged" },
      lost: { stockStatus: "lost" },
      disabled: { status: "disabled" },
      retired: { status: "retired" },
    });
  });

  it("only ever produces values the server's listQuerySchema (server/tags/routes.ts) accepts", () => {
    for (const w of WHERE_OPTIONS) {
      const { metric, status, stockStatus } = whereQuery(url(w));
      if (metric) expect(TAG_STOCK_METRIC_NAMES).toContain(metric);
      if (status) expect(TAG_STATUSES).toContain(status);
      if (stockStatus) expect(TAG_STOCK_STATUSES).toContain(stockStatus);
    }
  });

  it("filters nothing for an unknown option", () => {
    expect(whereQuery(url("nonsense"))).toEqual({});
  });

  it("keeps honouring the old ?stock= links as they filtered", () => {
    expect(whereQuery(url("", "", "house"))).toMatchObject({ metric: "house" });
    expect(whereQuery(url("", "", "reps"))).toMatchObject({ metric: "withResellers" });
    expect(whereQuery(url("", "", "sold"))).toMatchObject({ metric: "sold" });
    expect(whereQuery(url("", "", "pending"))).toMatchObject({ stockStatus: "pending" });
    expect(whereQuery(url("", "", "internal_use"))).toMatchObject({ stockStatus: "internal_use" });
  });

  it("keeps honouring the old ?status= links, alone or with ?stock=", () => {
    expect(whereQuery(url("", "active"))).toMatchObject({ status: "active" });
    expect(whereQuery(url("", "assigned"))).toMatchObject({ status: "assigned" });
    expect(whereQuery(url("", "active", "house"))).toMatchObject({ status: "active", metric: "house" });
    expect(whereQuery(url("", "bogus", "bogus"))).toEqual({ status: undefined, metric: undefined, stockStatus: undefined });
  });

  it("lets the new filter win over a stale legacy param", () => {
    expect(whereQuery(url("sold", "active", "house"))).toEqual({ metric: "sold" });
  });
});

describe("whereSelection", () => {
  it("shows the option for a new or an old link", () => {
    expect(whereSelection(url("house"))).toBe("house");
    expect(whereSelection(url("", "", "reps"))).toBe("withResellers");
    expect(whereSelection(url("", "", "pending"))).toBe("notReceived");
    expect(whereSelection(url("", "active"))).toBe("live");
    expect(whereSelection(url("", "disabled"))).toBe("disabled");
  });

  it("keeps an old value with no bucket visible instead of hiding the filter", () => {
    expect(whereSelection(url("", "assigned"))).toBe("status:assigned");
    expect(whereSelection(url("", "", "available"))).toBe("stock:available");
  });

  it("is empty with nothing set, an unknown value, or two legacy params at once", () => {
    expect(whereSelection(url(""))).toBe("");
    expect(whereSelection(url("nonsense"))).toBe("");
    expect(whereSelection(url("", "active", "house"))).toBe("");
  });

  it("knows its options", () => {
    expect(WHERE_OPTIONS.every(isWhere)).toBe(true);
    expect(isWhere("status:assigned")).toBe(false);
    expect(WHERE_CHIPS.every((c) => (WHERE_OPTIONS as readonly string[]).includes(c))).toBe(true);
  });
});

describe("pieceWhere", () => {
  it("says where a piece is, and whether it is live", () => {
    expect(pieceWhere(piece({}))).toEqual({ place: "house", live: false });
    expect(pieceWhere(piece({ status: "active" }))).toEqual({ place: "house", live: true });
    expect(pieceWhere(piece({ repId: 4 }))).toEqual({ place: "withResellers", live: false });
    expect(pieceWhere(piece({ repId: 4, status: "assigned" }))).toEqual({ place: "withResellers", live: false });
    expect(pieceWhere(piece({ stockStatus: "pending" }))).toEqual({ place: "notReceived", live: false });
    expect(pieceWhere(piece({ stockStatus: "sold", saleId: 9, status: "active" }))).toEqual({ place: "sold", live: true });
    expect(pieceWhere(piece({ saleId: 9, repId: 4 }))).toEqual({ place: "sold", live: false });
  });

  it("puts problems and ends of life before stock", () => {
    expect(pieceWhere(piece({ stockStatus: "damaged" })).place).toBe("damaged");
    expect(pieceWhere(piece({ stockStatus: "lost" })).place).toBe("lost");
    expect(pieceWhere(piece({ status: "disabled" }))).toEqual({ place: "disabled", live: false });
    expect(pieceWhere(piece({ status: "retired", repId: 2 })).place).toBe("retired");
    expect(pieceWhere(piece({ stockStatus: "reserved" })).place).toBe("reserved");
    expect(pieceWhere(piece({ stockStatus: "internal_use" })).place).toBe("internalUse");
  });

  it("agrees with the shared stock numbers the filter and chips use", () => {
    const pieces = [
      piece({}),
      piece({ status: "active" }),
      piece({ repId: 1 }),
      piece({ repId: 1, status: "active" }),
      piece({ stockStatus: "pending" }),
      piece({ stockStatus: "damaged" }),
      piece({ stockStatus: "sold", saleId: 3 }),
      piece({ saleId: 3, status: "active", repId: 1 }),
      piece({ status: "retired" }),
    ];
    for (const metric of ["house", "withResellers", "notReceived", "damaged"] as const) {
      for (const p of pieces.filter((x) => matchesStockMetric(x, metric))) expect(pieceWhere(p).place).toBe(metric);
    }
    for (const p of pieces.filter((x) => matchesStockMetric(x, "sold"))) expect(pieceWhere(p).place).toBe("sold");
    for (const p of pieces.filter((x) => matchesStockMetric(x, "live"))) expect(pieceWhere(p).live).toBe(true);
    for (const p of pieces.filter((x) => !matchesStockMetric(x, "live"))) expect(pieceWhere(p).live).toBe(false);
  });
});
