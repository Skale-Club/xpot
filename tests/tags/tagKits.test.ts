import { test } from "vitest";
import assert from "node:assert/strict";
import { kitCostRequired, kitOwnership, parseKitUnitCost } from "../../shared/tagKits.js";

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
