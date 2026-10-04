// Run: npx tsx --test shared/nfcProvisioning.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  decideCompletion,
  encodePairingCode,
  formatPairingCode,
  normalizePairingCode,
  statusAfterEvent,
} from "../../shared/tagProvisioning.js";

test("pairing codes are 8 Crockford symbols, shown as XXXX-XXXX, typed forgivingly", () => {
  const code = encodePairingCode([0, 1, 2, 3, 30, 31, 200, 255]);
  assert.equal(code.length, 8);
  assert.equal(formatPairingCode(code), `${code.slice(0, 4)}-${code.slice(4)}`);
  assert.equal(normalizePairingCode(` ${formatPairingCode(code).toLowerCase()} `), code);
  assert.equal(normalizePairingCode("abcd-efgo"), "ABCDEFG0");
  assert.equal(normalizePairingCode("short"), null);
  assert.equal(normalizePairingCode(undefined), null);
});

test("progress events advance a claimed job; pending/closed jobs ignore them", () => {
  assert.equal(statusAfterEvent("claimed", "write_started"), "writing");
  assert.equal(statusAfterEvent("writing", "write_completed"), "verifying");
  assert.equal(statusAfterEvent("claimed", "tag_detected"), null);
  assert.equal(statusAfterEvent("pending", "write_started"), null);
  assert.equal(statusAfterEvent("succeeded", "write_started"), null);
});

const URL = "https://xpot.place/n/A7K3P9X2";

test("success needs an exact read-back match", () => {
  assert.deepEqual(decideCompletion({ expectedUrl: URL, status: "verifying" }, { outcome: "succeeded", readbackUrl: URL }), {
    status: "succeeded",
    tagStatus: "verified",
  });
  for (const readback of ["https://xpot.place/n/A7K3P9X3", `${URL}/`, "http://xpot.place/n/A7K3P9X2", null, undefined]) {
    const d = decideCompletion({ expectedUrl: URL, status: "verifying" }, { outcome: "succeeded", readbackUrl: readback });
    assert.equal(d.status, "failed", String(readback));
    assert.equal(d.status === "failed" && d.errorCode, "verification_mismatch");
    assert.equal(d.status === "failed" && d.tagStatus, "failed");
  }
});

test("a failure before any write leaves the chip status untouched", () => {
  const before = decideCompletion({ expectedUrl: URL, status: "claimed" }, { outcome: "failed", errorCode: "unsupported_tag" });
  assert.deepEqual(before, { status: "failed", tagStatus: null, errorCode: "unsupported_tag", errorMessage: null });
  const during = decideCompletion({ expectedUrl: URL, status: "writing" }, { outcome: "failed", errorCode: "tag_removed", errorMessage: "lifted" });
  assert.deepEqual(during, { status: "failed", tagStatus: "failed", errorCode: "tag_removed", errorMessage: "lifted" });
  const unknown = decideCompletion({ expectedUrl: URL, status: "claimed" }, { outcome: "failed" });
  assert.equal(unknown.status === "failed" && unknown.errorCode, "internal_error");
});
