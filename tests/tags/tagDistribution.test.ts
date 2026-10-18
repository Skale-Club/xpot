import { test } from "vitest";
import assert from "node:assert/strict";
import {
  checkCodes,
  handOutBlocker,
  receiveBlockers,
  sellBlockers,
  takeBackBlocker,
  type DistributionPiece,
} from "../../shared/tagDistribution.js";
import { countStockMetric } from "../../shared/tagMetrics.js";
import { kitCode, kitCostRequired, parseKitUnitCost } from "../../shared/tagKits.js";
import { isTagPieceQueue } from "../../shared/tagQueues.js";

const piece = (patch: Partial<DistributionPiece> = {}): DistributionPiece => ({
  status: "inventory", stockStatus: "available", repId: null, sold: false, ...patch,
});

test("hand out: only unsold, received, unset house pieces; the first reason wins", () => {
  assert.equal(handOutBlocker(piece()), null);
  assert.equal(handOutBlocker(piece({ sold: true, repId: 4 })), "sold");
  assert.equal(handOutBlocker(piece({ repId: 4 })), "with_reseller");
  assert.equal(handOutBlocker(piece({ stockStatus: "pending" })), "not_received");
  assert.equal(handOutBlocker(piece({ stockStatus: "damaged" })), "damaged");
  assert.equal(handOutBlocker(piece({ stockStatus: "lost" })), "not_in_stock");
  assert.equal(handOutBlocker(piece({ stockStatus: "internal_use" })), "not_in_stock");
  assert.equal(handOutBlocker(piece({ status: "assigned" })), "set_up");
  assert.equal(handOutBlocker(piece({ status: "retired", stockStatus: "retired" })), "not_in_stock");
});

test("hand out agrees with the shared handOut stock number", () => {
  const all = [piece(), piece({ repId: 2 }), piece({ status: "active" }), piece({ stockStatus: "pending" }), piece({ sold: true })];
  const asMetric = all.map((p) => ({ repId: p.repId, status: p.status, stockStatus: p.stockStatus, saleId: p.sold ? 1 : null }));
  assert.equal(all.filter((p) => handOutBlocker(p) === null).length, countStockMetric(asMetric, "handOut"));
});

test("take back: only unsold, unset pieces in a reseller's hands", () => {
  assert.equal(takeBackBlocker(piece({ repId: 3 })), null);
  assert.equal(takeBackBlocker(piece({ repId: 3, sold: true })), "sold");
  assert.equal(takeBackBlocker(piece()), "not_with_reseller");
  assert.equal(takeBackBlocker(piece({ repId: 3, status: "active" })), "set_up");
  assert.equal(takeBackBlocker(piece({ repId: 3, stockStatus: "damaged" })), "not_in_stock");
  const all = [piece({ repId: 3 }), piece(), piece({ repId: 3, status: "assigned" }), piece({ repId: 3, sold: true })];
  const asMetric = all.map((p) => ({ repId: p.repId, status: p.status, stockStatus: p.stockStatus, saleId: p.sold ? 1 : null }));
  assert.equal(all.filter((p) => takeBackBlocker(p) === null).length, countStockMetric(asMetric, "returnable"));
});

test("checkCodes: one answer per typed code, unknown and repeated codes flagged", () => {
  const found = new Map([["AAAAAAAA", piece()], ["BBBBBBBB", piece({ repId: 2 })]]);
  const result = checkCodes(["AAAAAAAA", "CCCCCCCC", "BBBBBBBB", "AAAAAAAA"], found, handOutBlocker, (_code, p) => ({
    tagId: p ? "id" : null, batchCode: null, serialNumber: null, productType: null, repId: p?.repId ?? null, repName: null, kitCode: null,
  }));
  assert.deepEqual(result.items.map((i) => [i.code, i.ok, i.reason]), [
    ["AAAAAAAA", true, null],
    ["CCCCCCCC", false, "unknown"],
    ["BBBBBBBB", false, "with_reseller"],
    ["AAAAAAAA", false, "duplicate"],
  ]);
  assert.equal(result.okCount, 1);
  assert.equal(result.items[1].tagId, null);
});

test("resellers: who can receive a kit, and why someone cannot sell", () => {
  const rep = { role: "rep", isActive: true, modules: ["visits", "tags"], blockedAt: null, wholesaleCode: "XP-ABCD-1234", costPolicyConfiguredAt: "2026-10-01" };
  assert.deepEqual(receiveBlockers(rep), []);
  assert.deepEqual(sellBlockers(rep), []);
  assert.deepEqual(receiveBlockers({ ...rep, isActive: false }), ["inactive"]);
  assert.deepEqual(receiveBlockers({ ...rep, blockedAt: "2026-10-02", isActive: false }), ["blocked"]);
  assert.deepEqual(receiveBlockers({ ...rep, modules: ["visits"] }), ["tags_off"]);
  assert.deepEqual(
    sellBlockers({ ...rep, modules: ["visits"], wholesaleCode: null, costPolicyConfiguredAt: null, blockedAt: "2026-10-02" }),
    ["blocked", "tags_off", "cost_rule", "wholesale_code"],
  );
  // Managers and admins sell without a wholesale code or a cost rule, and always see Tags.
  assert.deepEqual(sellBlockers({ ...rep, role: "manager", modules: ["visits"], wholesaleCode: null, costPolicyConfiguredAt: null }), []);
});

test("kits: the short code and the cost a chosen ownership needs", () => {
  assert.equal(kitCode(1), "K-0001");
  assert.equal(kitCode(42), "K-0042");
  assert.equal(kitCode(12345), "K-12345");
  assert.equal(kitCode(null), "K-????");
  // The acquisition rule always needs a cost; consignment needs one only for a purchase.
  assert.equal(kitCostRequired("acquisition", "company"), true);
  assert.equal(kitCostRequired("zero", "company"), false);
  assert.equal(kitCostRequired("zero", "rep"), true);
  assert.deepEqual(parseKitUnitCost("", kitCostRequired("zero", "rep")), { ok: false, reason: "required" });
  assert.deepEqual(parseKitUnitCost("", false), { ok: true, cents: undefined });
});

test("queues: only the known piece queues", () => {
  assert.equal(isTagPieceQueue("chipPending"), true);
  assert.equal(isTagPieceQueue("stuscleOrders"), false);
  assert.equal(isTagPieceQueue(null), false);
});
