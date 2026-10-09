// What a piece hands out when it is scanned or tapped: a link (the default), an
// email, a phone number or a contact card (vCard). Pure rules shared by the app
// and the server: build each kind from its fields, recognise a stored value,
// and validate it. No I/O, unit-tested in tests/tags/chipContent.test.ts.
//
// Every kind is stored as one string, the same column a link always used
// (tags.destination_url, tag_direct_writes.url):
//   url    https://…
//   email  mailto:ana@example.com[?subject=…]
//   phone  tel:+15085550100 (E.164)
//   vcard  the vCard 3.0 text itself, BEGIN:VCARD … END:VCARD
//
// An Xpot piece keeps /n/<code> on the chip and the server serves the content
// (server/tags/publicHandler.ts); a direct chip holds the content itself
// (client/src/pages/tags/webNfc.ts writes a vCard as a text/vcard record).

import { validateDestinationUrl } from "./tags.js";

export const CHIP_CONTENT_KINDS = ["url", "email", "phone", "vcard"] as const;
export type ChipContentKind = (typeof CHIP_CONTENT_KINDS)[number];

/** Longest stored value; also the bound for a link (validateDestinationUrl). */
export const CHIP_CONTENT_MAX = 2048;

// ─── Email ───────────────────────────────────────────────────────────────────

/** A practical address check: one @, a dotted domain, no spaces. */
export function isValidEmail(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  return value.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value);
}

export function buildMailto(email: string, subject?: string | null): string {
  const address = email.trim().toLowerCase();
  const s = (subject ?? "").trim();
  return s ? `mailto:${address}?subject=${encodeURIComponent(s)}` : `mailto:${address}`;
}

export function parseMailto(value: string): { email: string; subject: string } {
  const rest = value.replace(/^mailto:/i, "");
  const [address, query = ""] = rest.split("?");
  let subject = "";
  try {
    subject = new URLSearchParams(query).get("subject") ?? "";
  } catch {
    subject = "";
  }
  let email = address;
  try {
    email = decodeURIComponent(address);
  } catch {
    email = address;
  }
  return { email, subject };
}

// ─── Phone ───────────────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{7,14}$/;

/** tel: from an E.164 number ("+15085550100"); the caller normalizes first (shared/phone.ts). */
export function buildTel(e164: string): string {
  return `tel:${e164}`;
}

export function parseTel(value: string): string {
  return value.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
}

// ─── vCard ───────────────────────────────────────────────────────────────────

export type VCardFields = {
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  /** E.164. */
  phone: string;
  email: string;
  url: string;
};

export const EMPTY_VCARD: VCardFields = { firstName: "", lastName: "", org: "", title: "", phone: "", email: "", url: "" };

