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
