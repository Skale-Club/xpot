import assert from "node:assert/strict";
import { test } from "vitest";
import { parseTagIntakeScan } from "../../shared/tagIntake.js";

test("normalizes a bare public code", () => {
  assert.deepEqual(parseTagIntakeScan(" z8mez-p0x "), { ok: true, publicCode: "Z8MEZP0X", method: null });
});

test("extracts the code and access method from an Xpot URL", () => {
  assert.deepEqual(parseTagIntakeScan("https://xpot.place/q/7414-wrmt"), { ok: true, publicCode: "7414WRMT", method: "qr" });
  assert.deepEqual(parseTagIntakeScan("https://www.xpot.place/n/Y4B0FB8B"), { ok: true, publicCode: "Y4B0FB8B", method: "nfc" });
});

test("accepts the app's own host and tag screen links (the admin code lookup passes its host)", () => {
  assert.deepEqual(parseTagIntakeScan("https://staging.xpot.test/q/7414WRMT", ["staging.xpot.test"]), { ok: true, publicCode: "7414WRMT", method: "qr" });
  assert.deepEqual(parseTagIntakeScan("https://xpot.place/tags/t/Y4B0FB8B"), { ok: true, publicCode: "Y4B0FB8B", method: null });
  assert.equal(parseTagIntakeScan("https://staging.xpot.test/q/7414WRMT").ok, false);
});

test("rejects direct links, text, and empty scans", () => {
  const expected = { ok: false, error: "Scan an Xpot QR/NFC link or public code" };
  assert.deepEqual(parseTagIntakeScan("https://example.com/review"), expected);
  assert.deepEqual(parseTagIntakeScan("hello world"), expected);
  assert.deepEqual(parseTagIntakeScan(""), expected);
});
