import { test } from "vitest";
import assert from "node:assert/strict";
import { countStockMetric, matchesStockMetric, TAG_STOCK_METRIC_NAMES, type StockMetricPiece, type TagStockMetric } from "../../shared/tagMetrics.js";

const piece = (over: Partial<StockMetricPiece>): StockMetricPiece => ({ repId: null, status: "inventory", stockStatus: "available", saleId: null, leadId: null, ...over });

// One piece in every state the stock screens tell apart, and the numbers each one belongs to.
const CASES: Array<[string, StockMetricPiece, TagStockMetric[]]> = [
  ["house, untouched", piece({}), ["house", "handOut"]],
  ["house, set up but no customer yet", piece({ status: "assigned" }), ["house"]],
  ["house, with a customer", piece({ status: "assigned", leadId: 12 }), ["withCustomer"]],
  ["house, live without a customer", piece({ status: "active" }), ["house", "live"]],
  ["house, live at a customer", piece({ status: "active", leadId: 12 }), ["withCustomer", "live"]],
  ["house, with a customer, retired", piece({ status: "retired", leadId: 12 }), []],
  ["house, with a customer, damaged", piece({ stockStatus: "damaged", leadId: 12 }), ["damaged"]],
  ["with a rep, at a customer", piece({ repId: 7, status: "assigned", leadId: 12 }), ["withResellers"]],
  ["house, retired", piece({ status: "retired" }), []],
  ["code issued, not received", piece({ stockStatus: "pending" }), ["notReceived"]],
  ["damaged", piece({ stockStatus: "damaged" }), ["damaged"]],
  ["internal use", piece({ stockStatus: "internal_use" }), []],
  ["with a rep, untouched", piece({ repId: 7 }), ["withResellers", "returnable"]],
  ["with a rep, set up", piece({ repId: 7, status: "assigned" }), ["withResellers"]],
  ["with a rep, live, not sold", piece({ repId: 7, status: "active" }), ["withResellers", "live"]],
  ["sold and live", piece({ repId: 7, status: "active", stockStatus: "sold", saleId: 3, leadId: 12 }), ["sold", "live"]],
  ["sold from the house, with its customer", piece({ stockStatus: "sold", saleId: 5, leadId: 12 }), ["sold"]],
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
  assert.equal(matchesStockMetric(piece({ saleId: 9, leadId: 3 }), "withCustomer"), false);
});

test("tag stock metrics: counts and the kit's unsold vs returnable", () => {
  const pieces = CASES.map(([, p]) => p);
  assert.equal(countStockMetric(pieces, "house"), 3);
  assert.equal(countStockMetric(pieces, "withCustomer"), 2);
  assert.equal(countStockMetric(pieces, "withResellers"), 4);
  assert.equal(countStockMetric(pieces, "returnable"), 1);
  assert.equal(countStockMetric(pieces, "sold"), 3);
  assert.equal(countStockMetric(pieces, "live"), 4);
  // Returnable and hand-out are always a subset of the stock they come from.
  for (const p of pieces) {
    if (matchesStockMetric(p, "returnable")) assert.ok(matchesStockMetric(p, "withResellers"));
    if (matchesStockMetric(p, "handOut")) assert.ok(matchesStockMetric(p, "house"));
  }
});

test("tag stock metrics: a piece with a customer leaves company stock, and house plus with-a-customer is what house used to be", () => {
  const pieces = CASES.map(([, p]) => p);
  for (const p of pieces) {
    // Never in both, and the pair is the old house rule (no rep, in stock, not retired, unsold) whatever the customer.
    assert.equal(matchesStockMetric(p, "house") && matchesStockMetric(p, "withCustomer"), false);
    const oldHouse = p.repId === null && p.stockStatus === "available" && p.status !== "retired" && p.saleId === null;
    assert.equal(matchesStockMetric(p, "house") || matchesStockMetric(p, "withCustomer"), oldHouse);
  }
  assert.equal(matchesStockMetric(piece({ status: "assigned", leadId: 1 }), "house"), false);
  assert.equal(matchesStockMetric(piece({ status: "assigned" }), "house"), true);
});
