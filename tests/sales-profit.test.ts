import { describe, expect, it } from "vitest";
import { hasCost, profitOnCostedProducts } from "../client/src/pages/xpot/components/sales/profitRules";

describe("profit in the Sales overview", () => {
  it("a product sold with no cost entered has no profit to show: its profit is the whole sale", () => {
    expect(hasCost({ revenueCents: 5000, profitCents: 5000 })).toBe(false);
  });

  it("a product with a cost entered does", () => {
    expect(hasCost({ revenueCents: 5000, profitCents: 3500 })).toBe(true);
  });

  it("a seller's summary has no profit at all, so nothing counts as costed", () => {
    expect(hasCost({ revenueCents: 5000 })).toBe(false);
    expect(profitOnCostedProducts([{ revenueCents: 5000 }])).toEqual({ profitCents: 0, revenueCents: 0, products: 0 });
  });

  it("adds up only the products that have a cost: $42 of $90, not the 100% of the digital services", () => {
    const byProduct = [
      { revenueCents: 598800, profitCents: 598800 },
      { revenueCents: 5000, profitCents: 2400 },
      { revenueCents: 4000, profitCents: 1800 },
    ];
    expect(profitOnCostedProducts(byProduct)).toEqual({ profitCents: 4200, revenueCents: 9000, products: 2 });
  });
});
