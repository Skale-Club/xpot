import { test } from "vitest";
import assert from "node:assert/strict";
import { matchOrderPieces } from "../../shared/tagAcquisition.js";

const small = 1;
const large = 2;
const lines = [{ id: "L1", salesProductId: small, quantity: 2 }, { id: "L2", salesProductId: large, quantity: 1 }];
const pieces = (...list: Array<[string, number | null]>) => list.map(([code, productId]) => ({ code, productId }));

test("order pieces: each piece fills the line of its own product", () => {
  const m = matchOrderPieces(lines, pieces(["A", small], ["B", large], ["C", small]));
  assert.equal(m.complete, true);
  assert.deepEqual([...m.lineOf], [["A", "L1"], ["B", "L2"], ["C", "L1"]]);
  assert.deepEqual([...m.filled], [["L1", 2], ["L2", 1]]);
});

test("order pieces: a piece of a product the order does not have is refused by name, never counted ready", () => {
  // Six small plates ordered, one large plate read: it is not part of the order.
  const m = matchOrderPieces([{ id: "L1", salesProductId: small, quantity: 2 }], pieces(["A", small], ["B", large], ["C", small]));
  assert.equal(m.refused.get("B"), "not_in_order");
  assert.equal(m.filled.get("L1"), 2);
  assert.equal(m.complete, false);
});

test("order pieces: one too many of a product is refused as the order being full", () => {
  const m = matchOrderPieces(lines, pieces(["A", small], ["B", small], ["C", small], ["D", large]));
  assert.equal(m.refused.get("C"), "order_full");
  assert.equal(m.lineOf.get("D"), "L2");
  assert.equal(m.complete, false);
});

test("order pieces: a piece with no product matches nothing, and a short list is not complete", () => {
  assert.equal(matchOrderPieces(lines, pieces(["A", null])).refused.get("A"), "not_in_order");
  const short = matchOrderPieces(lines, pieces(["A", small], ["B", small]));
  assert.equal(short.refused.size, 0);
  assert.equal(short.complete, false);
});

test("order pieces: two lines of one product fill in order", () => {
  const twoLines = [{ id: "L1", salesProductId: small, quantity: 1 }, { id: "L2", salesProductId: small, quantity: 1 }];
  const m = matchOrderPieces(twoLines, pieces(["A", small], ["B", small]));
  assert.deepEqual([...m.lineOf], [["A", "L1"], ["B", "L2"]]);
  assert.equal(m.complete, true);
});
