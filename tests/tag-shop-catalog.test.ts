// Tags › Shop, the Stuscle half: what Xpot makes of Stuscle's wholesale catalogue, and the links its cards open. The
// links are the contract with Stuscle's /wholesale/kit: the reader's own code and SKU:quantity, never a price.
import { describe, expect, it } from "vitest";
import { shopLinkWithQuantity, toShopProducts } from "../shared/tagShowcase";
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
