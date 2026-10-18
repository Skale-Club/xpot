import { test } from "vitest";
import assert from "node:assert/strict";
import { chipNeedsWriting, classifyScan, decidePhoneWrite, matchesPieceFilters, parsePieceFilters, guessDestinationType, formatPhoneMask, normalizeUrlInput, socialHandleOf, socialNetworkOf, socialUrl } from "../../shared/tagApp.js";

test("classifyScan: Xpot tag links, in either access method", () => {
  assert.deepEqual(classifyScan("https://xpot.place/n/A7K3P9X2"), { kind: "xpot", code: "A7K3P9X2", method: "nfc" });
  assert.deepEqual(classifyScan("https://www.xpot.place/q/a7k3p9x2/"), { kind: "xpot", code: "A7K3P9X2", method: "qr" });
  // The field app's own tag screen.
  assert.deepEqual(classifyScan("https://xpot.place/tags/t/A7K3P9X2"), { kind: "xpot", code: "A7K3P9X2", method: null });
});

test("classifyScan: a bare printed code is an Xpot tag", () => {
  assert.deepEqual(classifyScan(" a7k3-p9x2 "), { kind: "xpot", code: "A7K3P9X2", method: null });
});

test("classifyScan: staging hosts only count when passed in", () => {
  const url = "https://xpot-stage.example.com/n/A7K3P9X2";
  assert.equal(classifyScan(url).kind, "direct");
  assert.equal(classifyScan(url, ["xpot-stage.example.com"]).kind, "xpot");
});

test("classifyScan: everything else on the web is a direct customer link", () => {
  assert.deepEqual(classifyScan("https://cliente.com/menu"), { kind: "direct", url: "https://cliente.com/menu" });
  // Other pages on the tag domain are not tags.
  assert.equal(classifyScan("https://xpot.place/nfc-guide").kind, "direct");
  // A malformed code under /n is not a tag either.
  assert.equal(classifyScan("https://xpot.place/n/nope").kind, "direct");
  assert.deepEqual(classifyScan("cliente.com.br/agendar"), { kind: "direct", url: "https://cliente.com.br/agendar" });
});

test("classifyScan: empty chips and non-link payloads", () => {
  assert.deepEqual(classifyScan(""), { kind: "empty" });
  assert.deepEqual(classifyScan(null), { kind: "empty" });
  assert.deepEqual(classifyScan("hello world"), { kind: "text", text: "hello world" });
});

test("classifyScan: an email, phone or contact card on a chip is direct content", () => {
  assert.deepEqual(classifyScan("tel:+15085001095"), { kind: "direct", url: "tel:+15085001095" });
  assert.deepEqual(classifyScan("mailto:ana@example.com"), { kind: "direct", url: "mailto:ana@example.com" });
  assert.equal(classifyScan(["BEGIN:VCARD", "VERSION:3.0", "FN:Ana", "END:VCARD"].join(String.fromCharCode(10))).kind, "direct");
});

test("normalizeUrlInput adds https:// only to scheme-less hosts", () => {
  assert.equal(normalizeUrlInput("cliente.com/x"), "https://cliente.com/x");
  assert.equal(normalizeUrlInput("http://cliente.com"), "http://cliente.com");
  assert.equal(normalizeUrlInput("  "), "");
  assert.equal(normalizeUrlInput("not a link"), "not a link");
});

test("guessDestinationType", () => {
  assert.equal(guessDestinationType("https://g.page/r/CabcdEF/review"), "google_review");
  assert.equal(guessDestinationType("https://search.google.com/local/writereview?placeid=x"), "google_review");
  assert.equal(guessDestinationType("https://www.instagram.com/skale.club"), "social");
  assert.equal(guessDestinationType("https://calendly.com/skale/intro"), "booking");
  assert.equal(guessDestinationType("https://cliente.com/cardapio"), "menu");
  assert.equal(guessDestinationType("cliente.com"), "website");
  assert.equal(guessDestinationType("garbage"), "website");
});

test("decidePhoneWrite: verified only on an exact read-back", () => {
  const expected = "https://xpot.place/n/A7K3P9X2";
  assert.deepEqual(decidePhoneWrite(expected, expected), { ok: true, status: "verified" });
  assert.deepEqual(decidePhoneWrite(expected, null), { ok: true, status: "programmed" });
  const bad = decidePhoneWrite(expected, "https://xpot.place/n/OTHER123");
  assert.equal(bad.ok, false);
  assert.equal(bad.status, "failed");
});

