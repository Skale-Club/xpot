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

test("batch creation rejects quantity and pre-generated codes", () => {
  assert.equal(batchCreateSchema.safeParse({ ...base, quantity: 100 }).success, false);
  assert.equal(batchCreateSchema.safeParse({ ...base, publicCodes: ["Z8MEZP0X"] }).success, false);
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
