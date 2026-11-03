// Tags › Shop: what the Xpot admin shows resellers. Xpot sells nothing itself: the Stuscle store is the sales engine
// (docs: Wholesale), so an entry only describes a piece model or a ready-made kit and sends the reseller there, straight
// into the cart when it carries Stuscle SKUs (a kit must; a model usually has its one SKU).
// Pure, no I/O: the server validates with these schemas and the app types its form from them.

import { z } from "zod";
import { stuscleKitUrl, wholesaleUrl } from "./wholesale.js";

export const TAG_SHOWCASE_KINDS = ["model", "kit"] as const;
export type TagShowcaseKind = (typeof TAG_SHOWCASE_KINDS)[number];

/** The languages an entry can be written in besides its main one (English). */
export const TAG_SHOWCASE_LANGS = ["pt", "es"] as const;
export type TagShowcaseLang = (typeof TAG_SHOWCASE_LANGS)[number];

export const TAG_SHOWCASE_MAX_ITEMS = 20;
export const TAG_SHOWCASE_MAX_QUANTITY = 10_000;

/** What a Stuscle SKU may look like: ":" and "," separate items in the link, so they are never part of one. */
const SKU = /^[A-Za-z0-9._-]{1,120}$/;

export type TagShowcaseLine = { sku: string; quantity: number };

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullable().optional());

const lineSchema = z.object({
  sku: z.string().trim().regex(SKU, "Use the SKU exactly as it is in Stuscle"),
  quantity: z.number().int().positive().max(TAG_SHOWCASE_MAX_QUANTITY),
}).strict();

/** An entry's words in one other language: any of the three, the rest falls back to the main text. */
const translationSchema = z.object({
  title: z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.string().max(120).optional()),
  description: z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.string().max(1000).optional()),
  includes: z.array(z.string().trim().min(1).max(160)).max(TAG_SHOWCASE_MAX_ITEMS).optional(),
}).strict();

export const tagShowcaseInputSchema = z.object({
  kind: z.enum(TAG_SHOWCASE_KINDS),
  title: z.string().trim().min(1, "Give it a title").max(120),
  description: optionalText(1000),
  includes: z.array(z.string().trim().min(1).max(160)).max(TAG_SHOWCASE_MAX_ITEMS).default([]),
  imageUrl: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : v),
    z.string().url("The picture must be a web address").max(1000).refine((u) => /^https:\/\//i.test(u), "Use an https address").nullable().optional(),
  ),
  items: z.array(lineSchema).max(TAG_SHOWCASE_MAX_ITEMS).default([]),
  translations: z.object({ pt: translationSchema.optional(), es: translationSchema.optional() }).strict().default({}),
  referencePriceCents: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  sortOrder: z.number().int().min(-1000).max(100_000).default(0),
  isPublished: z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
  if (input.kind === "kit" && input.items.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "A kit needs at least one Stuscle SKU" });
  }
  const seen = new Set<string>();
  input.items.forEach((line, index) => {
    const key = line.sku.toUpperCase();
    if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "sku"], message: "This SKU is already in the kit" });
    seen.add(key);
  });
});

export const tagShowcasePatchSchema = tagShowcaseInputSchema.innerType().partial().strict();

export type TagShowcaseInput = z.infer<typeof tagShowcaseInputSchema>;
export type TagShowcaseTranslations = TagShowcaseInput["translations"];

/** A showcase entry as the app reads it. `url` is where its button goes, with the reader's own wholesale code. */
export type TagShowcaseItem = {
  id: string;
  kind: TagShowcaseKind;
  title: string;
  description: string | null;
  includes: string[];
  imageUrl: string | null;
  items: TagShowcaseLine[];
  translations: TagShowcaseTranslations;
  referencePriceCents: number | null;
  currency: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TagShowcaseView = TagShowcaseItem & { url: string };

/**
 * The entry as a reader of `lang` should see it: each of title, description and "what's inside" in their language
 * when the admin typed it, the main (English) text otherwise. English and any other language read the main text.
 */
export function showcaseInLanguage<T extends Pick<TagShowcaseItem, "title" | "description" | "includes" | "translations">>(item: T, lang: string | null | undefined): T {
  const words = lang === "pt" || lang === "es" ? item.translations?.[lang] : undefined;
  if (!words) return item;
  return {
    ...item,
    title: words.title || item.title,
    description: words.description || item.description,
    includes: words.includes && words.includes.length > 0 ? words.includes : item.includes,
  };
}

/** Whether an entry's button puts it in the Stuscle cart: a kit always, a model once it has its SKU. */
export function showcaseAddsToCart(item: Pick<TagShowcaseItem, "items">): boolean {
  return item.items.length > 0;
}

/** Where an entry's button goes for the reseller holding `code`: its SKUs into the cart, or else the wholesale store. */
export function showcaseUrl(item: Pick<TagShowcaseItem, "items">, storeBaseUrl: string, code: string): string {
  return showcaseAddsToCart(item) ? stuscleKitUrl(storeBaseUrl, code, item.items) : wholesaleUrl(storeBaseUrl, code);
}

// The Stuscle wholesale catalogue, as the Shop shows it. Xpot reads it from Stuscle (server to server) so the Shop
// always lists exactly what resellers can buy at wholesale, with no typing on this side. Prices are Stuscle's, for
// display; the cart gets its price from Stuscle when the link adds the piece.

export type TagShopVariant = {
  id: string;
  title: string | null;
  sku: string;
  wholesalePriceCents: number;
  retailPriceCents: number | null;
  /** Adds one of this variant to the reader's Stuscle cart and opens the product's wholesale page. */
  url: string;
};

export type TagShopProduct = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  variants: TagShopVariant[];
};

