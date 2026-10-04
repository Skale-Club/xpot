// Wholesale codes: an approved reseller's key to wholesale prices in the
// Stuscle store. "XP-" + 8 Crockford base32 characters (no I, L, O, U, so a
// code read aloud or typed from a phone can't be mistaken). Stored normalized
// ("XPABCD1234"), shown with hyphens ("XP-ABCD-1234"). Stuscle normalizes the
// same way, so any spacing, case or hyphenation a person types still matches.

export const WHOLESALE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const WHOLESALE_CODE_PREFIX = "XP";
export const WHOLESALE_CODE_LENGTH = 8;

const BODY = new RegExp(`^[${WHOLESALE_CODE_ALPHABET}]{${WHOLESALE_CODE_LENGTH}}$`);

/** "xp-abcd 1234" → "XPABCD1234", or null when it isn't a wholesale code. */
export function normalizeWholesaleCode(input: string | null | undefined): string | null {
  const raw = (input ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!raw.startsWith(WHOLESALE_CODE_PREFIX)) return null;
  const body = raw.slice(WHOLESALE_CODE_PREFIX.length);
  return BODY.test(body) ? raw : null;
}

/** "XPABCD1234" → "XP-ABCD-1234". */
export function formatWholesaleCode(code: string | null | undefined): string {
  const normalized = normalizeWholesaleCode(code);
  if (!normalized) return "";
  const body = normalized.slice(WHOLESALE_CODE_PREFIX.length);
  return `${WHOLESALE_CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** A fresh normalized code from random bytes (server side). */
export function generateWholesaleCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(WHOLESALE_CODE_LENGTH);
  let body = "";
  for (let i = 0; i < WHOLESALE_CODE_LENGTH; i++) body += WHOLESALE_CODE_ALPHABET[bytes[i] % WHOLESALE_CODE_ALPHABET.length];
  return WHOLESALE_CODE_PREFIX + body;
}

/** The store page a reseller lands on, code already filled in. */
export function wholesaleUrl(storeBaseUrl: string, code: string): string {
  return `${storeBaseUrl.replace(/\/+$/, "")}/wholesale?code=${encodeURIComponent(formatWholesaleCode(code))}`;
}
