// The consignment arithmetic is what the rep and the shop owner settle on at
// the counter — "you left 30, there are 12, that's 18 sold, $90". It has to be
// exactly right and identical in the dialog preview and on the server.

import { describe, expect, it } from "vitest";
import {
  computeSaleTotals,
  computeSettlement,
  lineProfitCents,
  nextDueDate,
  paymentStatusFor,
  resolveUnitPriceCents,
  unitMarginCents,
} from "../shared/pricing.js";

describe("resolveUnitPriceCents", () => {
  const tiers = [
    { minQuantity: 100, unitPriceCents: 450 },
    { minQuantity: 250, unitPriceCents: 400 },
  ];

  it("uses the base price below every tier — 30 keychains at $5", () => {
    expect(resolveUnitPriceCents(500, tiers, 30)).toBe(500);
    expect(resolveUnitPriceCents(500, tiers, 99)).toBe(500);
  });

  it("picks the highest qualifying tier", () => {
    expect(resolveUnitPriceCents(500, tiers, 100)).toBe(450);
    expect(resolveUnitPriceCents(500, tiers, 249)).toBe(450);
    expect(resolveUnitPriceCents(500, tiers, 250)).toBe(400);
    expect(resolveUnitPriceCents(500, tiers, 1000)).toBe(400);
  });

  it("ignores tier order and bad quantities", () => {
    expect(resolveUnitPriceCents(500, [...tiers].reverse(), 120)).toBe(450);
    expect(resolveUnitPriceCents(500, tiers, 0)).toBe(500);
    expect(resolveUnitPriceCents(500, [], 500)).toBe(500);
  });
});

describe("computeSettlement", () => {
  it("bills what left the shelf — the 30 left, all sold, $150 case", () => {
    const r = computeSettlement({ onHand: 30, countedRemaining: 0, unitPriceCents: 500, unitCostCents: 120 });
    expect(r.soldQuantity).toBe(30);
    expect(r.amountCents).toBe(15000);
    // 30 x ($5.00 - $1.20) = $114.00 kept. What the shop resold them for is theirs.
    expect(r.profitCents).toBe(11400);
    expect(r.onHandAfterSettlement).toBe(0);
    expect(r.overCount).toBe(false);
  });

  it("partial sell-through with a restock", () => {
    const r = computeSettlement({ onHand: 30, countedRemaining: 12, unitPriceCents: 500, restockQuantity: 20 });
    expect(r.soldQuantity).toBe(18);
    expect(r.amountCents).toBe(9000);
    expect(r.onHandAfterSettlement).toBe(12);
    expect(r.onHandAfterRestock).toBe(32);
  });

  it("nothing sold is a zero settlement, not an error", () => {
    const r = computeSettlement({ onHand: 30, countedRemaining: 30, unitPriceCents: 500 });
    expect(r.soldQuantity).toBe(0);
    expect(r.amountCents).toBe(0);
  });

  it("counting more than on record flags an over-count and bills nothing", () => {
    const r = computeSettlement({ onHand: 30, countedRemaining: 35, unitPriceCents: 500 });
    expect(r.overCount).toBe(true);
    expect(r.soldQuantity).toBe(0);
    expect(r.amountCents).toBe(0);
    expect(r.onHandAfterSettlement).toBe(30);
  });

  it("never lets negative or fractional counts through", () => {
    const r = computeSettlement({ onHand: 10, countedRemaining: -3, unitPriceCents: 500, restockQuantity: 2.9 });
    expect(r.soldQuantity).toBe(10);
    expect(r.onHandAfterRestock).toBe(2);
  });
});

describe("computeSaleTotals", () => {
  it("sums lines and caps the discount at the subtotal", () => {
    const t = computeSaleTotals([
      { quantity: 1, unitPriceCents: 49900 },
      { quantity: 3, unitPriceCents: 500 },
    ], 2000);
    expect(t.subtotalCents).toBe(51400);
    expect(t.discountCents).toBe(2000);
    expect(t.totalCents).toBe(49400);
    expect(computeSaleTotals([{ quantity: 1, unitPriceCents: 1000 }], 5000).totalCents).toBe(0);
    expect(computeSaleTotals([{ quantity: 1, unitPriceCents: 1000 }], -50).discountCents).toBe(0);
  });
});

describe("paymentStatusFor", () => {
  it("derives status from what was paid", () => {
    expect(paymentStatusFor(0, 1000)).toBe("unpaid");
    expect(paymentStatusFor(400, 1000)).toBe("partial");
    expect(paymentStatusFor(1000, 1000)).toBe("paid");
    expect(paymentStatusFor(1200, 1000)).toBe("paid");
    expect(paymentStatusFor(0, 0)).toBe("paid");
  });
});