export type TagShopCatalog =
  | { status: "ok"; currency: string; products: TagShopProduct[] }
  /** Stuscle is not wired up here (no secret), or could not be read right now: the Shop shows only the entries. */
  | { status: "not_configured" | "unavailable"; currency: string; products: [] };

type StuscleCatalogBody = {
  currency_code?: unknown;
  products?: Array<{
    id?: unknown;
    title?: unknown;
    handle?: unknown;
    thumbnail?: unknown;
    variants?: Array<{ id?: unknown; title?: unknown; sku?: unknown; wholesale_price?: unknown; retail_price?: unknown }>;
  }>;
};

const toCents = (amount: unknown): number | null => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * Stuscle's `GET /xpot/wholesale-catalog` answer → the Shop's products, each variant with the link that puts it in
 * the cart of the reseller holding `code`. Anything malformed is dropped rather than shown wrong: a variant with no
 * SKU the link can carry, or no wholesale price, and a product left with no variant.
 */
export function toShopProducts(body: unknown, storeBaseUrl: string, code: string): { currency: string; products: TagShopProduct[] } {
  const data = (body ?? {}) as StuscleCatalogBody;
  const currency = (str(data.currency_code) ?? "usd").toUpperCase();
  const products: TagShopProduct[] = [];
  for (const raw of Array.isArray(data.products) ? data.products : []) {
    const id = str(raw?.id);
    const title = str(raw?.title);
    const handle = str(raw?.handle);
    if (!id || !title || !handle) continue;
    const variants: TagShopVariant[] = [];
    for (const v of Array.isArray(raw.variants) ? raw.variants : []) {
      const sku = str(v?.sku);
      const variantId = str(v?.id);
      const wholesale = toCents(v?.wholesale_price);
      if (!sku || !variantId || !SKU.test(sku) || wholesale === null || wholesale <= 0) continue;
      variants.push({
        id: variantId,
        title: str(v.title),
        sku,
        wholesalePriceCents: wholesale,
        retailPriceCents: toCents(v.retail_price),
        url: stuscleKitUrl(storeBaseUrl, code, [{ sku, quantity: 1 }]),
      });
    }
    if (variants.length) products.push({ id, title, handle, thumbnail: str(raw.thumbnail), variants });
  }
  return { currency, products };
}

/** The quantities offered as one-tap packs on a product card. */
export const TAG_SHOP_PACKS = [10, 25, 50, 100] as const;

/**
 * What `quantity` of a variant costs at wholesale, against the same pieces at retail. `retailCents` and `saveCents` are
 * null when Stuscle gave no retail price, or it is not above the wholesale one. For display only: the cart is priced by Stuscle.
 */
export function shopLineTotals(
  variant: Pick<TagShopVariant, "wholesalePriceCents" | "retailPriceCents">,
  quantity: number,
): { wholesaleCents: number; retailCents: number | null; saveCents: number | null } {
  const qty = Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(quantity) || 1));
  const wholesaleCents = variant.wholesalePriceCents * qty;
  const retail = variant.retailPriceCents;
  if (retail === null || retail <= variant.wholesalePriceCents) return { wholesaleCents, retailCents: null, saveCents: null };
  const retailCents = retail * qty;
  return { wholesaleCents, retailCents, saveCents: retailCents - wholesaleCents };
}

/** A variant's cart link for `quantity` pieces instead of one (the reseller picks how many in the Shop). */
export function shopLinkWithQuantity(variant: Pick<TagShopVariant, "url" | "sku">, quantity: number): string {
  const qty = Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(quantity) || 1));
  const url = new URL(variant.url);
  url.searchParams.set("items", `${variant.sku}:${qty}`);
  return url.toString();
}
