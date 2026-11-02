import { describe, expect, it } from "vitest";
import { computeSettlement } from "../shared/pricing";
import { overCountDelta, parseSettleCount, settlePayment, settleCountState, takeBackState } from "../client/src/pages/xpot/components/sales/settleCount";

describe("parseSettleCount", () => {
  it("treats an empty or unreadable field as no count", () => {
    expect(parseSettleCount("")).toBeNull();
    expect(parseSettleCount("   ")).toBeNull();
    expect(parseSettleCount("abc")).toBeNull();
  });

  it("reads a whole number, never below zero", () => {
    expect(parseSettleCount("10")).toBe(10);
    expect(parseSettleCount(" 7 ")).toBe(7);
    expect(parseSettleCount("0")).toBe(0);
    expect(parseSettleCount("3.9")).toBe(3);
    expect(parseSettleCount("-4")).toBe(0);
  });
});

describe("settleCountState", () => {
  it("does not let an untouched dialog settle", () => {
    expect(settleCountState(18, null)).toBe("empty");
  });

  it("treats a counted zero as a real count: the shelf was found empty", () => {
    expect(settleCountState(18, 0)).toBe("ready");
  });

  it("is ready for a count up to what is on record, over beyond it", () => {
    expect(settleCountState(18, 10)).toBe("ready");
    expect(settleCountState(18, 18)).toBe("ready");
    expect(settleCountState(18, 19)).toBe("over");
  });
});

// The money rule behind the dialog: with no count the dialog shows no amount at all, so the
// $63.00 of "everything sold" can only appear when the rep really counted an empty shelf.
describe("what a settlement bills", () => {
  const price = 350;

  it("bills what is missing from the shelf once it is counted", () => {
    const counted = parseSettleCount("10");
    expect(settleCountState(18, counted)).toBe("ready");
    expect(computeSettlement({ onHand: 18, countedRemaining: counted!, unitPriceCents: price })).toMatchObject({ soldQuantity: 8, amountCents: 2800 });
  });

  it("bills everything only for a counted zero, never for an empty field", () => {
    expect(settleCountState(18, parseSettleCount(""))).toBe("empty");
    const counted = parseSettleCount("0");
    expect(settleCountState(18, counted)).toBe("ready");
    expect(computeSettlement({ onHand: 18, countedRemaining: counted!, unitPriceCents: price })).toMatchObject({ soldQuantity: 18, amountCents: 6300 });
  });
});

describe("settlePayment", () => {
  it("records nothing as received until a choice is made", () => {
    expect(settlePayment(null, "", 0, 3500)).toBeNull();
    expect(settlePayment(null, "cash", 0, 3500)).toBeNull();
  });

  it("'they will pay later' records no payment and no way of paying", () => {
    expect(settlePayment("later", "", 0, 3500)).toEqual({ paymentStatus: "unpaid", paymentMethod: null });
    // A way picked before changing their mind is not recorded for money that did not arrive.
    expect(settlePayment("later", "cash", 0, 3500)).toEqual({ paymentStatus: "unpaid", paymentMethod: null });
  });

  it("'they paid' needs the way they paid, and never picks cash for the rep", () => {
    expect(settlePayment("paid", "", 0, 3500)).toBeNull();
    expect(settlePayment("paid", "card", 0, 3500)).toEqual({ paymentStatus: "paid", paymentMethod: "card" });
  });

  it("a part needs the way and an amount above nothing and below the bill", () => {
    expect(settlePayment("partial", "cash", 0, 3500)).toBeNull();
    expect(settlePayment("partial", "cash", 3500, 3500)).toBeNull();
    expect(settlePayment("partial", "", 1000, 3500)).toBeNull();
    expect(settlePayment("partial", "cash", 1000, 3500)).toEqual({ paymentStatus: "partial", paymentMethod: "cash", paidCents: 1000 });
  });
});

describe("taking stock back", () => {
  it("starts empty and only 'all' may end the agreement", () => {
    expect(takeBackState(18, null)).toBe("empty");
    expect(takeBackState(18, 0)).toBe("empty");
    expect(takeBackState(18, 6)).toBe("some");
    expect(takeBackState(18, 18)).toBe("all");
    expect(takeBackState(18, 19)).toBe("over");
  });

  it("the difference to correct is what the shelf holds above the record", () => {
    expect(overCountDelta(18, 21)).toBe(3);
    expect(overCountDelta(18, 18)).toBe(0);
    expect(overCountDelta(18, 10)).toBe(0);
  });
});
