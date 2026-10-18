// Xpot Tags — what handing a kit to a rep records, by the rep's cost rule
// (sales_reps.cost_policy). Shared by the Give-a-kit form and the kit route so
// both ask for, and store, the same thing. Pure, no I/O.
//
//   acquisition: the rep buys the pieces (wholesale). A cost per piece is
//                required and the pieces become the rep's.
//   zero:        the pieces stay company stock in the rep's custody
//                (consignment). A cost is optional, kept for reference only.

export type KitCostPolicy = "zero" | "acquisition";

/** Manual kits record their cost in tag_acquisitions.currency's default. */
export const KIT_COST_CURRENCY = "USD";

/** Who owns the pieces after the hand-over. */
export function kitOwnership(policy: KitCostPolicy): "company" | "rep" {
  return policy === "acquisition" ? "rep" : "company";
}

export function kitCostRequired(policy: KitCostPolicy): boolean {
  return policy === "acquisition";
}

export type KitUnitCost =
  | { ok: true; cents: number | undefined }
  | { ok: false; reason: "required" | "invalid" };

/** The typed cost per piece ("12.50"), in cents; blank is fine unless the rule requires a cost. */
export function parseKitUnitCost(text: string, policy: KitCostPolicy): KitUnitCost {
  const value = text.trim();
  if (!value) return kitCostRequired(policy) ? { ok: false, reason: "required" } : { ok: true, cents: undefined };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: "invalid" };
  return { ok: true, cents: Math.round(amount * 100) };
}
