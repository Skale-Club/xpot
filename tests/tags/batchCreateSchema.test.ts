import assert from "node:assert/strict";
import { test } from "vitest";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
const { batchCreateSchema } = await import("../../server/tags/routes.js");

const base = {
  name: "Legacy small plaques",
  batchCode: "REV-2026-001",
  productType: "google_review_sign",
  salesProductId: 1,
  vendor: "Skale Club",
  quantity: 4,
};

test("batch import preserves and normalizes exact legacy public codes", () => {
  const parsed = batchCreateSchema.parse({
    ...base,
    publicCodes: ["z8mezp0x", "7414-wrmt", "Y4B0FB8B", "ESNQ1ZWA"],
  });

  assert.deepEqual(parsed.publicCodes, ["Z8MEZP0X", "7414WRMT", "Y4B0FB8B", "ESNQ1ZWA"]);
});

test("batch import rejects a code count that differs from quantity", () => {
  const result = batchCreateSchema.safeParse({ ...base, publicCodes: ["Z8MEZP0X"] });
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /exactly quantity/);
});

test("batch import rejects duplicate or malformed public codes", () => {
  const duplicate = batchCreateSchema.safeParse({
    ...base,
    publicCodes: ["Z8MEZP0X", "z8mezp0x", "Y4B0FB8B", "ESNQ1ZWA"],
  });
  assert.equal(duplicate.success, false);
  assert.match(duplicate.error.issues.at(-1)!.message, /duplicates/);

  const malformed = batchCreateSchema.safeParse({
    ...base,
    publicCodes: ["Z8MEZP0X", "BAD", "Y4B0FB8B", "ESNQ1ZWA"],
  });
  assert.equal(malformed.success, false);
  assert.match(malformed.error.issues[0].message, /Invalid public code/);
});
