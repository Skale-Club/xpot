// Tags › Shop: the showcase entries the Xpot admin keeps and the links their buttons open. Xpot sells nothing, so
// the links are the contract with Stuscle: the reseller's own wholesale code, and for a kit the SKUs to put in the
// cart (never a price).
import { describe, expect, it } from "vitest";
import { showcaseUrl, tagShowcaseInputSchema, tagShowcasePatchSchema } from "../shared/tagShowcase";
import { stuscleKitUrl, wholesaleUrl } from "../shared/wholesale";

const CODE = "XPABCD1234";
const BASE = "https://stuscle.com";

describe("stuscleKitUrl", () => {
  it("carries the formatted code and the SKUs, and no price", () => {
    const url = new URL(stuscleKitUrl(BASE, CODE, [{ sku: "KIT-POKEMON-48-STARTER", quantity: 1 }, { sku: "KEYCHAIN-NFC", quantity: 24 }]));
    expect(url.origin + url.pathname).toBe("https://stuscle.com/wholesale/kit");
    expect(url.searchParams.get("code")).toBe("XP-ABCD-1234");
    expect(url.searchParams.get("items")).toBe("KIT-POKEMON-48-STARTER:1,KEYCHAIN-NFC:24");
    expect([...url.searchParams.keys()].sort()).toEqual(["code", "items"]);
  });
  it("tolerates a trailing slash on the store address", () => {
    expect(stuscleKitUrl("https://stuscle.com/", CODE, [{ sku: "A", quantity: 2 }]).startsWith("https://stuscle.com/wholesale/kit?")).toBe(true);
  });
});

describe("showcaseUrl", () => {
  it("sends a model to the wholesale page and a kit to its cart link", () => {
    expect(showcaseUrl({ kind: "model", items: [] }, BASE, CODE)).toBe(wholesaleUrl(BASE, CODE));
    const kit = { kind: "kit" as const, items: [{ sku: "KIT-SOCCER-24-STARTER", quantity: 1 }] };
    expect(showcaseUrl(kit, BASE, CODE)).toBe(stuscleKitUrl(BASE, CODE, kit.items));
  });
  it("falls back to the wholesale page for a kit that lost its SKUs", () => {
    expect(showcaseUrl({ kind: "kit", items: [] }, BASE, CODE)).toBe(wholesaleUrl(BASE, CODE));
  });
});

describe("tagShowcaseInputSchema", () => {
  const kit = { kind: "kit", title: "Starter kit", items: [{ sku: "KIT-POKEMON-48-STARTER", quantity: 1 }] };
  it("accepts a kit with SKUs and fills the defaults", () => {
    const parsed = tagShowcaseInputSchema.parse(kit);
    expect(parsed).toMatchObject({ includes: [], sortOrder: 0, isPublished: false });
  });
  it("refuses a kit with no SKU, a repeated SKU, or a SKU that would break the link", () => {
    expect(tagShowcaseInputSchema.safeParse({ ...kit, items: [] }).success).toBe(false);
    expect(tagShowcaseInputSchema.safeParse({ ...kit, items: [{ sku: "A", quantity: 1 }, { sku: "a", quantity: 2 }] }).success).toBe(false);
    for (const sku of ["A:1", "A,B", "A B", ""]) expect(tagShowcaseInputSchema.safeParse({ ...kit, items: [{ sku, quantity: 1 }] }).success).toBe(false);
  });
  it("refuses a bad quantity", () => {
    for (const quantity of [0, -1, 1.5, 10_001]) expect(tagShowcaseInputSchema.safeParse({ ...kit, items: [{ sku: "A", quantity }] }).success).toBe(false);
  });
  it("lets a model have no SKUs and requires an https picture", () => {
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand" }).success).toBe(true);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "http://x.test/a.png" }).success).toBe(false);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "https://x.test/a.png" }).success).toBe(true);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "" }).success).toBe(true);
  });
  it("a patch keeps untouched fields undefined instead of resetting them to the defaults", () => {
    expect(tagShowcasePatchSchema.parse({ title: "New title" })).toEqual({ title: "New title" });
  });
});
