// Tags › Shop, the Stuscle half: what Xpot makes of Stuscle's wholesale catalogue, and the links its cards open. The
// links go to Xpot's open route (SKU:quantity or a product handle, never a price and never the code), which signs a
// ticket for the reader's own code and redirects to Stuscle's /wholesale/kit.
import { describe, expect, it } from "vitest";
import { shopLinkWithQuantity, shopPictureFor, shopProductLink, shopSectionOf, shopStartQuantity, shopStartingOffer, shopStartingVariant, shopTotals, stuscleLang, toShopProducts, shopDefaultVariant, shopPickOption, shopShownOptions } from "../shared/tagShowcase";
import { stuscleKitUrl, WHOLESALE_OPEN_PATH } from "../shared/wholesale";

/** A link the app renders, read as a URL of this app. */
const open = (link: string) => new URL(link, "https://xpot.test");

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
    const { currency, products } = toShopProducts({ currency_code: "usd", products: [plate] });
    expect(currency).toBe("USD");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: "prod_plate", title: "Google Plate", handle: "google-plate", thumbnail: plate.thumbnail });
    expect(products[0].variants[0]).toMatchObject({ sku: "PLATE-GOOGLE-SMALL-BLACK", wholesalePriceCents: 850, retailPriceCents: 1499 });
    expect(products[0].variants[1].retailPriceCents).toBeNull();
    expect(products[0].variants[0].url).toBe(stuscleKitUrl([{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]));
    // No link a card renders reaches the store or carries a code: they all go through the open route.
    for (const link of [products[0].productUrl, ...products[0].variants.map((v) => v.url)]) {
      expect(link.startsWith(WHOLESALE_OPEN_PATH)).toBe(true);
      expect(link).not.toContain("code=");
    }
  });

  it("drops what it cannot show right instead of showing it wrong", () => {
    const body = {
      products: [
        { ...plate, variants: [{ id: "v1", sku: null, wholesale_price: 5 }, { id: "v2", sku: "A,B", wholesale_price: 5 }, { id: "v3", sku: "OK", wholesale_price: 0 }] },
        { ...plate, id: "prod_2", handle: "" },
        { ...plate, id: "prod_3", variants: [{ id: "v4", sku: "STAND-LARGE", wholesale_price: 12 }] },
      ],
    };
    const { products } = toShopProducts(body);
    expect(products.map((p) => p.id)).toEqual(["prod_3"]);
  });

  it("survives an answer that is not a catalogue", () => {
    for (const body of [null, "nope", { products: "x" }, { products: [null] }]) expect(toShopProducts(body).products).toEqual([]);
  });
});

