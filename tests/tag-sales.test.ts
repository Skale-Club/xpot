import { describe, expect, it } from "vitest";
import { allocateAcquisitionUnitCosts, resolveTagUnitCost, saleCostPreview, saleCustomerConflict, suggestSaleCustomer, tagSaleCreateSchema } from "../shared/tagSales.js";

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

describe("sale customer", () => {
  const piece = { leadId: 1, name: "Padaria", placeId: null };
  const sellingTo = { leadId: 2, name: "Bella Nails", placeId: null };
  const visit = { leadId: 3, name: "Tony's", placeId: "p3" };

  it("starts from the piece's own customer, then Selling to, then the visit", () => {
    expect(suggestSaleCustomer({ piece, sellingTo, visit })).toEqual(piece);
    expect(suggestSaleCustomer({ piece: null, sellingTo, visit })).toEqual(sellingTo);
    expect(suggestSaleCustomer({ piece: null, sellingTo: null, visit })).toEqual(visit);
    expect(suggestSaleCustomer({ piece: null, sellingTo: null, visit: null })).toBeNull();
  });

  it("flags a piece linked to someone else, or to anyone when the customer is new", () => {
    const linked = { id: "a", leadId: 1 };
    const free = { id: "b", leadId: null };
    expect(saleCustomerConflict([linked, free], 1)).toBeNull();
    expect(saleCustomerConflict([free], 2)).toBeNull();
    expect(saleCustomerConflict([free, linked], 2)).toBe(linked);
    expect(saleCustomerConflict([linked], null)).toBe(linked);
  });
});

describe("saleCostPreview", () => {
  const carla = (cost: number | null) => ({ repId: 3, repName: "Carla Mendes", acquisitionCostCents: cost });

  it("previews the viewer's own sale with their cost rule", () => {
    expect(saleCostPreview({ viewerRepId: 3, viewerCostPolicy: "acquisition", pieces: [carla(400), carla(600)] })).toEqual({ kind: "own", unitCostCents: 500 });
    expect(saleCostPreview({ viewerRepId: 3, sellerRepId: 3, viewerCostPolicy: "acquisition", pieces: [carla(400)] })).toEqual({ kind: "own", unitCostCents: 400 });
    expect(saleCostPreview({ viewerRepId: 3, viewerCostPolicy: "zero", pieces: [carla(400)] })).toEqual({ kind: "own", unitCostCents: 0 });
  });

  it("names the holder instead of applying the manager's cost when selling in their name", () => {
    // Ana (a manager on the zero rule) sells Carla's piece: Carla's rule applies on the server.
    expect(saleCostPreview({ viewerRepId: 1, sellerRepId: 3, viewerCostPolicy: "zero", pieces: [carla(400)] }))
      .toEqual({ kind: "seller", sellerName: "Carla Mendes" });
    expect(saleCostPreview({ viewerRepId: 1, sellerRepId: 3, viewerCostPolicy: "acquisition", pieces: [{ repId: 3, repName: " ", acquisitionCostCents: null }] }))
      .toEqual({ kind: "seller", sellerName: null });
  });

  it("waits for the viewer before deciding whose sale it is", () => {
    expect(saleCostPreview({ viewerRepId: undefined, sellerRepId: 3, viewerCostPolicy: undefined, pieces: [carla(400)] }).kind).toBe("own");
  });
});
