import { test } from "vitest";
import assert from "node:assert/strict";
import { activationCredit, canUseLead, canWorkOnTag } from "../../shared/tagAccess.js";

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

test("activationCredit: activation keeps the holder but never creates a financial sale", () => {
  assert.deepEqual(activationCredit({ repId: 10 }, 1), { repId: 10 });
  // A house piece an admin activates is credited to that admin, without soldAt.
  assert.deepEqual(activationCredit({ repId: null }, 1), { repId: 1 });
});
