// Xpot Tags field app (the "Tags" side of the Xpot app) — pure rules shared
// by the app and the server: what a scanned/tapped payload is, and what kind
// of destination a link is.
//
// Two kinds of physical piece exist and must never be confused:
//   xpot   — the chip/QR holds https://<tag domain>/n|q/<code>; the destination
//            lives in the database and changes without touching the chip.
//   direct — the chip holds the customer's own URL; changing it means
//            rewriting the chip, and there are no analytics.

import { normalizeTagCode, type TagAccessMethod, type TagDestinationType } from "./tags.js";
import { contentKindOf } from "./chipContent.js";

/** The Tags module inside the Xpot app. */
export const TAGS_APP_PATH = "/tags";

export type ScanClassification =
  | { kind: "xpot"; code: string; method: TagAccessMethod | null }
  | { kind: "direct"; url: string }
  | { kind: "text"; text: string }
  | { kind: "empty" };

/** Hosts whose /n and /q links are Xpot tags. */
const TAG_HOSTS = ["xpot.place", "www.xpot.place"];

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Adds https:// to a link typed without a scheme ("cliente.com/menu"). */
export function normalizeUrlInput(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return /^[^\s/]+\.[^\s/]+/.test(value) ? `https://${value}` : value;
}

/**
 * Classifies what came out of an NFC chip, a QR code or the manual field.
 * `extraHosts` lets staging/local builds (and a configured tag domain)
 * recognise their own /n and /q links.
 */
export function classifyScan(raw: string | null | undefined, extraHosts: readonly string[] = []): ScanClassification {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "empty" };
  // An email, phone or contact card written straight on a chip (shared/chipContent.ts).
  if (contentKindOf(value) !== "url") return { kind: "direct", url: value };

  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }

  if (url && (url.protocol === "https:" || url.protocol === "http:")) {
    const hosts = [...TAG_HOSTS, ...extraHosts.map((h) => h.toLowerCase())];
    if (hosts.includes(url.hostname.toLowerCase())) {
      const match = url.pathname.match(/^\/(q|n)\/([^/]+)\/?$/i);
      const code = match ? normalizeTagCode(decodeURIComponent(match[2])) : null;
      if (match && code) return { kind: "xpot", code, method: match[1].toLowerCase() === "q" ? "qr" : "nfc" };
      // The app's own tag screen, e.g. a shared /tags/t/<code> link.
      const own = url.pathname.match(/^\/tags\/t\/([^/]+)\/?$/i);
      const ownCode = own ? normalizeTagCode(decodeURIComponent(own[1])) : null;
      if (ownCode) return { kind: "xpot", code: ownCode, method: null };
    }
    return { kind: "direct", url: url.toString() };
  }

  // A bare code typed from the printed piece ("A7K3P9X2", "a7k3-p9x2").
  // normalizeTagCode alone would also accept phrases like "hello world".
  const code = /^[0-9a-z]{4}[\s-]?[0-9a-z]{4,6}$/i.test(value) ? normalizeTagCode(value) : null;
  if (code) return { kind: "xpot", code, method: null };

  // "cliente.com" typed or stored without a scheme.
  const guessed = normalizeUrlInput(value);
  if (guessed !== value && hostOf(guessed)) return { kind: "direct", url: new URL(guessed).toString() };

  return { kind: "text", text: value };
}

const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.com", "tiktok.com", "linkedin.com", "youtube.com", "youtu.be", "x.com", "twitter.com", "wa.me", "whatsapp.com", "linktr.ee"];
const BOOKING_HOSTS = ["calendly.com", "cal.com", "booksy.com", "squareup.com", "square.site", "fresha.com", "vagaro.com", "setmore.com", "acuityscheduling.com", "xkedule.com"];

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Best guess of the destination type from the link, so the operator rarely has to pick it. */
export function guessDestinationType(rawUrl: string | null | undefined): TagDestinationType {
  const kind = contentKindOf(rawUrl);
  if (kind !== "url") return kind;
  const value = normalizeUrlInput(rawUrl);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "website";
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  if (host === "g.page" || host === "search.google.com" || path.includes("writereview")) return "google_review";
  if ((host === "google.com" || host.endsWith(".google.com") || host === "maps.app.goo.gl" || host === "goo.gl") && /review|maps|place/.test(`${host}${path}${url.search}`)) {
    return "google_review";
  }
  if (hostMatches(host, SOCIAL_HOSTS)) return "social";
  if (hostMatches(host, BOOKING_HOSTS) || /\/(book|booking|agendar|agendamento|schedule)\b/.test(path)) return "booking";
  if (/\/(menu|cardapio)\b/.test(path)) return "menu";
  if (/\/vcard\b/.test(path) || path.endsWith(".vcf")) return "vcard";
  return "website";
}

// ─── Direct (customer-link) pieces ────────────────────────────────────────────

/** How a direct link reached the chip: written by the phone, or copied into another app. */
export const DIRECT_WRITE_METHODS = ["web_nfc", "manual"] as const;
export type DirectWriteMethod = (typeof DIRECT_WRITE_METHODS)[number];

/** What the phone reports after writing an Xpot chip. */
export type PhoneWriteDecision =
  | { ok: true; status: "verified" | "programmed" }
  | { ok: false; status: "failed"; error: string };

/**
 * Same rule as the desktop provisioner: "verified" only when the read-back
 * equals the expected URL exactly. A write with no read-back (iPhone + NFC
 * Tools, or the operator skipped the second tap) is only "programmed".
 */
export function decidePhoneWrite(expectedUrl: string, readbackUrl: string | null | undefined): PhoneWriteDecision {
  if (readbackUrl === null || readbackUrl === undefined || readbackUrl === "") return { ok: true, status: "programmed" };
  if (readbackUrl === expectedUrl) return { ok: true, status: "verified" };
  return { ok: false, status: "failed", error: `Chip holds ${JSON.stringify(readbackUrl)}, expected ${expectedUrl}` };
}
