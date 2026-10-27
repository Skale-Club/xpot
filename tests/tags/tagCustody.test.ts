import { test } from "vitest";
import assert from "node:assert/strict";
import { custodyActions, pieceAccess, receiveBlocker, receiveTargets, returnToHouseBlocker } from "../../shared/tagCustody.js";

const COMPANY = 1;
const PARTNER = 2;
const admin = { userId: "boss", repId: 1, isManager: true, inManagement: true, organizationIds: [COMPANY] };
const adminAsRep = { ...admin, inManagement: false };
const ana = { userId: "ana", repId: 10, isManager: false, organizationIds: [COMPANY] };
const partner = { userId: "pat", repId: 20, isManager: false, organizationIds: [PARTNER] };

const pending = { status: "inventory", stockStatus: "pending", repId: null, sold: false, batchId: "b1", organizationId: COMPANY };
const house = { ...pending, stockStatus: "available" };
const withAna = { ...house, repId: 10 };
const withZed = { ...house, repId: 11 };

test("pieceAccess: own pieces are full, the rest of the Organization is limited, other Organizations none", () => {
  assert.equal(pieceAccess(admin, pending), "full");
  assert.equal(pieceAccess(ana, withAna), "full");
  assert.equal(pieceAccess(ana, withZed), "limited");
  assert.equal(pieceAccess(ana, pending), "limited");
  assert.equal(pieceAccess(ana, house), "limited");
  assert.equal(pieceAccess(partner, pending), "none");
  // A piece with no Organization (pre-migration rows) is never limited.
  assert.equal(pieceAccess(ana, { repId: 11, organizationId: null }), "none");
});

test("receiveTargets: management receives for the house first; everyone else into their own stock", () => {
  assert.deepEqual(receiveTargets(admin), ["house", "me"]);
  assert.deepEqual(receiveTargets(adminAsRep), ["me"]);
  assert.deepEqual(receiveTargets(ana), ["me"]);
});

test("receiveBlocker: only a pending piece of an open batch, in the actor's Organization", () => {
  assert.equal(receiveBlocker(ana, pending, "open"), null);
  assert.equal(receiveBlocker(admin, pending, "open"), null);
  assert.equal(receiveBlocker(ana, house, "open"), "not_pending");
  assert.equal(receiveBlocker(ana, { ...pending, batchId: null }, null), "no_batch");
  assert.equal(receiveBlocker(ana, pending, "closed"), "batch_closed");
  assert.equal(receiveBlocker(partner, pending, "open"), "other_organization");
  // A manager reaches every Organization's pieces.
  assert.equal(receiveBlocker({ ...admin, organizationIds: [] }, pending, "open"), null);
});

test("returnToHouseBlocker: the Take back rule", () => {
  assert.equal(returnToHouseBlocker(withAna), null);
  assert.equal(returnToHouseBlocker(house), "not_with_reseller");
  assert.equal(returnToHouseBlocker({ ...withAna, sold: true }), "sold");
  assert.equal(returnToHouseBlocker({ ...withAna, status: "active" }), "set_up");
  assert.equal(returnToHouseBlocker({ ...withAna, stockStatus: "internal_use" }), "not_in_stock");
});

test("custodyActions: what the piece screen offers", () => {
  assert.deepEqual(custodyActions(admin, pending, "open"), {
    access: "full",
    receive: { targets: ["house", "me"], blocker: null },
    returnToHouse: null,
  });
  assert.deepEqual(custodyActions(ana, pending, "open"), {
    access: "limited",
    receive: { targets: ["me"], blocker: null },
    returnToHouse: null,
  });
  assert.deepEqual(custodyActions(ana, withAna, "open"), {
    access: "full",
    receive: null,
    returnToHouse: { blocker: null },
  });
  // A colleague's piece: seen, but nothing to do about it from here.
  assert.deepEqual(custodyActions(ana, withZed, "open"), { access: "limited", receive: null, returnToHouse: null });
  assert.equal(custodyActions(partner, pending, "open"), null);
});
