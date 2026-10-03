import { test } from "vitest";
import assert from "node:assert/strict";
import {
  TAG_CODE_ALPHABET,
  applyTagUtm,
  buildManufacturingCsv,
  buildTagUrls,
  csvCell,
  defaultUtmEnabled,
  encodeTagCode,
  normalizeTagCode,
  planTransition,
  resolveRedirectTarget,
  validateDestinationUrl,
} from "../../shared/tags.js";

test("encodeTagCode uses only the Crockford alphabet and the requested length", () => {
  const bytes = Array.from({ length: 256 }, (_, i) => i);
  const code = encodeTagCode(bytes.slice(0, 8));
  assert.equal(code.length, 8);
  for (let i = 0; i < 256; i += 8) {
    for (const ch of encodeTagCode(bytes.slice(i, i + 8))) assert.ok(TAG_CODE_ALPHABET.includes(ch));
  }
  assert.ok(!/[ILOU]/.test(TAG_CODE_ALPHABET));
});

test("normalizeTagCode is case-insensitive and forgives ambiguous characters", () => {
  assert.equal(normalizeTagCode("a7k3p9x2"), "A7K3P9X2");
  assert.equal(normalizeTagCode(" A7K3-P9X2 "), "A7K3P9X2");
  assert.equal(normalizeTagCode("0OIL2345"), "00112345");
  assert.equal(normalizeTagCode("short"), null);
  assert.equal(normalizeTagCode("A7K3P9X2U"), null); // U is never issued
  assert.equal(normalizeTagCode("../etc/pw"), null);
  assert.equal(normalizeTagCode(undefined), null);
});

test("QR and NFC URLs share one code and differ only by path", () => {
  assert.deepEqual(buildTagUrls("https://xpot.place/", "A7K3P9X2"), {
    qrUrl: "https://xpot.place/q/A7K3P9X2",
    nfcUrl: "https://xpot.place/n/A7K3P9X2",
  });
});

test("destination validation accepts https and rejects dangerous schemes", () => {
  assert.deepEqual(validateDestinationUrl(" https://g.page/r/abc/review "), { ok: true, url: "https://g.page/r/abc/review" });
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "", "   ", "not a url", "ftp://x.com"]) {
    assert.equal(validateDestinationUrl(bad).ok, false, bad);
  }
  assert.equal(validateDestinationUrl("http://example.com").ok, false);
  assert.equal(validateDestinationUrl("http://example.com", { allowHttp: true }).ok, true);
  assert.equal(validateDestinationUrl("https://user:pw@example.com").ok, false);
});

test("UTMs preserve existing query parameters and differ by method", () => {
  const qr = new URL(applyTagUtm("https://site.com/book?ref=abc&utm_source=keep", { method: "qr", campaign: "John's Barber", code: "A7K3P9X2" }));
  assert.equal(qr.searchParams.get("ref"), "abc");
  assert.equal(qr.searchParams.get("utm_source"), "keep");
  assert.equal(qr.searchParams.get("utm_medium"), "qr");
  assert.equal(qr.searchParams.get("utm_campaign"), "john-s-barber");
  assert.equal(qr.searchParams.get("utm_content"), "A7K3P9X2");
  const nfc = new URL(applyTagUtm("https://site.com/", { method: "nfc", code: "A7K3P9X2" }));
  assert.equal(nfc.searchParams.get("utm_medium"), "nfc");
  assert.equal(nfc.searchParams.get("utm_source"), "xpot-tag");
  assert.equal(nfc.searchParams.has("utm_campaign"), false);
});

test("UTMs are only appended when enabled, and off by default for Google Review", () => {
  const tag = { destinationUrl: "https://site.com/?a=1", utmEnabled: false, utmCampaign: "x", publicCode: "A7K3P9X2" };
  assert.equal(resolveRedirectTarget(tag, "qr"), "https://site.com/?a=1");
  assert.match(resolveRedirectTarget({ ...tag, utmEnabled: true }, "qr")!, /utm_medium=qr/);
  assert.equal(resolveRedirectTarget({ ...tag, destinationUrl: null }, "qr"), null);
  assert.equal(defaultUtmEnabled("google_review"), false);
  assert.equal(defaultUtmEnabled("website"), true);
  assert.equal(defaultUtmEnabled(null), false);
});

test("state machine: inventory → assigned → active ⇄ disabled → retired", () => {
  const base = { leadId: null as number | null, destinationUrl: null as string | null, destinationType: null as string | null };
  assert.deepEqual(planTransition({ ...base, status: "inventory" }, "assign"), { ok: true, status: "assigned" });
  assert.equal(planTransition({ ...base, status: "inventory" }, "activate").ok, false);

  const assigned = { status: "assigned", leadId: 1, destinationUrl: null, destinationType: null };
  assert.equal(planTransition(assigned, "activate").ok, false);
  const ready = { ...assigned, destinationUrl: "https://x.com", destinationType: "website" };
  assert.deepEqual(planTransition(ready, "activate"), { ok: true, status: "active" });
  assert.deepEqual(planTransition({ ...ready, status: "active" }, "disable"), { ok: true, status: "disabled" });
  assert.deepEqual(planTransition({ ...ready, status: "disabled" }, "activate"), { ok: true, status: "active" });
  assert.equal(planTransition({ ...ready, status: "active" }, "activate").ok, false);
  assert.deepEqual(planTransition({ ...ready, status: "active" }, "retire"), { ok: true, status: "retired" });

  const retired = { ...ready, status: "retired" };
  for (const action of ["assign", "unassign", "activate", "disable", "retire"] as const) {
    assert.equal(planTransition(retired, action).ok, false, action);
  }
  assert.deepEqual(planTransition(retired, "restore"), { ok: true, status: "assigned" });
  assert.deepEqual(planTransition({ ...retired, leadId: null }, "restore"), { ok: true, status: "inventory" });
});

test("manufacturing CSV maps serial → code → URLs → asset filename", () => {
  const csv = buildManufacturingCsv(
    { batchCode: "REV-2026-001", quantity: 100 },
    [{ publicCode: "A7K3P9X2", serialNumber: 1 }, { publicCode: "B8M4Q0Y3", serialNumber: 2 }],
    "https://xpot.place",
  );
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "batch_code,serial_number,public_code,qr_url,nfc_url,qr_asset_filename");
  assert.equal(lines[1], "REV-2026-001,001,A7K3P9X2,https://xpot.place/q/A7K3P9X2,https://xpot.place/n/A7K3P9X2,A7K3P9X2.svg");
  assert.equal(lines[2].split(",")[1], "002");
  assert.equal(lines.length, 3);
});

test("csvCell quotes separators and neutralises formulas", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(null), "");
});
