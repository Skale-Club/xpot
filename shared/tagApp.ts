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

// ─── Social profiles typed as a handle ────────────────────────────────────────

/** Networks whose link the app builds from a handle, so nobody types the domain. */
export const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** What precedes the handle in each network's profile link. */
export const SOCIAL_PREFIX: Record<SocialNetwork, string> = {
  instagram: "instagram.com/",
  facebook: "facebook.com/",
  tiktok: "tiktok.com/@",
  whatsapp: "wa.me/",
};

const NETWORK_HOSTS: Record<SocialNetwork, readonly string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  whatsapp: ["wa.me", "whatsapp.com"],
};

export function isSocialNetwork(value: string | null | undefined): value is SocialNetwork {
  return (SOCIAL_NETWORKS as readonly string[]).includes(value ?? "");
}

/** The network a profile link belongs to, or null for any other link. */
export function socialNetworkOf(rawUrl: string | null | undefined): SocialNetwork | null {
  const host = hostOf(normalizeUrlInput(rawUrl))?.replace(/^www\./, "");
  if (!host) return null;
  return SOCIAL_NETWORKS.find((n) => hostMatches(host, NETWORK_HOSTS[n])) ?? null;
}

/**
 * Typed text is a link (not a handle) when it has a scheme or a path after a
 * domain. "celes.confections" stays a handle: Instagram allows dots in names.
 */
export function looksLikeLink(text: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(www\.)?[^\s/@]+\.[a-z]{2,}\//i.test(text);
}

/**
 * The profile link for what was typed: a handle ("@celesconfections",
 * "celesconfections", a phone for WhatsApp) becomes the network's link; a whole
 * pasted link is kept as is. Empty stays empty.
 */
export function socialUrl(network: SocialNetwork, typed: string): string {
  const text = typed.trim();
  if (!text) return "";
  if (looksLikeLink(text)) return normalizeUrlInput(text);
  const handle = network === "whatsapp" ? text.replace(/\D/g, "") : text.replace(/^@+/, "").replace(/\s+/g, "");
  return handle ? `https://${SOCIAL_PREFIX[network]}${handle}` : "";
}

/**
 * A phone typed for WhatsApp, masked as it is read: "+1 (305) 555-0142" for
 * the US/Canada, "+55 (11) 99999-9999" for Brazil, "+<digits>" otherwise.
 * Takes digits (anything else is dropped), country code first.
 */
export function formatPhoneMask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 15);
  if (!d) return "";
  if (d.startsWith("1")) {
    const n = d.slice(1, 11);
    // Bare "+1" until the area code starts, so backspace never fights a "(".
    if (!n) return "+1";
    if (n.length <= 3) return `+1 (${n}`;
    if (n.length <= 6) return `+1 (${n.slice(0, 3)}) ${n.slice(3)}`;
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (d.startsWith("55")) {
    const n = d.slice(2, 13);
    if (!n) return "+55";
    if (n.length <= 2) return `+55 (${n}`;
    const local = n.slice(2);
    const split = local.length > 8 ? 5 : 4;
    return local.length <= split ? `+55 (${n.slice(0, 2)}) ${local}` : `+55 (${n.slice(0, 2)}) ${local.slice(0, split)}-${local.slice(split)}`;
  }
  return `+${d}`;
}

/** The handle inside a profile link of that network, for editing it again. */
export function socialHandleOf(network: SocialNetwork, rawUrl: string | null | undefined): string {
  if (socialNetworkOf(rawUrl) !== network) return "";
  let url: URL;
  try {
    url = new URL(normalizeUrlInput(rawUrl));
  } catch {
    return "";
  }
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return decodeURIComponent(first).replace(/^@/, "");
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

// ─── "My pieces" filters ──────────────────────────────────────────────────────

/** A set-up piece (linked or live) whose chip holds nothing yet: the dashboard's "chip not written" alert. */
export function chipNeedsWriting(tag: { status: string; nfcStatus: string }): boolean {
  return (tag.status === "assigned" || tag.status === "active") && (tag.nfcStatus === "not_programmed" || tag.nfcStatus === "failed");
}

/** Where the piece is in its life. "setup": not live yet (in the kit, or linked without a link). */
export const PIECE_STATUS_FILTERS = ["all", "setup", "active", "off"] as const;
export type PieceStatusFilter = (typeof PIECE_STATUS_FILTERS)[number];
/** Whether a financial sale was recorded; independent of the status. */
export const PIECE_SALE_FILTERS = ["all", "sold", "unsold"] as const;
export type PieceSaleFilter = (typeof PIECE_SALE_FILTERS)[number];

export interface PieceFilters {
  status: PieceStatusFilter;
  sale: PieceSaleFilter;
  /** "missing": only pieces whose chip still needs writing (chipNeedsWriting). */
  chip: "all" | "missing";
}

/**
 * Reads the list's URL values. Older links mixed both axes in `status`
 * ("stock" meant unsold, "sold" meant sold); they still land on the same pieces.
 */
export function parsePieceFilters(values: { status?: string | null; sale?: string | null; chip?: string | null }): PieceFilters {
  const legacySale = values.status === "stock" ? "unsold" : values.status === "sold" ? "sold" : null;
  const status = (PIECE_STATUS_FILTERS as readonly string[]).includes(values.status ?? "") ? values.status as PieceStatusFilter : "all";
  const sale = (PIECE_SALE_FILTERS as readonly string[]).includes(values.sale ?? "") ? values.sale as PieceSaleFilter : legacySale ?? "all";
  return { status, sale, chip: values.chip === "missing" ? "missing" : "all" };
}

export function matchesPieceFilters(
  tag: { status: string; saleId: number | null; nfcStatus: string },
  filters: PieceFilters,
): boolean {
  if (filters.status === "setup" && tag.status !== "inventory" && tag.status !== "assigned") return false;
  if (filters.status === "active" && tag.status !== "active") return false;
  if (filters.status === "off" && tag.status !== "disabled") return false;
  if (filters.sale === "sold" && !tag.saleId) return false;
  if (filters.sale === "unsold" && tag.saleId) return false;
  if (filters.chip === "missing" && !chipNeedsWriting(tag)) return false;
  return true;
}