describe("nextDueDate", () => {
  it("adds the interval; 0/undefined fall back to 30 days, negatives clamp to 1", () => {
    const from = new Date("2026-09-01T12:00:00Z");
    expect(nextDueDate(30, from).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(nextDueDate(0, from).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(nextDueDate(-5, from).toISOString()).toBe("2026-09-02T12:00:00.000Z");
  });
});

describe("profit — what we keep, not what the shop charges", () => {
  it("is price minus production cost, per unit sold", () => {
    // Keychain: $5.00 B2B, $1.20 to print. The barbershop's own $8 or $12
    // resale price is nowhere in this calculation, by design.
    expect(lineProfitCents({ quantity: 30, unitPriceCents: 500, unitCostCents: 120 })).toBe(11400);
    expect(unitMarginCents(500, 120)).toBe(380);
  });

  it("treats a line with no cost as pure margin — a service has no unit cost", () => {
    expect(lineProfitCents({ quantity: 1, unitPriceCents: 49900 })).toBe(49900);
    expect(unitMarginCents(49900, null)).toBe(49900);
  });

  it("takes a discount out of our margin, never out of the cost of goods", () => {
    const t = computeSaleTotals(
      [{ quantity: 10, unitPriceCents: 500, unitCostCents: 120 }],
      1000,
    );
    expect(t.subtotalCents).toBe(5000);
    expect(t.costCents).toBe(1200);
    expect(t.totalCents).toBe(4000);
    expect(t.profitCents).toBe(2800); // 5000 - 1000 discount - 1200 cost
  });

  it("mixes a service and goods in one sale", () => {
    const t = computeSaleTotals([
      { quantity: 1, unitPriceCents: 60000 },                        // a $600 site
      { quantity: 5, unitPriceCents: 500, unitCostCents: 120 },      // 5 keychains
    ]);
    expect(t.totalCents).toBe(62500);
    expect(t.profitCents).toBe(61900);
  });

  it("a discount larger than the sale cannot invent negative revenue", () => {
    const t = computeSaleTotals([{ quantity: 1, unitPriceCents: 1000, unitCostCents: 400 }], 99999);
    expect(t.totalCents).toBe(0);
    expect(t.profitCents).toBe(-400); // sold below cost: a real loss, reported as one
  });
});

describe("a restock must never silently reprice the shelf", () => {
  // The bug this pins: runDeposit took a required unitPriceCents and let any
  // truthy value win on a top-up. Every caller passes the catalog price, so
  // "I left a hundred more" crossed the 100-unit tier and repriced the WHOLE
  // shelf to $4.50 — including the 30 units already there under a $5 deal,
  // which the next settlement would then bill at the lower price.
  const tiers = [{ minQuantity: 100, unitPriceCents: 450 }];

  it("the tier price is what a top-up would have been repriced to", () => {
    expect(resolveUnitPriceCents(500, tiers, 100)).toBe(450);
  });

  it("the shelf is billed at one price, which is why repricing it is wrong", () => {
    // 30 units left at $5, then 100 more added. If the restock repriced the
    // agreement, settling all 130 would bill $585 instead of $650 — the shop
    // gets a retroactive discount on stock it already held.
    const atAgreed = computeSettlement({ onHand: 130, countedRemaining: 0, unitPriceCents: 500 });
    const atRepriced = computeSettlement({ onHand: 130, countedRemaining: 0, unitPriceCents: 450 });
    expect(atAgreed.amountCents).toBe(65000);
    expect(atRepriced.amountCents).toBe(58500);
    expect(atAgreed.amountCents - atRepriced.amountCents).toBe(6500);
  });
});

describe("a one-off settlement price stays one-off", () => {
  // xpotConsignmentSettleSchema documents unitPriceCents as "override the
  // agreed price for this settlement only", but runSettlement was writing it
  // back onto the agreement — so a single discount at the counter silently
  // became the standing price for every cycle after it.
  it("a discounted settlement bills less without changing what comes next", () => {
    const discounted = computeSettlement({ onHand: 30, countedRemaining: 10, unitPriceCents: 400 });
    expect(discounted.amountCents).toBe(8000); // 20 x $4.00, this time only

    // Next cycle, same shelf, the agreed $5 still applies.
    const nextCycle = computeSettlement({ onHand: 20, countedRemaining: 0, unitPriceCents: 500 });
    expect(nextCycle.amountCents).toBe(10000);
  });
});
