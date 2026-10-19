// Tags › Shop: what the Xpot admin shows resellers. Xpot sells nothing itself: the Stuscle store is the sales engine
// (docs: Wholesale), so an entry only describes a piece model or a ready-made kit and sends the reseller there.
// Pure, no I/O: the server validates with these schemas and the app types its form from them.

import { z } from "zod";
import { stuscleKitUrl, wholesaleUrl } from "./wholesale.js";

export const TAG_SHOWCASE_KINDS = ["model", "kit"] as const;
export type TagShowcaseKind = (typeof TAG_SHOWCASE_KINDS)[number];

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

/** A showcase entry as the app reads it. `url` is where its button goes, with the reader's own wholesale code. */
export type TagShowcaseItem = {
  id: string;
  kind: TagShowcaseKind;
  title: string;
  description: string | null;
  includes: string[];
  imageUrl: string | null;
  items: TagShowcaseLine[];
  referencePriceCents: number | null;
  currency: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TagShowcaseView = TagShowcaseItem & { url: string };

/** Where an entry's button goes for the reseller holding `code`: a kit fills the cart, a model opens the wholesale store. */
export function showcaseUrl(item: Pick<TagShowcaseItem, "kind" | "items">, storeBaseUrl: string, code: string): string {
  return item.kind === "kit" && item.items.length ? stuscleKitUrl(storeBaseUrl, code, item.items) : wholesaleUrl(storeBaseUrl, code);
}