describe("shopLinkWithQuantity", () => {
  const variant = { sku: "PLATE-GOOGLE-SMALL-BLACK", url: stuscleKitUrl([{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]) };

  it("asks the open route for the chosen quantity, with no code in the link", () => {
    const link = shopLinkWithQuantity(variant, 25);
    const url = open(link);
    expect(link.startsWith(WHOLESALE_OPEN_PATH)).toBe(true);
    expect(url.searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:25");
    expect(url.searchParams.has("code")).toBe(false);
  });

  it("keeps the quantity a whole number from 1 to 10,000", () => {
    expect(open(shopLinkWithQuantity(variant, 0)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:1");
    expect(open(shopLinkWithQuantity(variant, 2.7)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:2");
    expect(open(shopLinkWithQuantity(variant, 99_999)).searchParams.get("items")).toBe("PLATE-GOOGLE-SMALL-BLACK:10000");
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
    const [product] = toShopProducts({ products: [packed] }).products;
    expect(product.variants[0].packs).toEqual([
      { quantity: 10, unitPriceCents: 1500, retailUnitPriceCents: 2500 },
      { quantity: 25, unitPriceCents: 1400, retailUnitPriceCents: 2500 },
      { quantity: 50, unitPriceCents: 1200, retailUnitPriceCents: 2500 },
    ]);
  });

  it("shows the smallest pack's price first, whatever the flat price says", () => {
    const [variant] = toShopProducts({ products: [packed] }).products[0].variants;
    expect(variant.wholesalePriceCents).toBe(1500);
    expect(variant.retailPriceCents).toBe(2500);
  });

  it("keeps photos as clean lists, and a variant priced flat has no packs", () => {
    const { products } = toShopProducts({ products: [packed, plate] });
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
  const variant = { sku: "PLATE-GOOGLE-SMALL-BLACK", url: stuscleKitUrl([{ sku: "PLATE-GOOGLE-SMALL-BLACK", quantity: 1 }]) };

  it("names the app's languages the way Stuscle does", () => {
    expect([stuscleLang("en"), stuscleLang("pt"), stuscleLang("es")]).toEqual(["en", "pt-BR", "es"]);
    for (const other of ["fr", "", null, undefined]) expect(stuscleLang(other)).toBeNull();
  });

  it("carries the reseller's language, and leaves it out for one Stuscle does not know", () => {
    expect(open(shopLinkWithQuantity(variant, 25, "pt")).searchParams.get("lang")).toBe("pt-BR");
    expect(open(shopLinkWithQuantity(variant, 25, "fr")).searchParams.has("lang")).toBe(false);
    expect(open(shopLinkWithQuantity(variant, 25)).searchParams.has("lang")).toBe(false);
  });
});

// The new catalogue shape: one product per design, its variants Color x Size x NFC chip, the chip never a choice.
describe("options, sections and the product link", () => {
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
  const { products } = toShopProducts({ currency_code: "usd", products: [stand, plate2] });

  it("keeps the description, the options and each variant's own choices", () => {
    expect(products[0].description).toBe("A stand.");
    expect(products[0].options[0]).toEqual({ title: "Color", values: ["White", "Black"] });
    expect(products[0].variants[1].options).toEqual({ Color: "White", NFC: "Rigid disc" });
    expect(products[1].description).toBeNull();
    expect(products[1].options).toEqual([]);
  });
  it("sorts a product into stands or plates by its SKUs", () => {
    expect(shopSectionOf(products[0])).toBe("stands");
    expect(shopSectionOf(products[1])).toBe("plates");
  });
  it("opens a product through the open route by its handle, nothing in the cart, no code, and their language", () => {
    expect(products[0].productUrl).toBe(`${WHOLESALE_OPEN_PATH}?product=google-stand`);
    expect(products[0].productUrl).not.toContain("items=");
    expect(products[0].productUrl).not.toContain("code=");
    const link = open(shopProductLink(products[0], "pt"));
    expect(link.pathname).toBe(WHOLESALE_OPEN_PATH);
    expect(link.searchParams.get("lang")).toBe("pt-BR");
    expect(link.searchParams.get("product")).toBe("google-stand");
    expect(shopProductLink(products[0], "fr")).toBe(products[0].productUrl);
  });
});

// A wholesale card prices the smallest pack in full, as Stuscle's card does: 10 plates at $15 against $25 each.
describe("shopStartingOffer", () => {
  const pack = (quantity: number, unit: number) => ({ quantity, unitPriceCents: unit, retailUnitPriceCents: 2500 });
  const variant = { wholesalePriceCents: 1500, retailPriceCents: 2500, packs: [pack(10, 1500), pack(25, 1375)] };
  it("is the smallest pack in full against the same pieces at retail", () => {
    expect(shopStartingOffer(variant)).toEqual({ quantity: 10, totalCents: 15000, retailCents: 25000, percentOff: 40 });
  });
  it("is one piece for a variant sold by the piece, with no saving when there is no retail price", () => {
    expect(shopStartingOffer({ wholesalePriceCents: 850, retailPriceCents: null, packs: [] })).toEqual({ quantity: 1, totalCents: 850, retailCents: null, percentOff: null });
  });
  it("picks the variant cheapest to start buying", () => {
    const cheap = { ...variant, id: "b", packs: [pack(5, 2400)] };
    expect(shopStartingVariant({ variants: [{ ...variant, id: "a" }, cheap] as never }).id).toBe("b");
  });
});

// The choices on a card: Color and Size are shown, the NFC chip never is, and a card opens on the rigid disc.
describe("card choices", () => {
  const v = (id: string, sku: string, options: Record<string, string>) => ({ id, title: id, sku, wholesale_price: 24, retail_price: 40, options, packs: [{ quantity: 5, unit_price: 24, retail_unit_price: 40 }] });
  const stand = {
    id: "p1", title: "Google Stand", handle: "google-stand",
    options: [{ title: "Color", values: ["White", "Black"] }, { title: "Size", values: ["Small", "Large"] }, { title: "NFC", values: ["Rigid disc", "Round sticker"] }, { title: "Style", values: ["Classic"] }],
    variants: [
      v("a", "NFC-STAND-GOOGLE-WHITE-S-R25", { Color: "White", Size: "Small", NFC: "Round sticker" }),
      v("b", "NFC-STAND-GOOGLE-WHITE-S", { Color: "White", Size: "Small", NFC: "Rigid disc" }),
      v("c", "NFC-STAND-GOOGLE-BLACK-S", { Color: "Black", Size: "Small", NFC: "Rigid disc" }),
      v("d", "NFC-STAND-GOOGLE-WHITE-L", { Color: "White", Size: "Large", NFC: "Rigid disc" }),
    ],
  };
  const { products } = toShopProducts({ currency_code: "usd", products: [stand] });
  it("shows Color and Size, never the NFC chip, and nothing with a single value", () => {
    expect(shopShownOptions(products[0]).map((o) => o.title)).toEqual(["Color", "Size"]);
  });
  it("opens on the rigid disc, and picking a value keeps the other choices and the chip", () => {
    const first = shopDefaultVariant(products[0]);
    expect(first.sku).toBe("NFC-STAND-GOOGLE-WHITE-S");
    expect(shopPickOption(products[0], first, "Color", "Black")?.sku).toBe("NFC-STAND-GOOGLE-BLACK-S");
    expect(shopPickOption(products[0], first, "Size", "Large")?.sku).toBe("NFC-STAND-GOOGLE-WHITE-L");
    expect(shopPickOption(products[0], first, "Color", "Green")).toBeNull();
  });
});
