// Tags › Shop, the Stuscle half: what Xpot makes of Stuscle's wholesale catalogue, and the links its cards open. The
// links are the contract with Stuscle's /wholesale/kit: the reader's own code and SKU:quantity, never a price.
import { describe, expect, it } from "vitest";
import { shopDefaultVariant, shopLinkWithQuantity, shopPickOption, shopPictureFor, shopRelated, shopSectionOf, shopStartQuantity, shopTotals, stuscleLang, toShopProducts } from "../shared/tagShowcase";
import { stuscleKitUrl } from "../shared/wholesale";

const CODE = "XPABCD1234";
const BASE = "https://stuscle.com";

const plate = {
  id: "prod_plate",
  title: "Google Plate",
  handle: "google-plate",
  thumbnail: "https://cdn.stuscle.com/plate.png",
  variants: [
    { id: "var_black", title: "Small / Black", sku: "PLATE-GOOGLE-SMALL-BLACK", wholesale_price: 8.5, retail_price: 14.99 },
    { id: "var_white", title: "Small / White", sku: "PLATE-GOOGLE-SMALL-WHITE", wholesale_price: 8.5, retail_price: null },
  ],
};

describe("toShopProducts", () => {
  it("turns Stuscle's catalogue into cards with prices in cents and a cart link per variant", () => {
    const { currency, products } = toShopProducts({ currency_code: "usd", products: [plate] }, BASE, CODE);
    expect(currency).toBe("USD");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: "prod_plate", title: "Google Plate", handle: "google-plate", thumbnail: plate.thumbnail });
    expect(products[0].variants[0]).toMatchObject({ sku: "PLATE-GOOGLE-SMALL-BLACK", wholesalePriceCents: 850, retailPriceCents: 1499 });
    expect(products[0].variants[1].retailPriceCents).toBeNull();
    expect(products[0].variants[0].url).toBe(stuscleKitUrl(BASE, CODE, [{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]));
  });

  it("drops what it cannot show right instead of showing it wrong", () => {
    const body = {
      products: [
        { ...plate, variants: [{ id: "v1", sku: null, wholesale_price: 5 }, { id: "v2", sku: "A,B", wholesale_price: 5 }, { id: "v3", sku: "OK", wholesale_price: 0 }] },
        { ...plate, id: "prod_2", handle: "" },
        { ...plate, id: "prod_3", variants: [{ id: "v4", sku: "STAND-LARGE", wholesale_price: 12 }] },
      ],
    };
    const { products } = toShopProducts(body, BASE, CODE);
    expect(products.map((p) => p.id)).toEqual(["prod_3"]);
  });

  it("survives an answer that is not a catalogue", () => {
    for (const body of [null, "nope", { products: "x" }, { products: [null] }]) expect(toShopProducts(body, BASE, CODE).products).toEqual([]);
  });
});

