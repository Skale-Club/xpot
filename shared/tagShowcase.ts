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

/** One bulk pack of a variant: from `quantity` pieces up, each costs `unitPriceCents` (Stuscle's price, smallest pack first). */
export type TagShopPack = {
  quantity: number;
  unitPriceCents: number;
  /** What a guest pays per piece: the real price the discount is measured against. */
  retailUnitPriceCents: number | null;
};

export type TagShopVariant = {
  id: string;
  title: string | null;
  sku: string;
  /** Per piece. On a variant sold in packs, the price at its smallest pack. */
  wholesalePriceCents: number;
  retailPriceCents: number | null;
  /** Option title → value, such as { Color: "Black", Size: "Small" }; empty when Stuscle sent none. */
  options: Record<string, string>;
  /** This variant's own photos; empty means the product's. */
  images: string[];
  /** Empty when the variant is priced flat and sold by the piece. */
  packs: TagShopPack[];
  /** Adds one of this variant to the reader's Stuscle cart and opens the product's wholesale page. */
  url: string;
};

export type TagShopProduct = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  description: string | null;
  images: string[];
  /** The choices a reader makes (Color, Size…), only values some priced variant has. */
  options: Array<{ title: string; values: string[] }>;
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
    description?: unknown;
    images?: unknown;
    options?: Array<{ title?: unknown; values?: unknown }>;
    variants?: Array<{
      id?: unknown;
      title?: unknown;
      sku?: unknown;
      wholesale_price?: unknown;
      retail_price?: unknown;
      options?: unknown;
      images?: unknown;
      packs?: Array<{ quantity?: unknown; unit_price?: unknown; retail_unit_price?: unknown }>;
    }>;
  }>;
};

const toCents = (amount: unknown): number | null => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(str).filter((v): v is string => v !== null) : []);

/** Stuscle's { Color: "Black" } map, keeping only text values. */
function toOptions(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [key, value] of Object.entries(raw)) { const v = str(value); if (v) out[key] = v; }
  return out;
}

/** Stuscle's packs, smallest first. A pack it cannot price is dropped, and a repeated size keeps its first price. */
function toPacks(raw: unknown): TagShopPack[] {
  const packs = new Map<number, TagShopPack>();
  for (const pack of Array.isArray(raw) ? raw : []) {
    const quantity = pack?.quantity;
    const unit = toCents(pack?.unit_price);
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > TAG_SHOWCASE_MAX_QUANTITY || unit === null || unit <= 0) continue;
    if (!packs.has(quantity)) packs.set(quantity, { quantity, unitPriceCents: unit, retailUnitPriceCents: toCents(pack?.retail_unit_price) });
  }
  return Array.from(packs.values()).sort((a, b) => a.quantity - b.quantity);
}

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
      const packs = toPacks(v?.packs);
      // On a variant sold in packs the price shown first is its smallest pack's, whatever the flat field says.
      const wholesale = packs[0]?.unitPriceCents ?? toCents(v?.wholesale_price);
      if (!sku || !variantId || !SKU.test(sku) || wholesale === null || wholesale <= 0) continue;
      variants.push({
        id: variantId,
        title: str(v.title),
        sku,
        wholesalePriceCents: wholesale,
        retailPriceCents: packs[0] ? packs[0].retailUnitPriceCents ?? toCents(v.retail_price) : toCents(v.retail_price),
        options: toOptions(v.options),
        images: strings(v.images),
        packs,
        url: stuscleKitUrl(storeBaseUrl, code, [{ sku, quantity: 1 }]),
      });
    }
    const options = (Array.isArray(raw.options) ? raw.options : []).flatMap((o) => { const title = str(o?.title); const values = strings(o?.values); return title && values.length ? [{ title, values }] : []; });
    if (variants.length) products.push({ id, title, handle, thumbnail: str(raw.thumbnail), description: str(raw.description), images: strings(raw.images), options, variants });
  }
  return { currency, products };
}

/** The photo a card shows for a variant: its own, else the product's, else the thumbnail. */
export function shopPictureFor(product: Pick<TagShopProduct, "images" | "thumbnail">, variant: Pick<TagShopVariant, "images">): string | null {
  return variant.images[0] ?? product.images[0] ?? product.thumbnail;
}

/** The quantity a card opens on: a variant sold in packs starts on its smallest, a flat one on a single piece. */
export function shopStartQuantity(variant: Pick<TagShopVariant, "packs">): number {
  return variant.packs[0]?.quantity ?? 1;
}

/**
 * What `quantity` of a variant costs at wholesale, against the same pieces at retail, at the price of the pack that
 * quantity falls into (the largest pack not above it; a flat variant has one price). `retailCents`, `saveCents` and
 * `percentOff` are null when Stuscle gave no retail price or it is not above the wholesale one. For display only:
 * the cart is priced by Stuscle.
 */
