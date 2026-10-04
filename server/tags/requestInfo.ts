import crypto from "crypto";
import { normalizeIpKey } from "./rateLimit.js";

// Request classification for tag interaction events. Deliberately coarse:
// device/OS/browser family only, no raw IP, no persistent fingerprint.

const BOT_RE =
  /bot\b|bot\/|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|facebookcatalog|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|twitterbot|embedly|skypeuripreview|preview|headless|phantomjs|lighthouse|pagespeed|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww|node-fetch|axios\/|undici|postman|insomnia|uptime|monitor|pingdom|statuscake|scanner|nmap|zgrab|masscan/i;

/** True for crawlers, link-preview fetchers, monitors and scripted clients. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return BOT_RE.test(ua);
}

export function deviceTypeFromUserAgent(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/iPhone|iPod|Android.*Mobile|Mobile Safari|BlackBerry|Windows Phone|Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

export function osFamilyFromUserAgent(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

export function browserFamilyFromUserAgent(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/FxiOS|Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

let warnedMissingSecret = false;

function hashSecret(): string {
  const secret = process.env.TAG_HASH_SECRET?.trim();
  if (secret) return secret;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn("[tags] TAG_HASH_SECRET is not set; approximate unique counts derive their HMAC key from SESSION_SECRET");
  }
  // Derived from another server-only secret so uniques still work without
  // reusing that secret directly as this HMAC key.
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "xpot-tag-dev-secret")
    .update("xpot-tag-visitor-day-key")
    .digest("hex");
}

/**
 * HMAC_SHA256(secret, normalizedIp | userAgent | YYYY-MM-DD).
 * The date is part of the input, so the key changes every UTC day and cannot
 * link one visitor across days. Used only for approximate unique counts.
 */
export function visitorDayKey(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
  now: Date = new Date(),
  secret: string = hashSecret(),
): string {
  const day = now.toISOString().slice(0, 10);
  return crypto
    .createHmac("sha256", secret)
    .update(`${normalizeIpKey(ip)}|${userAgent ?? ""}|${day}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Country only from a header a trusted edge sets (e.g. Cloudflare's
 * CF-IPCountry). Opt-in through TAG_COUNTRY_HEADER, because behind
 * plain Traefik any client could send that header itself.
 */
export function trustedCountryCode(headers: Record<string, string | string[] | undefined>): string | null {
  const headerName = process.env.TAG_COUNTRY_HEADER?.trim().toLowerCase();
  if (!headerName) return null;
  const raw = headers[headerName];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) && value !== "XX" ? value : null;
}

/** Referrer host only (path/query can carry personal data). */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.slice(0, 255) || null;
  } catch {
    return null;
  }
}
