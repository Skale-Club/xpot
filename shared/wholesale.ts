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

// The Shop's links. None of them goes to the store or carries a code: each is a path of Xpot itself,
// /api/xpot/wholesale/open, which only answers the signed-in rep and redirects them to Stuscle with a hand-off ticket
// for their own code, valid two minutes and once (server/wholesale/handoff.ts). A copied or forwarded link opens
// nothing for anyone else: it asks them to sign in to Xpot, and then it is their own code or none.

/** Xpot's route that mints the ticket and redirects to Stuscle's /wholesale/kit. */
export const WHOLESALE_OPEN_PATH = "/api/xpot/wholesale/open";

export type WholesaleOpenTarget = {
  /** Fill the cart with these SKUs at the wholesale price (the price is never in the link). */
  items?: ReadonlyArray<{ sku: string; quantity: number }>;
  /** Land on this Stuscle product's wholesale page (its handle), nothing in the cart. */
  product?: string | null;
  /** The reseller's language as Stuscle names it (stuscleLang): en, pt-BR, es. */
  lang?: string | null;
};

/** The open route for `target`; with nothing in it, Stuscle opens the session and lands on the catalogue. */
export function wholesaleOpenUrl(target: WholesaleOpenTarget = {}): string {
  const params = new URLSearchParams();
  if (target.items?.length) params.set("items", target.items.map((item) => `${item.sku}:${item.quantity}`).join(","));
  if (target.product) params.set("product", target.product);
  if (target.lang) params.set("lang", target.lang);
  const query = params.toString();
  return query ? `${WHOLESALE_OPEN_PATH}?${query}` : WHOLESALE_OPEN_PATH;
}

/** `link` (an open route path) with `params` set, still a path of this app. */
export function withOpenParams(link: string, params: Record<string, string>): string {
  const url = new URL(link, "https://xpot.invalid");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.pathname + url.search;
}

/** A ready-made kit: Stuscle checks the ticket, fills the cart with these SKUs at the wholesale price and opens the cart. */
export function stuscleKitUrl(items: ReadonlyArray<{ sku: string; quantity: number }>): string {
  return wholesaleOpenUrl({ items });
}

/** The link a reseller opens with nothing chosen: the session, then the catalogue. */
export function wholesaleUrl(): string {
  return wholesaleOpenUrl();
}

/** The plain link (`wholesaleUrl`) in the reseller's language, when Stuscle knows it; as it was without one. */
export function wholesaleStoreUrl(link: string, lang: string | null): string {
  return lang ? withOpenParams(link, { lang }) : link;
}

/** A product's wholesale page on Stuscle, by its handle, without putting anything in the cart. */
export function stuscleProductUrl(handle: string): string {
  return wholesaleOpenUrl({ product: handle });
}
