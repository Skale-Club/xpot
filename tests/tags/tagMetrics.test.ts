import { test } from "vitest";
import assert from "node:assert/strict";
import { countStockMetric, matchesStockMetric, TAG_STOCK_METRIC_NAMES, type StockMetricPiece, type TagStockMetric } from "../../shared/tagMetrics.js";

const piece = (over: Partial<StockMetricPiece>): StockMetricPiece => ({ repId: null, status: "inventory", stockStatus: "available", saleId: null, ...over });

// One piece in every state the stock screens tell apart, and the numbers each one belongs to.
const CASES: Array<[string, StockMetricPiece, TagStockMetric[]]> = [
  ["house, untouched", piece({}), ["house", "handOut"]],
  ["house, set up for a customer", piece({ status: "assigned" }), ["house"]],
  ["house, live without a sale", piece({ status: "active" }), ["house", "live"]],
  ["house, retired", piece({ status: "retired" }), []],
  ["code issued, not received", piece({ stockStatus: "pending" }), ["notReceived"]],
  ["damaged", piece({ stockStatus: "damaged" }), ["damaged"]],
  ["internal use", piece({ stockStatus: "internal_use" }), []],
  ["with a rep, untouched", piece({ repId: 7 }), ["withResellers", "returnable"]],
  ["with a rep, set up", piece({ repId: 7, status: "assigned" }), ["withResellers"]],
  ["with a rep, live, not sold", piece({ repId: 7, status: "active" }), ["withResellers", "live"]],
  ["sold and live", piece({ repId: 7, status: "active", stockStatus: "sold", saleId: 3 }), ["sold", "live"]],
  ["sold, not set up yet", piece({ repId: 7, stockStatus: "sold", saleId: 4 }), ["sold"]],
];

test("tag stock metrics: every piece state lands in exactly the numbers it should", () => {
  for (const [name, p, expected] of CASES) {
    const got = TAG_STOCK_METRIC_NAMES.filter((m) => matchesStockMetric(p, m));
    assert.deepEqual(got.sort(), [...expected].sort(), name);
  }
});

test("tag stock metrics: activation is never a sale; only a financial sale counts as sold", () => {
  assert.equal(matchesStockMetric(piece({ repId: 7, status: "active" }), "sold"), false);
  assert.equal(matchesStockMetric(piece({ repId: 7, status: "inventory", saleId: 9 }), "sold"), true);
  // A sold piece is no longer stock, wherever it sits.
  assert.equal(matchesStockMetric(piece({ saleId: 9 }), "house"), false);
});

test("tag stock metrics: counts and the kit's unsold vs returnable", () => {
  const pieces = CASES.map(([, p]) => p);
  assert.equal(countStockMetric(pieces, "house"), 3);
  assert.equal(countStockMetric(pieces, "withResellers"), 3);
  assert.equal(countStockMetric(pieces, "returnable"), 1);
  assert.equal(countStockMetric(pieces, "sold"), 2);
  assert.equal(countStockMetric(pieces, "live"), 3);
  // Returnable and hand-out are always a subset of the stock they come from.
  for (const p of pieces) {
    if (matchesStockMetric(p, "returnable")) assert.ok(matchesStockMetric(p, "withResellers"));
    if (matchesStockMetric(p, "handOut")) assert.ok(matchesStockMetric(p, "house"));
  }
});