export function shopTotals(
  variant: Pick<TagShopVariant, "wholesalePriceCents" | "retailPriceCents" | "packs">,
  quantity: number,
): { quantity: number; unitCents: number; wholesaleCents: number; retailCents: number | null; saveCents: number | null; percentOff: number | null } {
  const qty = Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(quantity) || 1));
  const pack = [...variant.packs].reverse().find((p) => p.quantity <= qty) ?? variant.packs[0];
  const unitCents = pack?.unitPriceCents ?? variant.wholesalePriceCents;
  const retailUnit = pack ? pack.retailUnitPriceCents ?? variant.retailPriceCents : variant.retailPriceCents;
  const wholesaleCents = unitCents * qty;
  if (retailUnit === null || retailUnit <= unitCents) return { quantity: qty, unitCents, wholesaleCents, retailCents: null, saveCents: null, percentOff: null };
  const retailCents = retailUnit * qty;
  return { quantity: qty, unitCents, wholesaleCents, retailCents, saveCents: retailCents - wholesaleCents, percentOff: Math.round(((retailUnit - unitCents) / retailUnit) * 100) };
}

/** Stuscle's names for the app's languages, for the `lang` of a link (docs/WHOLESALE-XPOT-SHOP.md); none for any other. */
export function stuscleLang(lang: string | null | undefined): string | null {
  return lang === "en" ? "en" : lang === "pt" ? "pt-BR" : lang === "es" ? "es" : null;
}

/** A variant's cart link for `quantity` pieces instead of one, in the reseller's language (the reseller picks the pack in the Shop). */
export function shopLinkWithQuantity(variant: Pick<TagShopVariant, "url" | "sku">, quantity: number, lang?: string | null): string {
  const qty = Math.min(TAG_SHOWCASE_MAX_QUANTITY, Math.max(1, Math.floor(quantity) || 1));
  const url = new URL(variant.url);
  url.searchParams.set("items", `${variant.sku}:${qty}`);
  const language = stuscleLang(lang);
  if (language) url.searchParams.set("lang", language);
  return url.toString();
}

/** The sections of Stuscle's wholesale catalogue (its lib/util/wholesale-sections.ts): stands, plates, then anything else, by SKU. */
export type ShopSectionKey = "stands" | "plates" | "other";

export function shopSectionOf(product: Pick<TagShopProduct, "variants">): ShopSectionKey {
  const skus = product.variants.map((v) => v.sku.toUpperCase());
  if (skus.some((s) => s.startsWith("NFC-STAND-"))) return "stands";
  if (skus.some((s) => s.startsWith("NFC-PLATE-"))) return "plates";
  return "other";
}

/** The NFC chip is not a choice a reseller makes: its option is not shown, and a pack holds the rigid disc (a SKU with no -R25 / -RECT) unless a link names another. */
const HIDDEN_OPTIONS = new Set(["nfc"]);
export const isShopOptionShown = (title: string): boolean => !HIDDEN_OPTIONS.has(title.trim().toLowerCase());
export const isDefaultChip = (sku: string): boolean => !/-(R25|RECT)(-|$)/i.test(sku);

/** The variant to open on: the default chip, so the hidden NFC option never decides it. */
export function shopDefaultVariant(product: Pick<TagShopProduct, "variants">): TagShopVariant {
  return product.variants.find((v) => isDefaultChip(v.sku)) ?? product.variants[0];
}

/**
 * The variant with this option value that keeps the most of the other shown choices, and among those the default chip
 * (Stuscle's pickOption). Null when no variant has the value.
 */
export function shopPickOption(product: Pick<TagShopProduct, "options" | "variants">, current: TagShopVariant, title: string, value: string): TagShopVariant | null {
  const shown = product.options.filter((o) => isShopOptionShown(o.title) && o.title !== title);
  const score = (v: TagShopVariant) => shown.filter((o) => v.options[o.title] === current.options[o.title]).length * 2 + Number(isDefaultChip(v.sku));
  return product.variants.filter((v) => v.options[title] === value).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Other products of the same section first (other stands under a stand), then the rest: "You might also be interested in". */
export function shopRelated(products: TagShopProduct[], current: TagShopProduct, max: number): TagShopProduct[] {
  const section = shopSectionOf(current);
  const others = products.filter((p) => p.id !== current.id);
  return [...others.filter((p) => shopSectionOf(p) === section), ...others.filter((p) => shopSectionOf(p) !== section)].slice(0, max);
}

/**
 * What it takes to start buying a variant, as Stuscle's wholesale cards price it: its smallest pack in full against the
 * same pieces at retail (or one piece when it is sold by the piece). `retailCents` and `percentOff` are null with no saving.
 */
export function shopStartingOffer(variant: Pick<TagShopVariant, "wholesalePriceCents" | "retailPriceCents" | "packs">): { quantity: number; totalCents: number; retailCents: number | null; percentOff: number | null } {
  const totals = shopTotals(variant, shopStartQuantity(variant));
  return { quantity: totals.quantity, totalCents: totals.wholesaleCents, retailCents: totals.retailCents, percentOff: totals.percentOff };
}

/** The variant a card prices from: the one that is cheapest to start buying. */
export function shopStartingVariant(product: Pick<TagShopProduct, "variants">): TagShopVariant {
  return product.variants.reduce((a, b) => (shopStartingOffer(b).totalCents < shopStartingOffer(a).totalCents ? b : a));
}