test("socialUrl builds a profile link from a typed handle", () => {
  assert.equal(socialUrl("instagram", "@celesconfections"), "https://instagram.com/celesconfections");
  assert.equal(socialUrl("instagram", " celes.confections "), "https://instagram.com/celes.confections");
  assert.equal(socialUrl("tiktok", "@celes"), "https://tiktok.com/@celes");
  assert.equal(socialUrl("facebook", "celes confections"), "https://facebook.com/celesconfections");
  assert.equal(socialUrl("whatsapp", "+1 (305) 555-0142"), "https://wa.me/13055550142");
  assert.equal(socialUrl("instagram", ""), "");
  assert.equal(socialUrl("instagram", "@"), "");
});

test("socialUrl keeps a whole pasted link", () => {
  assert.equal(socialUrl("instagram", "https://www.instagram.com/celes/?hl=en"), "https://www.instagram.com/celes/?hl=en");
  assert.equal(socialUrl("instagram", "instagram.com/celes"), "https://instagram.com/celes");
  assert.equal(socialUrl("instagram", "celes.com/menu"), "https://celes.com/menu");
});

test("socialNetworkOf and socialHandleOf read a profile link back", () => {
  assert.equal(socialNetworkOf("https://www.instagram.com/celes/"), "instagram");
  assert.equal(socialNetworkOf("https://wa.me/13055550142"), "whatsapp");
  assert.equal(socialNetworkOf("https://celes.com"), null);
  assert.equal(socialNetworkOf(""), null);
  assert.equal(socialHandleOf("instagram", "https://www.instagram.com/celes/?hl=en"), "celes");
  assert.equal(socialHandleOf("tiktok", "https://tiktok.com/@celes"), "celes");
  assert.equal(socialHandleOf("facebook", "https://instagram.com/celes"), "");
});

test("formatPhoneMask masks a WhatsApp phone as it is typed", () => {
  assert.equal(formatPhoneMask(""), "");
  assert.equal(formatPhoneMask("1"), "+1");
  assert.equal(formatPhoneMask("55"), "+55");
  assert.equal(formatPhoneMask("1305"), "+1 (305");
  assert.equal(formatPhoneMask("130555"), "+1 (305) 55");
  assert.equal(formatPhoneMask("+1 305 555 0142"), "+1 (305) 555-0142");
  assert.equal(formatPhoneMask("5511999998888"), "+55 (11) 99999-8888");
  assert.equal(formatPhoneMask("551133334444"), "+55 (11) 3333-4444");
  assert.equal(formatPhoneMask("55119"), "+55 (11) 9");
  assert.equal(formatPhoneMask("447700900123"), "+447700900123");
});

test("My pieces filters: status and sale are separate axes", () => {
  const live = { status: "active", saleId: null, nfcStatus: "verified" };
  const liveSold = { status: "active", saleId: 7, nfcStatus: "verified" };
  const kit = { status: "inventory", saleId: null, nfcStatus: "not_programmed" };
  const linked = { status: "assigned", saleId: null, nfcStatus: "failed" };
  const off = { status: "disabled", saleId: 3, nfcStatus: "programmed" };
  const pick = (values: Record<string, string>) =>
    [live, liveSold, kit, linked, off].filter((tag) => matchesPieceFilters(tag, parsePieceFilters(values)));

  assert.deepEqual(pick({}), [live, liveSold, kit, linked, off]);
  assert.deepEqual(pick({ status: "setup" }), [kit, linked]);
  assert.deepEqual(pick({ status: "active" }), [live, liveSold]);
  assert.deepEqual(pick({ status: "off" }), [off]);
  // "Not sold" includes live pieces given out without a recorded sale.
  assert.deepEqual(pick({ sale: "unsold" }), [live, kit, linked]);
  assert.deepEqual(pick({ status: "active", sale: "sold" }), [liveSold]);
  // Older links put the sale axis in `status`.
  assert.deepEqual(pick({ status: "stock" }), [live, kit, linked]);
  assert.deepEqual(pick({ status: "sold" }), [liveSold, off]);
  assert.deepEqual(parsePieceFilters({ status: "bogus", sale: "bogus", chip: "x" }), { status: "all", sale: "all", chip: "all" });
});

test("chip filter: set-up pieces whose chip still needs writing, as the dashboard counts them", () => {
  assert.equal(chipNeedsWriting({ status: "active", nfcStatus: "not_programmed" }), true);
  assert.equal(chipNeedsWriting({ status: "assigned", nfcStatus: "failed" }), true);
  assert.equal(chipNeedsWriting({ status: "active", nfcStatus: "programmed" }), false);
  // A piece still in the kit is not an alert yet.
  assert.equal(chipNeedsWriting({ status: "inventory", nfcStatus: "not_programmed" }), false);
  const filters = parsePieceFilters({ chip: "missing" });
  assert.equal(matchesPieceFilters({ status: "active", saleId: null, nfcStatus: "failed" }, filters), true);
  assert.equal(matchesPieceFilters({ status: "active", saleId: null, nfcStatus: "verified" }, filters), false);
});
