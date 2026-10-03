import { test } from "vitest";
import assert from "node:assert/strict";
import { canUseLead, canWorkOnTag, saleCredit } from "../../shared/tagAccess.js";

const manager = { userId: "boss", repId: 1, isManager: true };
const ana = { userId: "ana", repId: 10, isManager: false };

test("canWorkOnTag: managers reach every piece, house stock included", () => {
  assert.equal(canWorkOnTag(manager, { repId: null }), true);
  assert.equal(canWorkOnTag(manager, { repId: 99 }), true);
});

test("canWorkOnTag: a reseller reaches only the pieces in their own kit", () => {
  assert.equal(canWorkOnTag(ana, { repId: 10 }), true);
  assert.equal(canWorkOnTag(ana, { repId: 11 }), false);
  // House stock is out of reach until an admin hands it over in a kit.
  assert.equal(canWorkOnTag(ana, { repId: null }), false);
});

test("canUseLead: a reseller sells only to their own leads", () => {
  assert.equal(canUseLead(ana, { ownerRepId: 10 }), true);
  assert.equal(canUseLead(ana, { ownerRepId: 11 }), false);
  assert.equal(canUseLead(ana, { ownerRepId: null }), false);
  assert.equal(canUseLead(manager, { ownerRepId: null }), true);
});

test("saleCredit: the holder gets the sale, the first activation date sticks", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const before = new Date("2026-09-01T12:00:00Z");
  assert.deepEqual(saleCredit({ repId: 10, soldAt: null }, 1, now), { repId: 10, soldAt: now });
  // An admin re-activating a reseller's piece keeps the reseller's credit and date.
  assert.deepEqual(saleCredit({ repId: 10, soldAt: before }, 1, now), { repId: 10, soldAt: before });
  // A house piece an admin activates is credited to that admin.
  assert.deepEqual(saleCredit({ repId: null, soldAt: null }, 1, now), { repId: 1, soldAt: now });
});
