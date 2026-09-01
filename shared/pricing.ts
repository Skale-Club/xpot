// Pure pricing and consignment arithmetic for the sales module.
//
// Kept free of I/O so the settlement maths — the part a rep and an owner will
// argue about at the counter — is unit-tested (tests/sales-pricing.test.ts)
// and identical on the server and in the dialogs that preview it.

export type PriceTierLike = { minQuantity: number; unitPriceCents: number };

/**
 * Unit price for `quantity` of a product: the highest tier whose minQuantity
 * is met wins; with no qualifying tier the base price applies.
 */
export function resolveUnitPriceCents(
  basePriceCents: number,
  tiers: PriceTierLike[],
  quantity: number,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return basePriceCents;
  let best: PriceTierLike | null = null;
  for (const tier of tiers) {
    if (tier.minQuantity <= quantity && (!best || tier.minQuantity > best.minQuantity)) {
      best = tier;
    }
  }
  return best ? best.unitPriceCents : basePriceCents;
}

export type LineInput = { quantity: number; unitPriceCents: number; unitCostCents?: number };

export function lineTotalCents(line: LineInput): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

/**
 * Profit on one line: what the establishment pays us, minus what the unit cost
 * to produce. What the shop then resells it for is theirs and never enters here.
 */
export function lineProfitCents(line: LineInput): number {
  return Math.round(line.quantity * (line.unitPriceCents - (line.unitCostCents ?? 0)));
}

export function computeSaleTotals(lines: LineInput[], discountCents = 0) {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  const discount = Math.max(0, Math.min(discountCents, subtotalCents));
  const costCents = lines.reduce((sum, line) => sum + Math.round(line.quantity * (line.unitCostCents ?? 0)), 0);
  return {
    subtotalCents,
    discountCents: discount,
    totalCents: subtotalCents - discount,
    costCents,
    // A discount comes out of our margin, not the cost of goods.
    profitCents: subtotalCents - discount - costCents,
  };
}

/** Unit margin for the catalog screen: US$ 5.00 − US$ 1.20 = US$ 3.80. */
export function unitMarginCents(basePriceCents: number, costCents: number | null | undefined): number {
  return basePriceCents - (costCents ?? 0);
}

export type SettlementInput = {
  onHand: number;
  countedRemaining: number;
  unitPriceCents: number;
  unitCostCents?: number;
  restockQuantity?: number;
};

export type SettlementResult = {
  soldQuantity: number;
  amountCents: number;
  profitCents: number;
  onHandAfterSettlement: number;
  onHandAfterRestock: number;
  /** counted more than was left — the rep should record an adjustment, not a settlement. */
  overCount: boolean;
};

/**
 * What a settlement visit bills: everything that left the shelf since the
 * last count. `countedRemaining` is what the rep physically finds; the
 * difference to `onHand` was sold by the establishment.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const onHand = Math.max(0, Math.floor(input.onHand));
  const counted = Math.max(0, Math.floor(input.countedRemaining));
  const restock = Math.max(0, Math.floor(input.restockQuantity ?? 0));
  const overCount = counted > onHand;
  const soldQuantity = overCount ? 0 : onHand - counted;
  const onHandAfterSettlement = overCount ? onHand : counted;
  return {
    soldQuantity,
    amountCents: Math.round(soldQuantity * input.unitPriceCents),
    profitCents: Math.round(soldQuantity * (input.unitPriceCents - (input.unitCostCents ?? 0))),
    onHandAfterSettlement,
    onHandAfterRestock: onHandAfterSettlement + restock,
    overCount,
  };
}

/** Next settlement due date: `intervalDays` after `from` (defaults to now). */
export function nextDueDate(intervalDays: number, from: Date = new Date()): Date {
  const days = Math.max(1, Math.floor(intervalDays || 30));
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function paymentStatusFor(paidCents: number, totalCents: number): "unpaid" | "partial" | "paid" {
  if (totalCents <= 0) return "paid";
  if (paidCents <= 0) return "unpaid";
  if (paidCents >= totalCents) return "paid";
  return "partial";
}
