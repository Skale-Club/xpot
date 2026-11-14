// Tags › Shop: the showcase entries the Xpot admin keeps and the links their buttons open. Xpot sells nothing, so
// the links go to Xpot's open route, which signs a ticket for the reader's own code: for a kit the SKUs to put in the
// cart (never a price, never the code).
import { describe, expect, it } from "vitest";
import { showcaseAddsToCart, showcaseInLanguage, showcaseUrl, tagShowcaseInputSchema, tagShowcasePatchSchema } from "../shared/tagShowcase";
import { stuscleKitUrl, WHOLESALE_OPEN_PATH, wholesaleUrl } from "../shared/wholesale";

describe("stuscleKitUrl", () => {
  it("carries the SKUs to Xpot's open route, and no code or price", () => {
    const url = new URL(stuscleKitUrl([{ sku: "KIT-POKEMON-48-STARTER", quantity: 1 }, { sku: "KEYCHAIN-NFC", quantity: 24 }]), "https://xpot.test");
    expect(url.pathname).toBe(WHOLESALE_OPEN_PATH);
    expect(url.searchParams.get("items")).toBe("KIT-POKEMON-48-STARTER:1,KEYCHAIN-NFC:24");
    expect([...url.searchParams.keys()]).toEqual(["items"]);
  });
});

describe("showcaseUrl", () => {
  it("puts an entry's SKUs in the cart, a kit's and a model's alike", () => {
    const kit = { items: [{ sku: "KIT-SOCCER-24-STARTER", quantity: 1 }] };
    expect(showcaseUrl(kit)).toBe(stuscleKitUrl(kit.items));
    const model = { items: [{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }] };
    expect(showcaseUrl(model)).toBe(stuscleKitUrl(model.items));
    expect(showcaseAddsToCart(model)).toBe(true);
  });
  it("opens the wholesale page for an entry with no SKU", () => {
    expect(showcaseUrl({ items: [] })).toBe(wholesaleUrl());
    expect(showcaseAddsToCart({ items: [] })).toBe(false);
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
  it("lets a model have no SKU or its one SKU, and requires an https picture", () => {
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand" }).success).toBe(true);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", items: [{ sku: "STAND-LARGE-BLACK", quantity: 1 }] }).success).toBe(true);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "http://x.test/a.png" }).success).toBe(false);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "https://x.test/a.png" }).success).toBe(true);
    expect(tagShowcaseInputSchema.safeParse({ kind: "model", title: "Large stand", imageUrl: "" }).success).toBe(true);
  });
  it("a patch keeps untouched fields undefined instead of resetting them to the defaults", () => {
    expect(tagShowcasePatchSchema.parse({ title: "New title" })).toEqual({ title: "New title" });
  });
});
describe("showcaseInLanguage", () => {
  const entry = {
    title: "Large Stand",
    description: "The counter stand customers tap.",
    includes: ["Large Stand", "NFC chip"],
    translations: { pt: { title: "Expositor grande", includes: ["Expositor grande", "Chip NFC"] } },
  };
  it("reads the language's own words where the admin wrote them, and the main text field by field where not", () => {
    expect(showcaseInLanguage(entry, "pt")).toMatchObject({ title: "Expositor grande", description: "The counter stand customers tap.", includes: ["Expositor grande", "Chip NFC"] });
  });
  it("leaves English, a language with nothing typed and anything unknown on the main text", () => {
    for (const lang of ["en", "es", "fr", "", null, undefined]) expect(showcaseInLanguage(entry, lang)).toBe(entry);
  });
  it("accepts translations on an entry, and nothing else in them", () => {
    const base = { kind: "model" as const, title: "Stand" };
    expect(tagShowcaseInputSchema.parse({ ...base, translations: { pt: { title: " Expositor " } } }).translations).toEqual({ pt: { title: "Expositor" } });
    expect(tagShowcaseInputSchema.parse(base).translations).toEqual({});
    expect(tagShowcaseInputSchema.safeParse({ ...base, translations: { fr: { title: "x" } } }).success).toBe(false);
    expect(tagShowcaseInputSchema.safeParse({ ...base, translations: { pt: { price: 1 } } }).success).toBe(false);
  });
});
