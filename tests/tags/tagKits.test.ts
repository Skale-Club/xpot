import { test } from "vitest";
import assert from "node:assert/strict";
import { kitCostRequired, kitOwnership, parseKitUnitCost, takeBackDestination } from "../../shared/tagKits.js";

test("kit cost: required only under the acquisition rule", () => {
  assert.equal(kitCostRequired("acquisition"), true);
  assert.equal(kitCostRequired("zero"), false);
  assert.deepEqual(parseKitUnitCost("", "acquisition"), { ok: false, reason: "required" });
  assert.deepEqual(parseKitUnitCost("  ", "zero"), { ok: true, cents: undefined });
});

test("kit cost: parses amounts to cents and refuses junk", () => {
  assert.deepEqual(parseKitUnitCost("12.5", "acquisition"), { ok: true, cents: 1250 });
  assert.deepEqual(parseKitUnitCost("0", "acquisition"), { ok: true, cents: 0 });
  assert.deepEqual(parseKitUnitCost("3.333", "zero"), { ok: true, cents: 333 });
  assert.deepEqual(parseKitUnitCost("-1", "zero"), { ok: false, reason: "invalid" });
  assert.deepEqual(parseKitUnitCost("abc", "acquisition"), { ok: false, reason: "invalid" });
});

test("kit ownership: a purchase is the rep's, consignment stays the company's", () => {
  assert.equal(kitOwnership("acquisition"), "rep");
  assert.equal(kitOwnership("zero"), "company");
});

test("take back: pieces return to the organization the kit came from, within what the person reaches", () => {
  const company = 1, harbor = 2, north = 7, south = 8;
  const to = (kitSourceOrganizationId: number | null, pieceOrganizationId: number, scope: number[] | null) =>
    takeBackDestination({ kitSourceOrganizationId, pieceOrganizationId, companyOrganizationId: company, scope });
  // The platform: where the kit came from, never always the company.
  assert.equal(to(harbor, harbor, null), harbor);
  assert.equal(to(company, north, null), company);
  assert.equal(to(north, north, null), north);
  // An owner: the source when it is theirs, otherwise what they run, never an organization they cannot reach.
  assert.equal(to(north, north, [north]), north);
  assert.equal(to(company, north, [north]), north);
  assert.equal(to(south, north, [north, south]), south);
  assert.equal(to(company, north, [north, south]), north);
  // A kit from before the source was recorded keeps the old destination.
  assert.equal(to(null, harbor, null), company);
  assert.equal(to(null, north, [north]), north);
  assert.equal(to(null, south, [north, south]), south);
});
