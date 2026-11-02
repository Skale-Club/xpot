import { describe, expect, it } from "vitest";
import { chipIsMissing, pieceChipState, pieceStatus, type PieceStatusInput } from "../client/src/components/piece/pieceStatus";

// The one status of a piece: the same on the stock list, the pop-up and page, the reseller's app and My pieces.
describe("pieceStatus", () => {
  const base: PieceStatusInput = { status: "inventory", stockStatus: "available", nfcStatus: "not_programmed", saleId: null };
  const cases: Array<[string, Partial<PieceStatusInput>, string, string]> = [
    // [name, piece, key, tone]
    ["in a box, no customer", {}, "noCustomer", "slate"],
    ["not in stock yet", { stockStatus: "pending" }, "pending", "amber"],
    ["print still open", { stockStatus: "pending", printJobStatus: "building" }, "pending", "amber"],
    ["print failed", { stockStatus: "pending", printJobStatus: "failed" }, "printFailed", "red"],
    ["print cancelled", { stockStatus: "pending", printJobStatus: "cancelled" }, "printCancelled", "muted"],
    ["set up, not live", { status: "assigned" }, "ready", "sky"],
    ["live", { status: "active" }, "live", "green"],
    ["paused", { status: "disabled" }, "paused", "amber"],
    ["sold and live", { status: "active", stockStatus: "sold", saleId: 4 }, "soldLive", "blue"],
    ["sold, set up but not live", { status: "assigned", stockStatus: "sold", saleId: 4 }, "soldNotLive", "amber"],
    ["sold, paused", { status: "disabled", stockStatus: "sold", saleId: 4 }, "soldNotLive", "amber"],
    ["sold beats not in stock yet", { stockStatus: "pending", saleId: 4 }, "soldNotLive", "amber"],
    ["damaged beats a sale", { stockStatus: "damaged", saleId: 4, status: "active" }, "damaged", "red"],
    ["lost", { stockStatus: "lost" }, "lost", "red"],
    ["deactivated by status", { status: "retired" }, "retired", "muted"],
    ["deactivated by stock", { stockStatus: "retired" }, "retired", "muted"],
    ["reserved", { stockStatus: "reserved" }, "reserved", "blue"],
    ["internal use", { stockStatus: "internal_use" }, "internalUse", "slate"],
    ["something unknown", { status: "weird", stockStatus: "weird" }, "other", "slate"],
  ];
  it.each(cases)("%s", (_name, piece, key, tone) => {
    const got = pieceStatus({ ...base, ...piece });
    expect([got.key, got.tone]).toEqual([key, tone]);
  });

  it("explains a sold piece that does nothing, and only that one", () => {
    expect(pieceStatus({ ...base, status: "assigned", stockStatus: "sold", saleId: 4 }).note).toBe("soldNotLive");
    expect(pieceStatus({ ...base, status: "active", stockStatus: "sold", saleId: 4 }).note).toBeNull();
    expect(pieceStatus(base).note).toBeNull();
  });
});

describe("pieceChipState: the chip only matters once there is a customer", () => {
  const set = (status: string, nfcStatus: string) => pieceChipState({ status, nfcStatus });
  it("is not asked for before the piece is set up, whatever it holds", () => {
    for (const status of ["inventory", "disabled", "retired"]) expect(set(status, "not_programmed")).toBe("none");
  });
  it("needs writing, failed, untested or fine on a set-up piece", () => {
    for (const status of ["assigned", "active"]) {
      expect(set(status, "not_programmed")).toBe("needsWriting");
      expect(set(status, "failed")).toBe("failed");
      expect(set(status, "programmed")).toBe("untested");
      expect(set(status, "verified")).toBe("fine");
      expect(set(status, "locked")).toBe("fine");
    }
  });
  it("is missing exactly where the reseller's app asks for the chip (chipNeedsWriting)", () => {
    expect(chipIsMissing("needsWriting")).toBe(true);
    expect(chipIsMissing("failed")).toBe(true);
    expect(chipIsMissing("untested")).toBe(false);
    expect(chipIsMissing("fine")).toBe(false);
    expect(chipIsMissing("none")).toBe(false);
  });
});
