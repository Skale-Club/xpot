import { createHmac, randomBytes } from "crypto";
import { formatWholesaleCode } from "#shared/wholesale.js";
import { TAG_SHOWCASE_MAX_ITEMS, TAG_SHOWCASE_MAX_QUANTITY } from "#shared/tagShowcase.js";

// The hand-off ticket: how a click in Xpot's Shop opens wholesale on Stuscle. The reseller's code never travels in a
// link anyone can copy; Xpot's server signs a ticket for the signed-in rep's own code, valid two minutes and once
// (Stuscle keeps the jti), and redirects there. Stuscle verifies it byte for byte with the same XPOT_WHOLESALE_SECRET:
//
//   ticket = "h1." + base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, "h1." + base64url(JSON payload)))
//   payload = { code, items?, product?, lang?, iat, exp, jti }   (in that order, absent fields left out)
//
// Stuscle refuses a bad signature, an expired ticket, exp - iat > 300, iat more than 60 s ahead, a jti already used and
// a jti outside [A-Za-z0-9_-]{16,64}.

export const HANDOFF_VERSION = "h1";
export const HANDOFF_TTL_SECONDS = 120;
const MIN_SECRET_LENGTH = 16;

export type WholesaleHandoffClaims = {
  /** The rep's code, in any spelling normalizeWholesaleCode accepts; it is signed as "XP-ABCD-1234". */
  code: string;
  /** `SKU:qty,SKU:qty`, the cart to fill (parseHandoffItems). */
  items?: string;
  /** A Stuscle product handle: land on its wholesale page. */
  product?: string;
  /** Stuscle's name for the reseller's language (stuscleLang): en, pt-BR, es. */
  lang?: string;
};

/** XPOT_WHOLESALE_SECRET when it is long enough to sign with, else null (wholesale is then off). */
export function wholesaleHandoffSecret(): string | null {
  const secret = process.env.XPOT_WHOLESALE_SECRET ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** A ticket for `claims`, issued at `nowMs`. `jti` is random unless a test pins it. */
export function signWholesaleHandoff(claims: WholesaleHandoffClaims, secret: string, nowMs: number = Date.now(), jti: string = randomBytes(16).toString("hex")): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("The wholesale secret is too short to sign with");
  const code = formatWholesaleCode(claims.code);
  if (!code) throw new Error("Not a wholesale code");
  const iat = Math.floor(nowMs / 1000);
  // Built field by field in the order Stuscle's test vector fixes; an absent optional field is left out, never null.
  const payload: Record<string, string | number> = { code };
  if (claims.items) payload.items = claims.items;
  if (claims.product) payload.product = claims.product;
  if (claims.lang) payload.lang = claims.lang;
  payload.iat = iat;
  payload.exp = iat + HANDOFF_TTL_SECONDS;
  payload.jti = jti;
  const body = `${HANDOFF_VERSION}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

// What the Shop may ask Stuscle for. Each is checked before it is signed: a ticket only ever carries what a button builds.
const SKU = /^[A-Za-z0-9._-]{1,120}$/;
const HANDLE = /^[a-z0-9-]{1,200}$/;
export const HANDOFF_LANGS = ["en", "pt-BR", "es"] as const;
const MAX_ITEMS_LENGTH = TAG_SHOWCASE_MAX_ITEMS * 128;

/** `SKU:qty,SKU:qty` as the Shop builds it, rewritten the same way; null for anything else (a repeated SKU included). */
export function parseHandoffItems(raw: string): string | null {
  if (!raw || raw.length > MAX_ITEMS_LENGTH) return null;
  const parts = raw.split(",");
  if (parts.length > TAG_SHOWCASE_MAX_ITEMS) return null;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    const match = /^([^:]+):(\d{1,5})$/.exec(part);
    if (!match || !SKU.test(match[1])) return null;
    const quantity = Number(match[2]);
    if (quantity < 1 || quantity > TAG_SHOWCASE_MAX_QUANTITY) return null;
    const key = match[1].toUpperCase();
    if (seen.has(key)) return null;
    seen.add(key);
    lines.push(`${match[1]}:${quantity}`);
  }
  return lines.join(",");
}

export type HandoffTarget = Omit<WholesaleHandoffClaims, "code">;

/**
 * The open route's query → what the ticket carries, or null when any part is not something the Shop builds (a
 * repeated parameter, a malformed list, an unknown language). Parameters it does not know, `code` among them, are ignored:
 * the code is always the signed-in rep's own.
 */
export function parseHandoffQuery(query: Record<string, unknown>): HandoffTarget | null {
  const target: HandoffTarget = {};
  for (const key of ["items", "product", "lang"] as const) {
    const value = query[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string") return null;
    if (key === "items") {
      const items = parseHandoffItems(value);
      if (!items) return null;
      target.items = items;
    } else if (key === "product") {
      if (!HANDLE.test(value)) return null;
      target.product = value;
    } else {
      if (!(HANDOFF_LANGS as readonly string[]).includes(value)) return null;
      target.lang = value;
    }
  }
  return target;
}