describe("shopLinkWithQuantity", () => {
  const variant = { sku: "PLATE-GOOGLE-SMALL-BLACK", url: stuscleKitUrl(BASE, CODE, [{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]) };

  it("asks for the chosen quantity and keeps the code", () => {
    const url = new URL(shopLinkWithQuantity(variant, 25));
    expect(url.pathname).toBe("/wholesale/kit");
    expect(url.searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:25");
    expect(url.searchParams.get("code")).toBe("XP-ABCD-1234");
  });

  it("keeps the quantity a whole number from 1 to 10,000", () => {
    expect(new URL(shopLinkWithQuantity(variant, 0)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:1");
    expect(new URL(shopLinkWithQuantity(variant, 2.7)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:2");
    expect(new URL(shopLinkWithQuantity(variant, 99_999)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:10000");
  });
});

describe("toShopProducts packs", () => {
  const packed = {
    id: "prod_packed",
    title: "Google Review NFC Plate",
    handle: "google-review-nfc-plate",
    thumbnail: "https://cdn.stuscle.com/thumb.webp",
    images: ["https://cdn.stuscle.com/p1.webp", 7, ""],
    variants: [
      {
        id: "var_s_black",
        title: "Small / Black",
        sku: "NFC-PLATE-GOOGLE-BLACK-S",
        wholesale_price: 99,
        retail_price: 99,
        images: ["https://cdn.stuscle.com/black.webp"],
        packs: [
          { quantity: 50, unit_price: 12, retail_unit_price: 25 },
          { quantity: 10, unit_price: 15, retail_unit_price: 25 },
          { quantity: 25, unit_price: 14, retail_unit_price: 25 },
          { quantity: 25, unit_price: 1, retail_unit_price: 25 },
          { quantity: 0, unit_price: 9 },
          { quantity: 5.5, unit_price: 9 },
          { quantity: 100, unit_price: 0 },
          { quantity: "x", unit_price: 9 },
        ],
      },
    ],
  };

  it("reads the packs smallest first, in cents, and drops the ones it cannot price", () => {
    const [product] = toShopProducts({ products: [packed] }, BASE, CODE).products;
    expect(product.variants[0].packs).toEqual([
      { quantity: 10, unitPriceCents: 1500, retailUnitPriceCents: 2500 },
      { quantity: 25, unitPriceCents: 1400, retailUnitPriceCents: 2500 },
      { quantity: 50, unitPriceCents: 1200, retailUnitPriceCents: 2500 },
    ]);
  });

  it("shows the smallest pack's price first, whatever the flat price says", () => {
    const [variant] = toShopProducts({ products: [packed] }, BASE, CODE).products[0].variants;
    expect(variant.wholesalePriceCents).toBe(1500);
    expect(variant.retailPriceCents).toBe(2500);
  });

  it("keeps photos as clean lists, and a variant priced flat has no packs", () => {
    const { products } = toShopProducts({ products: [packed, plate] }, BASE, CODE);
    expect(products[0].images).toEqual(["https://cdn.stuscle.com/p1.webp"]);
    expect(products[0].variants[0].images).toEqual(["https://cdn.stuscle.com/black.webp"]);
    expect(products[1].images).toEqual([]);
    expect(products[1].variants[0]).toMatchObject({ packs: [], images: [] });
  });
});

describe("shopTotals", () => {
  const packs = [
    { quantity: 10, unitPriceCents: 1500, retailUnitPriceCents: 2500 },
    { quantity: 25, unitPriceCents: 1400, retailUnitPriceCents: 2500 },
    { quantity: 50, unitPriceCents: 1200, retailUnitPriceCents: 2500 },
  ];
  const plate = { wholesalePriceCents: 1500, retailPriceCents: 2500, packs };

  it("prices a pack at its own unit price, against the same pieces at retail", () => {
    expect(shopTotals(plate, 10)).toEqual({ quantity: 10, unitCents: 1500, wholesaleCents: 15_000, retailCents: 25_000, saveCents: 10_000, percentOff: 40 });
    expect(shopTotals(plate, 25)).toMatchObject({ unitCents: 1400, wholesaleCents: 35_000, retailCents: 62_500, saveCents: 27_500, percentOff: 44 });
    expect(shopTotals(plate, 50)).toMatchObject({ unitCents: 1200, wholesaleCents: 60_000, retailCents: 125_000, saveCents: 65_000, percentOff: 52 });
  });

  it("gives a quantity between packs the price of the pack below it, and a larger one the largest pack's", () => {
    expect(shopTotals(plate, 40).unitCents).toBe(1400);
    expect(shopTotals(plate, 120).unitCents).toBe(1200);
  });

  it("falls back to the smallest pack below it", () => {
    expect(shopTotals(plate, 3).unitCents).toBe(1500);
  });

  it("prices a flat variant by the piece", () => {
    expect(shopTotals({ wholesalePriceCents: 850, retailPriceCents: 1499, packs: [] }, 4)).toMatchObject({ unitCents: 850, wholesaleCents: 3400, retailCents: 5996, saveCents: 2596, percentOff: 43 });
  });

  it("shows no retail or saving when there is no retail price or it is not above wholesale", () => {
    expect(shopTotals({ wholesalePriceCents: 850, retailPriceCents: null, packs: [] }, 2)).toMatchObject({ wholesaleCents: 1700, retailCents: null, saveCents: null, percentOff: null });
    expect(shopTotals({ wholesalePriceCents: 850, retailPriceCents: 850, packs: [] }, 2).percentOff).toBeNull();
  });

  it("keeps the quantity a whole number of at least one", () => {
    expect(shopTotals(plate, 0).quantity).toBe(1);
    expect(shopTotals({ wholesalePriceCents: 100, retailPriceCents: null, packs: [] }, 2.9).quantity).toBe(2);
  });
});

describe("what a card opens on", () => {
  it("starts a variant sold in packs on its smallest pack, and a flat one on a single piece", () => {
    expect(shopStartQuantity({ packs: [{ quantity: 5, unitPriceCents: 2500, retailUnitPriceCents: null }, { quantity: 10, unitPriceCents: 2300, retailUnitPriceCents: null }] })).toBe(5);
    expect(shopStartQuantity({ packs: [] })).toBe(1);
  });

  it("shows the variant's own photo, else the product's, else the thumbnail", () => {
    const product = { images: ["p.webp"], thumbnail: "t.webp" };
    expect(shopPictureFor(product, { images: ["v.webp"] })).toBe("v.webp");
    expect(shopPictureFor(product, { images: [] })).toBe("p.webp");
    expect(shopPictureFor({ images: [], thumbnail: "t.webp" }, { images: [] })).toBe("t.webp");
    expect(shopPictureFor({ images: [], thumbnail: null }, { images: [] })).toBeNull();
  });
});

describe("stuscleLang and the language of a link", () => {
  const variant = { sku: "PLATE-GOOGLE-SMALL-BLACK", url: stuscleKitUrl(BASE, CODE, [{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]) };

  it("names the app's languages the way Stuscle does", () => {
    expect([stuscleLang("en"), stuscleLang("pt"), stuscleLang("es")]).toEqual(["en", "pt-BR", "es"]);
    for (const other of ["fr", "", null, undefined]) expect(stuscleLang(other)).toBeNull();
  });

  it("carries the reseller's language, and leaves it out for one Stuscle does not know", () => {
    expect(new URL(shopLinkWithQuantity(variant, 25, "pt")).searchParams.get("lang")).toBe("pt-BR");
    expect(new URL(shopLinkWithQuantity(variant, 25, "fr")).searchParams.has("lang")).toBe(false);
    expect(new URL(shopLinkWithQuantity(variant, 25)).searchParams.has("lang")).toBe(false);
  });
});

// The new catalogue shape: one product per design, its variants Color x Size x NFC chip, the chip never a choice.
describe("options, sections and related products", () => {
  const v = (id: string, sku: string, options: Record<string, string>) => ({ id, title: id, sku, wholesale_price: 15, retail_price: 25, options, packs: [{ quantity: 10, unit_price: 15, retail_unit_price: 25 }] });
  const stand = {
    id: "p1", title: "Google Stand", handle: "google-stand", description: "A stand.",
    options: [{ title: "Color", values: ["White", "Black"] }, { title: "NFC", values: ["Rigid disc", "Round sticker"] }],
    variants: [
      v("a", "NFC-STAND-GOOGLE-WHITE-S-R25", { Color: "White", NFC: "Round sticker" }),
      v("b", "NFC-STAND-GOOGLE-WHITE-S", { Color: "White", NFC: "Rigid disc" }),
      v("c", "NFC-STAND-GOOGLE-BLACK-S", { Color: "Black", NFC: "Rigid disc" }),
    ],
  };
  const plate2 = { id: "p2", title: "Google Plate", handle: "google-plate", variants: [v("d", "NFC-PLATE-GOOGLE-WHITE-S", { Color: "White" })] };
  const { products } = toShopProducts({ currency_code: "usd", products: [stand, plate2] }, BASE, CODE);

  it("keeps the description, the options and each variant's own choices", () => {
    expect(products[0].description).toBe("A stand.");
    expect(products[0].options[0]).toEqual({ title: "Color", values: ["White", "Black"] });
    expect(products[0].variants[1].options).toEqual({ Color: "White", NFC: "Rigid disc" });
    expect(products[1].description).toBeNull();
    expect(products[1].options).toEqual([]);
  });
  it("opens on the rigid disc, and picking a colour keeps it", () => {
    const first = shopDefaultVariant(products[0]);
    expect(first.sku).toBe("NFC-STAND-GOOGLE-WHITE-S");
    expect(shopPickOption(products[0], first, "Color", "Black")?.sku).toBe("NFC-STAND-GOOGLE-BLACK-S");
  });
  it("sorts a product into stands or plates by its SKUs, and lists the same kind first as related", () => {
    expect(shopSectionOf(products[0])).toBe("stands");
    expect(shopSectionOf(products[1])).toBe("plates");
    expect(shopRelated(products, products[0], 4).map((p) => p.id)).toEqual(["p2"]);
  });
});
