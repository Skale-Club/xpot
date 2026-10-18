import { describe, expect, it } from "vitest";
import type { TagHistoryEntry, TagJourneyEntryItem, TagPieceSale, TagStockMovementItem } from "../shared/tagsApi";
import {
  fillDailySeries,
  kitShort,
  mergePieceTimeline,
  pieceActionUrl,
  pieceCrossLink,
  pieceIsSold,
  pieceLocation,
  pieceSections,
  pieceStatusChips,
  type PieceViewer,
} from "../client/src/components/piece/pieceView";

const history = (id: string, createdAt: string): TagHistoryEntry => ({
  id, previousUrl: null, newUrl: "https://a.test", previousDestinationType: null, newDestinationType: "website",
  changedByUserId: null, changedByEmail: null, reason: null, createdAt,
});
const sale = (saleId: number, soldAt: string, endedAt: string | null = null): TagPieceSale => ({
  saleId, status: endedAt ? "cancelled" : "active", soldAt, endedAt, priceCents: 2500, currency: "USD",
  sellerRepId: 1, sellerName: "Ana", paymentStatus: "paid", cancelReason: null,
});
const movement = (id: string, movementType: string, createdAt: string, referenceType: string | null = null): TagStockMovementItem => ({
  id, movementType, fromStockStatus: "available", toStockStatus: "available", fromOwnershipType: "company", toOwnershipType: "company",
  fromCustodianName: null, toCustodianName: "Ana", referenceType, referenceId: referenceType ? "7" : null, reason: null, actorEmail: null, createdAt,
});
const journey = (id: string, action: string | null, occurredAt: string): TagJourneyEntryItem => ({
  id, kind: "execution", action, title: action ?? "note", content: null, batchId: null, batchCode: null, tagId: "t", publicCode: "P1",
  serialNumber: null, kitId: null, repId: null, repName: null, leadId: null, leadName: null, planId: null, planTitle: null,
  beforeValue: null, afterValue: null, source: "system", actor: "system", actorUserId: null, actorEmail: null, actorRepId: null,
  actorName: null, status: "active", metadata: {}, occurredAt, createdAt: occurredAt,
});

describe("pieceStatusChips", () => {
  it("labels the three dimensions with their tone maps, in a fixed order", () => {
    expect(pieceStatusChips({ status: "active", stockStatus: "available", nfcStatus: "verified" })).toEqual([
      { dimension: "digital", value: "active", tone: "green" },
      { dimension: "stock", value: "available", tone: "slate" },
      { dimension: "chip", value: "verified", tone: "green" },
    ]);
  });

  it("keeps the blue for the Sold pill: stock that left with the customer is neutral", () => {
    const [, stock] = pieceStatusChips({ status: "active", stockStatus: "sold", nfcStatus: "programmed" });
    expect(stock).toEqual({ dimension: "stock", value: "sold", tone: "slate" });
  });

  it("flags what needs a step and what is broken", () => {
    const chips = pieceStatusChips({ status: "assigned", stockStatus: "pending", nfcStatus: "failed" });
    expect(chips.map((c) => c.tone)).toEqual(["amber", "amber", "red"]);
    // An unknown chip state reads as "needs a step", not as fine.
    expect(pieceStatusChips({ status: "inventory", stockStatus: "damaged", nfcStatus: "weird" })[2].tone).toBe("amber");
  });

  it("sold means a financial sale only", () => {
    expect(pieceIsSold({ saleId: 12 })).toBe(true);
    expect(pieceIsSold({ saleId: null })).toBe(false);
  });
});

describe("pieceLocation", () => {
  it("is house stock without a holder, else the reseller and their kit", () => {
    expect(pieceLocation({ repId: null, repName: null, kitId: "abc" })).toEqual({ kind: "house" });
    expect(pieceLocation({ repId: 3, repName: "Carla", kitId: "0123456789abcdef" })).toEqual({ kind: "reseller", repId: 3, name: "Carla", kit: "01234567" });
    expect(pieceLocation({ repId: 3, repName: null, kitId: null })).toEqual({ kind: "reseller", repId: 3, name: null, kit: null });
    expect(kitShort(null)).toBeNull();
  });
});

describe("pieceSections and links", () => {
  const rep: PieceViewer = { surface: "field", canManage: false, isAdmin: false, hasVisits: false };
  const managerOnField: PieceViewer = { ...rep, canManage: true };
  const adminPage: PieceViewer = { surface: "admin", canManage: true, isAdmin: true, hasVisits: true };

  it("gives the reseller the four working sections", () => {
    expect(pieceSections(rep)).toEqual(["customer", "chip", "sale", "performance"]);
  });

  it("adds Management for a manager on the reseller screen, and Activity on the admin page", () => {
    expect(pieceSections(managerOnField)).toEqual(["customer", "chip", "sale", "performance", "management"]);
    expect(pieceSections(adminPage)).toEqual(["customer", "chip", "sale", "performance", "management", "activity"]);
  });

  it("cross-links the two views for managers only", () => {
    const tag = { id: "uuid-1", publicCode: "3KC26A11", repId: 3 };
    expect(pieceCrossLink(rep, tag)).toBeNull();
    expect(pieceCrossLink(managerOnField, tag)).toEqual({ to: "admin", href: "/admin/tags/pieces/uuid-1" });
    expect(pieceCrossLink(adminPage, tag)).toEqual({ to: "field", href: "/tags/t/3KC26A11" });
    // A house piece has no reseller view to open.
    expect(pieceCrossLink(adminPage, { ...tag, repId: null })).toBeNull();
  });

  it("sends each action to the API that takes it", () => {
    expect(pieceActionUrl("admin", "disable", "x")).toBe("/api/xpot/tags/x/disable");
    expect(pieceActionUrl("field", "activate", "x")).toBe("/api/xpot/tags/x/activate");
    expect(pieceActionUrl("field", "unassign", "x")).toBe("/api/xpot/tags/x/unassign");
    expect(pieceActionUrl("admin", "unassign", "x")).toBe("/api/xpot/admin/tags/x/unassign");
    expect(pieceActionUrl("admin", "retire", "x")).toBe("/api/xpot/admin/tags/x/retire");
    expect(pieceActionUrl("field", "damage", "x")).toBe("/api/xpot/admin/tags/x/damage");
  });
});

