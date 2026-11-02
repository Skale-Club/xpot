import { describe, it, expect } from "vitest";
import {
  orderLineBalance,
  orderWorkState,
  orderCreditBalance,
  planOrderDelivery,
  pieceAllocationBlocker,
  customerOrderCreateSchema,
} from "../shared/customerOrders.js";
import { matchesStockMetric } from "../shared/tagMetrics.js";
describe("customer orders: operational balances and money", () => {
  it("keeps the eight missing units after delivery of two out of ten", () => {
    const line = {
      quantity: 10,
      cancelledQuantity: 0,
      delivered: 2,
      allocated: 0,
      pending: 0,
    };
    expect(orderLineBalance(line)).toEqual({
      remaining: 8,
      ready: 0,
      toProduce: 8,
    });
    expect(orderWorkState([line], false)).toBe("queued");
    expect(orderLineBalance({ ...line, allocated: 3, pending: 4 })).toEqual({
      remaining: 8,
      ready: 3,
      toProduce: 1,
    });
    expect(orderWorkState([{ ...line, cancelledQuantity: 8 }], true)).toBe(
      "partially_cancelled",
    );
  });
  it("treats damage as a fresh deficit and approval as a production gate", () => {
    const line = {
      quantity: 10,
      cancelledQuantity: 0,
      delivered: 0,
      allocated: 8,
      pending: 0,
    };
    expect(orderLineBalance(line).toProduce).toBe(2);
    expect(
      orderWorkState([{ ...line, custom: "custom", approved: false }], false),
    ).toBe("artwork");
  });
  it("applies a receipt once and makes returned-sale money refundable credit", () => {
    const ledger = [
      { kind: "received", amountCents: 5000 },
      { kind: "applied", amountCents: 2000 },
    ];
    expect(orderCreditBalance(ledger)).toBe(3000);
    expect(planOrderDelivery(4000, 3000, 3000, 1000)).toEqual({
      ok: true,
      paidCents: 4000,
      paymentStatus: "paid",
    });
    expect(planOrderDelivery(2000, 3000, 3001, 0).ok).toBe(false);
    expect(planOrderDelivery(2000, 3000, 2000, 1).ok).toBe(false);
    expect(planOrderDelivery(2000, 3000, -1, 0).ok).toBe(false);
    expect(
      orderCreditBalance([
        ...ledger,
        { kind: "release", amountCents: 2000 },
        { kind: "refund", amountCents: 5000 },
      ]),
    ).toBe(0);
  });
  it("separates a piece from free stock without selling it", () => {
    const piece = {
      repId: null,
      status: "inventory",
      stockStatus: "available",
      saleId: null,
      leadId: null,
      customerOrderLineId: "reserved",
    };
    expect(matchesStockMetric(piece, "house")).toBe(false);
    expect(matchesStockMetric(piece, "handOut")).toBe(false);
    expect(matchesStockMetric(piece, "sold")).toBe(false);
    const line = {
      productType: "large_plate",
      face: "custom",
      salesProductId: 1,
    };
    expect(
      pieceAllocationBlocker(
        { ...piece, orderLineId: "reserved", ...line },
        line,
        1,
      ),
    ).toBe("order_piece_allocated");
    expect(
      pieceAllocationBlocker(
        { ...piece, orderLineId: null, ...line, leadId: 2 },
        line,
        1,
      ),
    ).toBe("order_piece_customer");
  });
  it("rejects unknown business fields, negative prices and empty requests", () => {
    expect(
      customerOrderCreateSchema.safeParse({ leadId: 1, lines: [] }).success,
    ).toBe(false);
    expect(
      customerOrderCreateSchema.safeParse({ leadId: 1, saleId: 2, lines: [] })
        .success,
    ).toBe(false);
    expect(
      customerOrderCreateSchema.safeParse({
        leadId: 1,
        lines: [
          {
            description: "overflow",
            quantity: 1000,
            unitPriceCents: 100_000_000,
            salesProductId: 1,
            productType: "large_plate",
            face: "menu",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