/** vCard 3.0 escaping (RFC 2426 §4): backslash, comma, semicolon, newline. */
function esc(value: string): string {
  return value.trim().replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Splits on ";" not preceded by a backslash (no lookbehind: older iOS Safari lacks it). */
function splitFields(value: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      current += ch + value[++i];
    } else if (ch === ";") {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

function unesc(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([\\,;])/g, "$1");
}

/** Display name: "First Last", else the company. */
export function vcardName(f: Pick<VCardFields, "firstName" | "lastName" | "org">): string {
  return [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(" ") || f.org.trim();
}

/** vCard 3.0, CRLF line endings: what both iOS and Android contacts import. */
export function buildVCard(f: VCardFields): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${esc(f.lastName)};${esc(f.firstName)};;;`);
  lines.push(`FN:${esc(vcardName(f))}`);
  if (f.org.trim()) lines.push(`ORG:${esc(f.org)}`);
  if (f.title.trim()) lines.push(`TITLE:${esc(f.title)}`);
  if (f.phone.trim()) lines.push(`TEL;TYPE=CELL:${f.phone.trim()}`);
  if (f.email.trim()) lines.push(`EMAIL;TYPE=INTERNET:${f.email.trim().toLowerCase()}`);
  if (f.url.trim()) lines.push(`URL:${f.url.trim()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Reads back the fields buildVCard writes (and the same properties from other vCards). */
export function parseVCard(text: string): VCardFields {
  const out: VCardFields = { ...EMPTY_VCARD };
  // Unfold continuation lines (a line starting with a space or tab continues the previous one).
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const name = line.slice(0, i).split(";")[0].toUpperCase();
    const value = line.slice(i + 1);
    if (name === "N") {
      const [last = "", first = ""] = splitFields(value);
      out.lastName = unesc(last);
      out.firstName = unesc(first);
    } else if (name === "ORG") out.org = unesc(splitFields(value)[0]);
    else if (name === "TITLE") out.title = unesc(value);
    else if (name === "TEL" && !out.phone) out.phone = value.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    else if (name === "EMAIL" && !out.email) out.email = value.trim();
    else if (name === "URL" && !out.url) out.url = unesc(value).trim();
  }
  return out;
}

export type VCardProblem = "vcardName" | "vcardReach" | "vcardPhone" | "vcardEmail" | "vcardUrl";

/** What is wrong with the fields, as a dictionary key, or null. A card needs a name and a way to reach the person. */
export function vcardProblem(f: VCardFields): VCardProblem | null {
  if (!vcardName(f)) return "vcardName";
  if (!f.phone.trim() && !f.email.trim()) return "vcardReach";
  if (f.phone.trim() && !E164.test(f.phone.trim())) return "vcardPhone";
  if (f.email.trim() && !isValidEmail(f.email)) return "vcardEmail";
  if (f.url.trim() && !validateDestinationUrl(f.url.trim(), { allowHttp: true }).ok) return "vcardUrl";
  return null;
}

// ─── Recognising and validating a stored value ───────────────────────────────

/** Which kind a stored value is. Anything not email/phone/vCard is treated as a link. */
export function contentKindOf(raw: string | null | undefined): ChipContentKind {
  const value = (raw ?? "").trim();
  if (/^mailto:/i.test(value)) return "email";
  if (/^tel:/i.test(value)) return "phone";
  if (/^BEGIN:VCARD/i.test(value)) return "vcard";
  return "url";
}

export type ChipContentValidation =
  | { ok: true; kind: ChipContentKind; value: string }
  | { ok: false; error: string };

/**
 * Validates any kind. Links go through validateDestinationUrl (https only, no
 * javascript:/data:); the others are rebuilt from their parsed fields, so what
 * is stored is always in the canonical form the builders produce.
 */
export function validateChipContent(raw: string | null | undefined, opts: { allowHttp?: boolean } = {}): ChipContentValidation {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Destination is required" };
  if (value.length > CHIP_CONTENT_MAX) return { ok: false, error: "Destination is too long" };
  const kind = contentKindOf(value);
  switch (kind) {
    case "email": {
      const { email, subject } = parseMailto(value);
      if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address" };
      return { ok: true, kind, value: buildMailto(email, subject) };
    }
    case "phone": {
      const phone = parseTel(value);
      if (!E164.test(phone)) return { ok: false, error: "Enter a valid phone number with its country code" };
      return { ok: true, kind, value: buildTel(phone) };
    }
    case "vcard": {
      if (!/END:VCARD\s*$/i.test(value)) return { ok: false, error: "The contact card is incomplete" };
      const fields = parseVCard(value);
      const problem = vcardProblem(fields);
      if (problem) return { ok: false, error: `The contact card is not valid (${problem})` };
      return { ok: true, kind, value: buildVCard(fields) };
    }
    default: {
      const result = validateDestinationUrl(value, opts);
      return result.ok ? { ok: true, kind: "url", value: result.url } : result;
    }
  }
}

/** A short line for lists: the address, the number, the contact's name, or the link. */
export function contentSummary(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  switch (contentKindOf(value)) {
    case "email":
      return parseMailto(value).email;
    case "phone":
      return parseTel(value);
    case "vcard":
      return vcardName(parseVCard(value)) || "vCard";
    default:
      return value;
  }
}

/** UTF-8 size: a chip's memory is counted in bytes (NTAG213 holds ~137, NTAG215 ~492, NTAG216 ~868). */
export function contentBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}