describe("mergePieceTimeline", () => {
  it("puts every source in one list, newest first", () => {
    const events = mergePieceTimeline({
      history: [history("h1", "2026-10-01T10:00:00Z"), history("h2", "2026-10-05T10:00:00Z")],
      sales: [sale(7, "2026-10-03T10:00:00Z")],
      movements: [movement("m1", "transfer", "2026-09-30T10:00:00Z")],
      journey: [journey("j1", "tag_activated", "2026-10-02T10:00:00Z")],
    });
    expect(events.map((e) => e.id)).toEqual(["h-h2", "s-7", "j-j1", "h-h1", "m-m1"]);
  });

  it("shows a cancelled sale twice: when it was made and when it was cancelled", () => {
    const events = mergePieceTimeline({ history: [], sales: [sale(7, "2026-10-03T10:00:00Z", "2026-10-04T09:00:00Z")] });
    expect(events.map((e) => [e.kind, e.at])).toEqual([
      ["sale_cancelled", "2026-10-04T09:00:00Z"],
      ["sale", "2026-10-03T10:00:00Z"],
    ]);
  });

  it("tells each fact once", () => {
    const events = mergePieceTimeline({
      history: [history("h1", "2026-10-01T10:00:00Z")],
      sales: [sale(7, "2026-10-03T10:00:00Z", "2026-10-04T09:00:00Z")],
      movements: [
        movement("m-sale", "sale", "2026-10-03T10:00:00Z", "sale"),
        movement("m-back", "restore", "2026-10-04T09:00:00Z", "sale"),
        movement("m-kit", "transfer", "2026-09-30T10:00:00Z", "kit"),
      ],
      journey: [
        journey("j-dest", "destination_changed", "2026-10-01T10:00:00Z"),
        journey("j-kit", "kit_delivered", "2026-09-30T10:00:00Z"),
        journey("j-intake", "piece_scanned_into_batch", "2026-09-29T11:00:00Z"),
        journey("j-note", null, "2026-09-29T10:00:00Z"),
      ],
    });
    expect(events.map((e) => e.id)).toEqual(["sc-7", "s-7", "h-h1", "m-m-kit", "j-j-note"]);
  });

  it("keeps the journey's stock entries when the movements are not loaded", () => {
    const events = mergePieceTimeline({ history: [], movements: null, journey: [journey("j-kit", "kit_delivered", "2026-09-30T10:00:00Z")] });
    expect(events.map((e) => e.id)).toEqual(["j-j-kit"]);
  });

  it("keeps the stock side of a sale when the sales are not loaded", () => {
    const events = mergePieceTimeline({ history: [], sales: null, movements: [movement("m-sale", "sale", "2026-10-03T10:00:00Z", "sale")] });
    expect(events.map((e) => e.id)).toEqual(["m-m-sale"]);
  });

  it("orders events of the same instant: sale, then stock, then destination, then journey", () => {
    const at = "2026-10-03T10:00:00Z";
    const events = mergePieceTimeline({
      history: [history("h1", at)],
      sales: [sale(7, at)],
      movements: [movement("m1", "transfer", at)],
      journey: [journey("j1", "tag_activated", at)],
    });
    expect(events.map((e) => e.kind)).toEqual(["sale", "stock", "destination", "journey"]);
  });
});

describe("fillDailySeries", () => {
  it("fills the days the analytics left out", () => {
    const series = fillDailySeries("2026-10-01T15:00:00.000Z", "2026-10-04T08:00:00.000Z", [{ day: "2026-10-02", qr: 2, nfc: 1, approxUnique: 2 }]);
    expect(series.map((d) => [d.day, d.qr, d.nfc])).toEqual([
      ["2026-10-01", 0, 0],
      ["2026-10-02", 2, 1],
      ["2026-10-03", 0, 0],
      ["2026-10-04", 0, 0],
    ]);
  });

  it("treats a midnight end as exclusive (a custom range ending on the day before)", () => {
    expect(fillDailySeries("2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z", []).map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("gives the rows back as they are when the window makes no sense", () => {
    const daily = [{ day: "2026-10-02", qr: 1, nfc: 0, approxUnique: 1 }];
    expect(fillDailySeries("bad", "2026-10-03T00:00:00.000Z", daily)).toEqual(daily);
  });
});
