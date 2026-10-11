import assert from "node:assert/strict";
import { test } from "vitest";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
const { batchCreateSchema, batchScanSchema } = await import("../../server/tags/routes.js");

const base = {
  name: "Plaquinhas recebidas",
  batchCode: "REV-2026-001",
  productType: "google_review_sign",
  salesProductId: 1,
  vendor: "China supplier",
};

test("a new intake batch is created without quantity or pre-generated codes", () => {
  const parsed = batchCreateSchema.parse(base);

  assert.equal(parsed.name, base.name);
  assert.equal("quantity" in parsed, false);
  assert.equal("publicCodes" in parsed, false);
});

test("an issued batch takes a quantity (codes generated for pieces still to be made)", () => {
  assert.equal(batchCreateSchema.parse({ ...base, quantity: "4" }).quantity, 4);
  assert.equal(batchCreateSchema.safeParse({ ...base, quantity: 0 }).success, false);
  assert.equal(batchCreateSchema.safeParse({ ...base, quantity: 1001 }).success, false);
});

test("pinned legacy codes are normalized; a count that differs from quantity or a duplicate is refused", () => {
  const parsed = batchCreateSchema.parse({ ...base, publicCodes: ["z8mezp0x", "7414-wrmt", "Y4B0FB8B", "ESNQ1ZWA"] });
  assert.deepEqual(parsed.publicCodes, ["Z8MEZP0X", "7414WRMT", "Y4B0FB8B", "ESNQ1ZWA"]);
  assert.equal(batchCreateSchema.safeParse({ ...base, quantity: 2, publicCodes: ["Z8MEZP0X"] }).success, false);
  assert.equal(batchCreateSchema.safeParse({ ...base, publicCodes: ["Z8MEZP0X", "z8mezp0x"] }).success, false);
  assert.equal(batchCreateSchema.safeParse({ ...base, publicCodes: ["NOT-A-CODE!"] }).success, false);
});

test("a batch scan accepts a bare code or an Xpot QR/NFC URL", () => {
  assert.deepEqual(batchScanSchema.parse({ value: "z8mezp0x" }), { value: "z8mezp0x" });
  assert.deepEqual(batchScanSchema.parse({ value: "https://xpot.place/q/7414WRMT", idempotencyKey: "device-1:42" }), {
    value: "https://xpot.place/q/7414WRMT",
    idempotencyKey: "device-1:42",
  });
});

test("a batch scan rejects empty or oversized payloads", () => {
  assert.equal(batchScanSchema.safeParse({ value: "" }).success, false);
  assert.equal(batchScanSchema.safeParse({ value: "x".repeat(2049) }).success, false);
});
