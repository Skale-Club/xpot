// The distribution seam (server/tags/distribution.ts, docs/PROFILES_EXECUTION_PLAN.md F6, D3): pure answers to who
// receives an order, whose stock fulfils it, and whose stock a hand-out leaves from.
import { describe, expect, it } from "vitest";
import {
  distributionForBuyer,
  distributionOf,
  handOutSource,
  ordersReachXpot,
  type HandOutProducer,
} from "../../server/tags/distribution";

const COMPANY = 1;
const partner = (over: Partial<HandOutProducer> = {}): HandOutProducer => ({ id: 10, distribution: "own", isActive: true, linkedSellerIds: [20], ...over });

describe("distributionOf", () => {
  it("xpot is today's path: Stuscle receives the order, the company's stock fulfils it, nobody here records payment", () => {
    expect(distributionOf({ distribution: "xpot" })).toEqual({
      distribution: "xpot",
      receivesOrdersVia: "stuscle",
      fulfilsFrom: "company",
      recordsPayment: false,
      handsOutTo: "own_people",
    });
  });

  it("own has no Stuscle: the partner's channel receives the order and the partner's stock hands out to linked organizations", () => {
    expect(distributionOf({ distribution: "own" })).toEqual({
      distribution: "own",
      receivesOrdersVia: "partner_offline",
      fulfilsFrom: "partner",
      recordsPayment: false,
      handsOutTo: "linked_organizations",
    });
  });

  it("anything else (a missing value, an old row, nothing) is xpot", () => {
    for (const value of [undefined, null, "", "stuscle", "OWN"]) expect(distributionOf({ distribution: value }).distribution).toBe("xpot");
    expect(distributionOf(null).distribution).toBe("xpot");
    expect(distributionOf(undefined).distribution).toBe("xpot");
  });

  it("never records payment, whatever the path", () => {
    expect(["xpot", "own"].map((d) => distributionOf({ distribution: d }).recordsPayment)).toEqual([false, false]);
  });
});

describe("ordersReachXpot", () => {
  it("is true only for the Stuscle path", () => {
    expect(ordersReachXpot(distributionOf({ distribution: "xpot" }))).toBe(true);
    expect(ordersReachXpot(distributionOf({ distribution: "own" }))).toBe(false);
  });
});

describe("distributionForBuyer", () => {
  it("is xpot for a buyer in an xpot organization with no partner", () => {
    expect(distributionForBuyer({ distribution: "xpot" }, []).distribution).toBe("xpot");
    expect(distributionForBuyer(null, []).distribution).toBe("xpot");
  });

  it("is own when the buyer's own organization is own", () => {
    expect(distributionForBuyer({ distribution: "own" }, []).distribution).toBe("own");
  });

  it("is own when the buyer's organization is linked to an own partner", () => {
    expect(distributionForBuyer({ distribution: "xpot" }, [{ distribution: "own" }]).distribution).toBe("own");
    expect(distributionForBuyer({ distribution: "xpot" }, [{ distribution: "xpot" }, { distribution: "own" }]).distribution).toBe("own");
  });

  it("stays xpot when every partner linked to the buyer is xpot", () => {
    expect(distributionForBuyer({ distribution: "xpot" }, [{ distribution: "xpot" }]).distribution).toBe("xpot");
  });
});

describe("handOutSource", () => {
  const base = { companyOrganizationId: COMPANY, producers: [] as HandOutProducer[] };

  it("the platform (no scope) hands out the company's stock, to anyone", () => {
    expect(handOutSource({ ...base, scope: null, targetOrganizationId: 20 })).toEqual({ ok: true, sourceOrganizationId: COMPANY });
  });

  it("an owner hands out their organization's stock to its own people", () => {
    expect(handOutSource({ ...base, scope: [30], targetOrganizationId: 30 })).toEqual({ ok: true, sourceOrganizationId: 30 });
  });

  it("an owner may not hand out to another organization", () => {
    expect(handOutSource({ ...base, scope: [30], targetOrganizationId: 20 })).toEqual({ ok: false });
  });

  it("the owner of an own partner hands out their own stock to a person of a linked organization", () => {
    expect(handOutSource({ ...base, scope: [10], targetOrganizationId: 20, producers: [partner()] })).toEqual({ ok: true, sourceOrganizationId: 10 });
  });

  it("not to an organization that is not linked", () => {
    expect(handOutSource({ ...base, scope: [10], targetOrganizationId: 21, producers: [partner()] })).toEqual({ ok: false });
  });

  it("not when the partner is on xpot, even with a link left over", () => {
    expect(handOutSource({ ...base, scope: [10], targetOrganizationId: 20, producers: [partner({ distribution: "xpot" })] })).toEqual({ ok: false });
  });

  it("not when the partner is inactive", () => {
    expect(handOutSource({ ...base, scope: [10], targetOrganizationId: 20, producers: [partner({ isActive: false })] })).toEqual({ ok: false });
  });

  it("not through a partner the giver does not own", () => {
    expect(handOutSource({ ...base, scope: [30], targetOrganizationId: 20, producers: [partner()] })).toEqual({ ok: false });
  });

  it("with two partners linking the same seller, the lowest id gives", () => {
    const producers = [partner({ id: 12 }), partner({ id: 11 })];
    expect(handOutSource({ ...base, scope: [11, 12], targetOrganizationId: 20, producers })).toEqual({ ok: true, sourceOrganizationId: 11 });
  });
});
