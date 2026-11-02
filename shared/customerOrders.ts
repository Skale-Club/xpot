import { z } from "zod";
import { TAG_PRODUCT_TYPES } from "./tags.js";
import { TAG_FACES } from "./tagFace.js";

const cents = z.number().int().nonnegative().max(100_000_000);
export const customerOrderLineSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(1000),
    salesProductId: z.number().int().positive(),
    productType: z.enum(TAG_PRODUCT_TYPES),
    face: z.enum(TAG_FACES),
    theme: z.string().trim().min(1).max(40).nullable().optional(),
    unitPriceCents: cents,
    modelId: z.string().uuid().nullable().optional(),
    producerOrganizationId: z.number().int().positive().optional(),
    custom: z.boolean().default(false),
  })
  .strict();
export const MAX_ORDER_CENTS = 2_147_483_647;
export const customerOrderCreateSchema = z
  .object({
    leadId: z.number().int().positive(),
    visitId: z.number().int().positive().optional(),
    opportunityId: z.number().int().positive().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
    notes: z.string().trim().max(2000).optional(),
    lines: z.array(customerOrderLineSchema).min(1).max(20),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0) >
      MAX_ORDER_CENTS
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "The order value exceeds the supported limit",
      });
  });
export const customerOrderCommandSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export type OrderLineBalanceInput = {
  quantity: number;
  cancelledQuantity: number;
  delivered: number;
  allocated: number;
  pending: number;
};
export function orderLineBalance(input: OrderLineBalanceInput) {
  const remaining = Math.max(
    0,
    input.quantity - input.cancelledQuantity - input.delivered,
  );
  return {
    remaining,
    ready: Math.min(remaining, input.allocated),
    toProduce: Math.max(0, remaining - input.allocated - input.pending),
  };
}
export function orderWorkState(
  lines: Array<
    OrderLineBalanceInput & {
      custom?: string;
      approved?: boolean;
      printing?: boolean;
    }
  >,
  cancelled: boolean,
) {
  if (cancelled)
    return lines.some((l) => l.delivered > 0)
      ? "partially_cancelled"
      : "cancelled";
  if (lines.every((l) => orderLineBalance(l).remaining === 0))
    return "delivered";
  if (
    lines.some(
      (l) =>
        l.custom === "custom" &&
        !l.approved &&
        orderLineBalance(l).remaining > 0,
    )
  )
    return "artwork";
  if (lines.some((l) => l.allocated > 0)) return "ready";
  return lines.some((l) => l.pending > 0 || l.printing)
    ? "production"
    : "queued";
}
export function pieceAllocationBlocker(
  piece: {
    stockStatus: string;
    status: string;
    saleId: number | null;
    leadId: number | null;
    orderLineId: string | null;
    productType: string;
    face: string | null;
    salesProductId: number | null;
  },
  line: { productType: string; face: string; salesProductId: number },
  leadId: number,
): string | null {
  if (piece.orderLineId) return "order_piece_allocated";
  if (
    piece.stockStatus !== "available" ||
    piece.status === "retired" ||
    piece.saleId !== null
  )
    return "order_piece_unavailable";
  if (piece.leadId !== null && piece.leadId !== leadId)
    return "order_piece_customer";
  if (
    piece.productType !== line.productType ||
    piece.face !== line.face ||
    piece.salesProductId !== line.salesProductId
  )
    return "order_piece_design";
  return null;
}
export function orderCreditBalance(
  entries: Array<{ kind: string; amountCents: number }>,
) {
  return entries.reduce(
    (sum, e) =>
      sum +
      (e.kind === "received" || e.kind === "release"
        ? e.amountCents
        : -e.amountCents),
    0,
  );
}
export function planOrderDelivery(
  totalCents: number,
  creditCents: number,
  applyCreditCents: number,
  cashCents: number,
) {
  if (
    ![totalCents, creditCents, applyCreditCents, cashCents].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    )
  )
    return { ok: false as const, code: "order_payment_invalid" };
  if (
    applyCreditCents > creditCents ||
    applyCreditCents + cashCents > totalCents
  )
    return { ok: false as const, code: "order_credit_exceeded" };
  const paidCents = applyCreditCents + cashCents;
  return {
    ok: true as const,
    paidCents,
    paymentStatus:
      paidCents === totalCents
        ? ("paid" as const)
        : paidCents > 0
          ? ("partial" as const)
          : ("unpaid" as const),
  };
}
export type CustomerOrderCreateInput = z.infer<
  typeof customerOrderCreateSchema
>;
