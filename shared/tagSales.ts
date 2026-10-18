import { z } from "zod";

export const TAG_COST_POLICIES = ["zero", "acquisition"] as const;
export type TagCostPolicy = typeof TAG_COST_POLICIES[number];

const cents = z.number().int().nonnegative();
const positiveId = z.number().int().positive();

export const tagCostPolicySchema = z.enum(TAG_COST_POLICIES);

export const tagSaleLineSchema = z.object({
  salesProductId: positiveId,
  tagIds: z.array(z.string().uuid()).min(1).max(50),
  unitPriceCents: cents.optional(),
}).strict();

export const tagSaleCreateSchema = z.object({
  leadId: positiveId,
  sellerRepId: positiveId.optional(),
  visitId: positiveId.nullable().optional(),
  lines: z.array(tagSaleLineSchema).min(1).max(50),
  discountCents: cents.optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  paymentMethod: z.enum(["cash", "card", "pix", "transfer", "invoice", "other"]).nullable().optional(),
  paidCents: cents.optional(),
  soldAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.lines.forEach((line, lineIndex) => line.tagIds.forEach((tagId, tagIndex) => {
    if (seen.has(tagId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines", lineIndex, "tagIds", tagIndex], message: "A piece can appear only once" });
    }
    seen.add(tagId);
  }));
  if (input.paymentStatus === "partial") {
    if (!input.paidCents || input.paidCents <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paidCents"], message: "A partial payment requires an amount received" });
    }
    if (input.lines.every((line) => line.unitPriceCents !== undefined)) {
      const subtotal = input.lines.reduce((sum, line) => sum + line.tagIds.length * (line.unitPriceCents ?? 0), 0);
      const total = Math.max(0, subtotal - (input.discountCents ?? 0));
      if (input.paidCents !== undefined && input.paidCents >= total) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paidCents"], message: "A partial payment must be less than the sale total" });
      }
    }
  }
});

export const stuscleWholesaleOrderSchema = z.object({
  externalOrderId: z.string().trim().min(1).max(120),
  wholesaleCode: z.string().trim().min(1).max(40),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("USD"),
  purchasedAt: z.string().datetime(),
  status: z.enum(["paid", "cancelled"]).default("paid"),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(120),
    quantity: z.number().int().positive().max(1000),
    subtotalCents: cents,
    tagCodes: z.array(z.string().trim().min(1).max(80)).max(1000).optional(),
  }).strict().superRefine((item, ctx) => {
    if (item.tagCodes && item.tagCodes.length !== item.quantity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tagCodes"], message: "tagCodes must match quantity" });
    }
  })).min(1).max(100),
}).strict();

export type TagSaleCreateInput = z.infer<typeof tagSaleCreateSchema>;
export type StuscleWholesaleOrderInput = z.infer<typeof stuscleWholesaleOrderSchema>;

export function allocateAcquisitionUnitCosts(subtotalCents: number, quantity: number): number[] {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const safeSubtotal = Math.max(0, Math.round(subtotalCents));
  const base = Math.floor(safeSubtotal / safeQuantity);
  const remainder = safeSubtotal - base * safeQuantity;
  return Array.from({ length: safeQuantity }, (_, index) => base + (index < remainder ? 1 : 0));
}

export type TagCostResolution = {
  costCents: number;
  source: "policy_zero" | "manual_override" | "acquisition";
};

export function resolveTagUnitCost(input: {
  costPolicy: TagCostPolicy;
  acquisitionCostCents: number | null;
  overrideCostCents?: number | null;
}): TagCostResolution {
  if (input.costPolicy === "zero") return { costCents: 0, source: "policy_zero" };
  if (input.overrideCostCents !== null && input.overrideCostCents !== undefined) {
    return { costCents: input.overrideCostCents, source: "manual_override" };
  }
  if (input.acquisitionCostCents !== null) {
    return { costCents: input.acquisitionCostCents, source: "acquisition" };
  }
  throw new Error("Tag acquisition cost is missing");
}

/** A customer the sale dialog can start from. */
export type SaleCustomerChoice = { leadId: number; name: string; placeId: string | null };

/**
 * Who a piece is sold to by default. The piece's own customer comes first (the
 * server refuses selling it to anyone else), then the "Selling to" customer the
 * rep picked, and only for a piece with no customer, the company of the visit in
 * progress.
 */
export function suggestSaleCustomer(input: {
  piece: SaleCustomerChoice | null;
  sellingTo: SaleCustomerChoice | null;
  visit: SaleCustomerChoice | null;
}): SaleCustomerChoice | null {
  return input.piece ?? input.sellingTo ?? input.visit;
}

/**
 * The first chosen piece that is already linked to a customer other than
 * `leadId` (a new customer has no id yet, so any linked piece conflicts).
 */
export function saleCustomerConflict<T extends { leadId: number | null }>(pieces: readonly T[], leadId: number | null): T | null {
  return pieces.find((piece) => piece.leadId !== null && piece.leadId !== leadId) ?? null;
}

/**
 * What the sale dialog previews as the cost of a group of pieces. The viewer's
 * own sale uses their cost rule and the pieces' acquisition cost. A sale
 * management records in the holder's name takes the holder's rule
 * (server/tags/sales.ts), which the piece list does not carry, so the dialog
 * shows no cost or profit then, only whose cost will apply.
 */
export function saleCostPreview(input: {
  viewerRepId: number | null | undefined;
  /** The seller the sale is recorded for; the viewer when absent. */
  sellerRepId?: number;
  viewerCostPolicy: string | null | undefined;
  pieces: ReadonlyArray<{ repId: number | null; repName: string | null; acquisitionCostCents: number | null }>;
}): { kind: "own"; unitCostCents: number } | { kind: "seller"; sellerName: string | null } {
  if (input.sellerRepId !== undefined && input.viewerRepId != null && input.sellerRepId !== input.viewerRepId) {
    const sellerName = input.pieces.find((piece) => piece.repId === input.sellerRepId)?.repName?.trim() || null;
    return { kind: "seller", sellerName };
  }
  if (input.viewerCostPolicy === "zero" || input.pieces.length === 0) return { kind: "own", unitCostCents: 0 };
  const total = input.pieces.reduce((sum, piece) => sum + (piece.acquisitionCostCents ?? 0), 0);
  return { kind: "own", unitCostCents: total / input.pieces.length };
}
