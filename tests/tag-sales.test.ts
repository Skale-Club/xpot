import { describe, expect, it } from "vitest";
import { allocateAcquisitionUnitCosts, resolveTagUnitCost, tagSaleCreateSchema } from "../shared/tagSales.js";

describe("resolveTagUnitCost", () => {
  it("freezes zero cost for a house seller regardless of catalog or acquisition values", () => {
    expect(resolveTagUnitCost({
      costPolicy: "zero",
      acquisitionCostCents: 1200,
      overrideCostCents: null,
    })).toEqual({ costCents: 0, source: "policy_zero" });
  });

  it("uses an audited override before the partner acquisition cost", () => {
    expect(resolveTagUnitCost({
      costPolicy: "acquisition",
      acquisitionCostCents: 1200,
      overrideCostCents: 950,
    })).toEqual({ costCents: 950, source: "manual_override" });
  });

  it("uses the exact unit acquisition cost for a partner", () => {
    expect(resolveTagUnitCost({
      costPolicy: "acquisition",
      acquisitionCostCents: 1200,
    })).toEqual({ costCents: 1200, source: "acquisition" });
  });
});

describe("tagSaleCreateSchema", () => {
  it("rejects the same physical piece appearing more than once", () => {
    const tagId = "3b6f8185-bb85-4a2c-8dff-4aa52cd20fd1";
    const parsed = tagSaleCreateSchema.safeParse({
      leadId: 10,
      lines: [
        { salesProductId: 3, tagIds: [tagId], unitPriceCents: 2500 },
        { salesProductId: 3, tagIds: [tagId], unitPriceCents: 2500 },
      ],
      paymentStatus: "paid",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a real partial amount instead of storing a contradictory payment state", () => {
    const base = {
      leadId: 10,
      lines: [{
        salesProductId: 3,
        tagIds: ["3b6f8185-bb85-4a2c-8dff-4aa52cd20fd1"],
        unitPriceCents: 2500,
      }],
      paymentStatus: "partial" as const,
    };

    expect(tagSaleCreateSchema.safeParse(base).success).toBe(false);
    expect(tagSaleCreateSchema.safeParse({ ...base, paidCents: 0 }).success).toBe(false);
    expect(tagSaleCreateSchema.safeParse({ ...base, paidCents: 2500 }).success).toBe(false);
    expect(tagSaleCreateSchema.safeParse({ ...base, paidCents: 1000 }).success).toBe(true);
  });
});

describe("allocateAcquisitionUnitCosts", () => {
  it("preserves the exact line subtotal when cents do not divide evenly", () => {
    expect(allocateAcquisitionUnitCosts(2501, 2)).toEqual([1251, 1250]);
    expect(allocateAcquisitionUnitCosts(2501, 2).reduce((sum, cents) => sum + cents, 0)).toBe(2501);
  });
});
