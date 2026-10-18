// Xpot Tags — what handing a kit to a rep records, by the rep's cost rule
// (sales_reps.cost_policy). Shared by the Hand out flow and the kit route so
// both ask for, and store, the same thing. Pure, no I/O.
//
//   acquisition: the rep buys the pieces (wholesale). A cost per piece is
//                required and the pieces become the rep's.
//   zero:        the pieces stay company stock in the rep's custody
//                (consignment). A cost is optional, kept for reference only.
//
// The rule gives the default; the person handing out may choose the other
// ownership for one kit. A purchase always needs a cost, and so does any kit
// for a rep on the acquisition rule (the server enforces the same).

export type KitCostPolicy = "zero" | "acquisition";
export type KitOwnership = "company" | "rep";

/** Manual kits record their cost in tag_acquisitions.currency's default. */
export const KIT_COST_CURRENCY = "USD";

/** Who owns the pieces after the hand-over, by default. */
export function kitOwnership(policy: KitCostPolicy): KitOwnership {
  return policy === "acquisition" ? "rep" : "company";
}

/** Is a cost per piece required? With `ownership`, for that choice; without, the rule's default. */
export function kitCostRequired(policy: KitCostPolicy, ownership: KitOwnership = kitOwnership(policy)): boolean {
  return policy === "acquisition" || ownership === "rep";
}

export type KitUnitCost =
  | { ok: true; cents: number | undefined }
  | { ok: false; reason: "required" | "invalid" };

/** The typed cost per piece ("12.50"), in cents; blank is fine unless a cost is required (a rule, or `true`). */
export function parseKitUnitCost(text: string, rule: KitCostPolicy | boolean): KitUnitCost {
  const required = typeof rule === "boolean" ? rule : kitCostRequired(rule);
  const value = text.trim();
  if (!value) return required ? { ok: false, reason: "required" } : { ok: true, cents: undefined };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: "invalid" };
  return { ok: true, cents: Math.round(amount * 100) };
}

/** A kit's short code, from its sequential number: 7 → "K-0007" (more digits once past 9999). */
export function kitCode(kitNumber: number | null | undefined): string {
  if (!kitNumber || !Number.isInteger(kitNumber) || kitNumber < 1) return "K-????";
  return `K-${String(kitNumber).padStart(4, "0")}`;
}
