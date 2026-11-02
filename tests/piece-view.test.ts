import { describe, expect, it } from "vitest";
import type { TagHistoryEntry, TagJourneyEntryItem, TagPieceSale, TagStockMovementItem } from "../shared/tagsApi";
import {
  canCancelPieceSale,
  fillDailySeries,
  kitShort,
  mergePieceTimeline,
  pieceActionUrl,
  pieceCrossLink,
  pieceIsSold,
  pieceLocation,
  pieceSections,
  pieceHasLocation,
  pieceHolderLine,
  pieceSituation,
  pieceStatusChips,
  showsReceive,
  type PieceViewer,
} from "../client/src/components/piece/pieceView";

const history = (id: string, createdAt: string): TagHistoryEntry => ({
  id, previousUrl: null, newUrl: "https://a.test", previousDestinationType: null, newDestinationType: "website",
  changedByUserId: null, changedByEmail: null, changedByName: null, reason: null, createdAt,
});
const sale = (saleId: number, soldAt: string, endedAt: string | null = null): TagPieceSale => ({
  saleId, status: endedAt ? "cancelled" : "active", soldAt, endedAt, priceCents: 2500, currency: "USD",
  sellerRepId: 1, sellerName: "Ana", paymentStatus: "paid", cancelReason: null,
});
const movement = (id: string, movementType: string, createdAt: string, referenceType: string | null = null): TagStockMovementItem => ({
  id, movementType, fromStockStatus: "available", toStockStatus: "available", fromOwnershipType: "company", toOwnershipType: "company",
  fromCustodianName: null, toCustodianName: "Ana", referenceType, referenceId: referenceType ? "7" : null, reason: null, actorEmail: null, actorName: null, createdAt,
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
    expect(pieceLocation({ repId: 3, repName: "Carla", kitId: "0123456789abcdef", kitCode: "K-0007" })).toEqual({ kind: "reseller", repId: 3, name: "Carla", kit: "K-0007" });
    expect(kitShort(null)).toBeNull();
    expect(kitShort(null, "K-0001")).toBeNull();
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

describe("canCancelPieceSale", () => {
  const seller: PieceViewer = { surface: "field", canManage: false, isAdmin: false, hasVisits: true, repId: 1 };
  const ownSale = sale(9, "2026-10-10T10:00:00Z");

  it("lets a manager cancel any sale", () => {
    expect(canCancelPieceSale({ ...seller, canManage: true, repId: 5 }, ownSale)).toBe(true);
    expect(canCancelPieceSale({ ...seller, canManage: true, repId: 5 }, undefined)).toBe(true);
  });

  it("lets the seller cancel their own sale when they have Visits", () => {
    expect(canCancelPieceSale(seller, ownSale)).toBe(true);
    // The server's cancel sits in the Visits module.
    expect(canCancelPieceSale({ ...seller, hasVisits: false }, ownSale)).toBe(false);
  });

  it("never someone else's sale, nor one not loaded yet", () => {
    expect(canCancelPieceSale({ ...seller, repId: 2 }, ownSale)).toBe(false);
    expect(canCancelPieceSale({ ...seller, repId: null }, ownSale)).toBe(false);
    expect(canCancelPieceSale(seller, undefined)).toBe(false);
  });
});

describe("the header never contradicts the status", () => {
  const admin = { surface: "admin", canManage: true, isAdmin: true, hasVisits: true, repId: 1, producesPrints: true } as const;
  const rep = { surface: "field", canManage: false, isAdmin: false, hasVisits: true, repId: 2 } as const;
  const piece = { status: "inventory", stockStatus: "pending", nfcStatus: "not_programmed", saleId: null, leadId: null, destinationUrl: null, destinationType: null, batchId: "b-1", printJobId: "j-1" };
  const receivable = { receive: { targets: ["me"], blocker: null } } as never;

  it("says waiting to print only to whoever produces, and only while the print is open", () => {
    const open = pieceSituation({ ...piece, printJobStatus: "ready" }, admin);
    expect([open.key, open.hint, open.action?.kind]).toEqual(["pending", "waitingPrint", "openPrint"]);
    const done = pieceSituation({ ...piece, printJobStatus: "printed" }, admin);
    expect([done.key, done.hint, done.action?.kind]).toEqual(["pending", undefined, "openPrint"]);
    expect(pieceSituation({ ...piece, printJobStatus: "ready", custody: receivable }, rep).key).toBe("pending");
  });

  it("tells a reseller with nothing to do who to ask", () => {
    const stuck = pieceSituation({ ...piece, printJobStatus: "ready" }, rep);
    expect([stuck.action, stuck.hint]).toEqual([null, "askManager"]);
  });

  it.each([
    ["pending", "inventory", false], ["sold", "active", false], ["damaged", "inventory", false], ["lost", "inventory", false],
    ["retired", "retired", false], ["available", "retired", false],
    ["available", "inventory", true], ["available", "active", true], ["reserved", "inventory", true], ["internal_use", "inventory", true],
  ])("stock %s, status %s: location shown is %s", (stockStatus, status, shown) => {
    expect(pieceHasLocation({ status, stockStatus })).toBe(shown);
  });
});

describe("pieceSituation", () => {
  const rep: PieceViewer = { surface: "field", canManage: false, isAdmin: false, hasVisits: false };
  const manager: PieceViewer = { ...rep, canManage: true };
  const admin: PieceViewer = { surface: "admin", canManage: true, isAdmin: true, hasVisits: true };
  const partner: PieceViewer = { surface: "admin", canManage: true, isAdmin: false, hasVisits: false, producesPrints: true };
  const base = {
    status: "inventory", stockStatus: "available", nfcStatus: "verified", saleId: null as number | null,
    leadId: null as number | null, destinationUrl: null as string | null, destinationType: null as string | null,
    batchId: null as string | null, printJobId: null as string | null,
  };
  const set = { leadId: 4, destinationUrl: "https://a.test", destinationType: "website" };
  const receivable = { receive: { targets: ["me" as const], blocker: null } };
  const blocked = { receive: { targets: ["me" as const], blocker: "batch_closed" as const } };

  const cases: Array<[string, Partial<typeof base> & { custody?: unknown }, PieceViewer, string, string, string | null]> = [
    // [name, piece, viewer, key, tone, action]
    ["damaged stock", { stockStatus: "damaged", status: "assigned", ...set }, rep, "damaged", "red", null],
    ["lost stock", { stockStatus: "lost" }, admin, "lost", "red", null],
    ["retired status", { status: "retired" }, rep, "retired", "muted", null],
    ["retired stock", { stockStatus: "retired" }, rep, "retired", "muted", null],
    ["a piece damaged and sold is damaged", { stockStatus: "damaged", saleId: 3 }, rep, "damaged", "red", null],
    ["sale recorded", { status: "active", stockStatus: "sold", saleId: 9, ...set }, rep, "soldLive", "blue", "viewPerformance"],
    ["sale beats pending", { stockStatus: "pending", saleId: 9 }, rep, "soldNotLive", "amber", "configure"],
    ["sold and live, chip never written: the chip first", { status: "active", stockStatus: "sold", saleId: 9, nfcStatus: "not_programmed", ...set }, rep, "soldLive", "blue", "writeChip"],
    ["sold, set up, not live: put it live", { status: "assigned", stockStatus: "sold", saleId: 9, ...set }, rep, "soldNotLive", "amber", "goLive"],
    ["sold, not live, chip not written: write it", { status: "assigned", stockStatus: "sold", saleId: 9, nfcStatus: "not_programmed", ...set }, rep, "soldNotLive", "amber", "writeChip"],
    ["sold and paused, no link to restore: no action", { status: "disabled", stockStatus: "sold", saleId: 9, leadId: 4 }, rep, "soldNotLive", "amber", null],
    ["pending, reseller who may receive", { stockStatus: "pending", custody: receivable }, rep, "pending", "amber", "receive"],
    ["pending, receive blocked", { stockStatus: "pending", custody: blocked }, rep, "pending", "amber", null],
    ["pending, no custody data", { stockStatus: "pending" }, rep, "pending", "amber", null],
    ["pending, house print, admin: opens the print, no receive", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", custody: receivable }, admin, "pending", "amber", "openPrint"],
    ["pending, house print, partner who produces", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", custody: receivable }, partner, "pending", "amber", "openPrint"],
    ["pending, house print, print opens even with a blocker", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", custody: blocked }, admin, "pending", "amber", "openPrint"],
    ["pending, supplier lot, admin receives", { stockStatus: "pending", batchId: "b-1", custody: receivable }, admin, "pending", "amber", "receive"],
    ["pending, supplier lot, partner who produces receives", { stockStatus: "pending", batchId: "b-1", custody: receivable }, partner, "pending", "amber", "receive"],
    ["pending, supplier lot, receive blocked", { stockStatus: "pending", batchId: "b-1", custody: blocked }, admin, "pending", "amber", null],
    ["pending, no batch, admin receives", { stockStatus: "pending", custody: receivable }, admin, "pending", "amber", "receive"],
    ["pending, house print, ordinary manager still receives", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", custody: receivable }, manager, "pending", "amber", "receive"],
    ["pending, house print, ordinary manager without receive", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1" }, manager, "pending", "amber", null],
    ["pending, house print, reseller still receives", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", custody: receivable }, rep, "pending", "amber", "receive"],
    ["pending, supplier lot, reseller receives", { stockStatus: "pending", batchId: "b-1", custody: receivable }, rep, "pending", "amber", "receive"],
    ["pending, supplier lot, reseller with a blocker", { stockStatus: "pending", batchId: "b-1", custody: blocked }, rep, "pending", "amber", null],
    ["live, chip checked", { status: "active", nfcStatus: "verified", ...set }, rep, "live", "green", "viewPerformance"],
    ["live, chip written and not yet checked", { status: "active", nfcStatus: "programmed", ...set }, rep, "live", "green", "viewPerformance"],
    ["live, chip not written: the chip comes before the numbers", { status: "active", nfcStatus: "not_programmed", ...set }, rep, "live", "green", "writeChip"],
    ["live, chip write failed", { status: "active", nfcStatus: "failed", ...set }, rep, "live", "green", "writeChip"],
    ["paused", { status: "disabled", ...set }, rep, "paused", "amber", "reactivate"],
    ["paused but activation blocked: no action", { status: "disabled", leadId: 4 }, rep, "paused", "amber", null],
    ["assigned, chip not written", { status: "assigned", nfcStatus: "not_programmed", ...set }, rep, "ready", "sky", "writeChip"],
    ["assigned, chip write failed", { status: "assigned", nfcStatus: "failed", ...set }, rep, "ready", "sky", "writeChip"],
    ["assigned, chip written", { status: "assigned", nfcStatus: "programmed", ...set }, rep, "ready", "sky", "goLive"],
    ["assigned, chip verified", { status: "assigned", nfcStatus: "verified", ...set }, rep, "ready", "sky", "goLive"],
    ["assigned, chip locked", { status: "assigned", nfcStatus: "locked", ...set }, rep, "ready", "sky", "goLive"],
    ["assigned but no link: go live is not offered", { status: "assigned", nfcStatus: "verified", leadId: 4 }, rep, "ready", "sky", null],
    ["in stock, no customer", { status: "inventory", stockStatus: "available" }, rep, "noCustomer", "slate", "configure"],
    ["reserved stock is not offered for set-up", { status: "inventory", stockStatus: "reserved" }, rep, "reserved", "blue", null],
    ["internal use", { status: "inventory", stockStatus: "internal_use" }, rep, "internalUse", "slate", null],
    ["print failed, the producer opens the print", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", printJobStatus: "failed" }, admin, "printFailed", "red", "openPrint"],
    ["print failed, a reseller can only ask", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", printJobStatus: "failed" }, rep, "printFailed", "red", null],
    ["print cancelled", { stockStatus: "pending", batchId: "b-1", printJobId: "j-1", printJobStatus: "cancelled" }, admin, "printCancelled", "muted", "openPrint"],
    ["unknown status does not break", { status: "weird", stockStatus: "weird", nfcStatus: "weird" }, rep, "other", "slate", null],
  ];
  it.each(cases)("%s", (_name, piece, viewer, key, tone, action) => {
    const got = pieceSituation({ ...base, ...piece } as Parameters<typeof pieceSituation>[0], viewer);
    expect([got.key, got.tone, got.action?.kind ?? null]).toEqual([key, tone, action]);
  });

  it("links the print action to the print order of the piece", () => {
    const got = pieceSituation({ ...base, stockStatus: "pending", batchId: "b-1", printJobId: "job 1" }, admin);
    expect(got.action).toEqual({ kind: "openPrint", href: "/admin/tags/production/jobs/job%201" });
  });
});

describe("showsReceive", () => {
  const rep: PieceViewer = { surface: "field", canManage: false, isAdmin: false, hasVisits: false };
  const manager: PieceViewer = { ...rep, canManage: true };
  const admin: PieceViewer = { surface: "admin", canManage: true, isAdmin: true, hasVisits: true };
  const partner: PieceViewer = { ...manager, producesPrints: true };
  const cases: Array<[string, { printJobId?: string | null }, PieceViewer, boolean]> = [
    ["house print, admin", { printJobId: "j" }, admin, false],
    ["house print, partner who produces", { printJobId: "j" }, partner, false],
    ["house print, ordinary manager", { printJobId: "j" }, manager, true],
    ["house print, reseller", { printJobId: "j" }, rep, true],
    ["house print, producer without management on", { printJobId: "j" }, { ...partner, canManage: false }, true],
    ["supplier lot, admin", { printJobId: null }, admin, true],
    ["supplier lot, partner who produces", { printJobId: null }, partner, true],
    ["supplier lot, reseller", { printJobId: null }, rep, true],
    ["no data yet", {}, admin, true],
  ];
  it.each(cases)("%s", (_name, tag, viewer, expected) => {
    expect(showsReceive(tag, viewer)).toBe(expected);
  });
});

describe("pieceHolderLine: who has the piece", () => {
  const piece = { status: "inventory", stockStatus: "available", repId: null as number | null, repName: null as string | null, kitId: null as string | null, kitCode: null as string | null, leadName: null as string | null };
  const kevin = { repId: 5, repName: "Kevin Brooks", kitId: "k-1", kitCode: "K-0003" };
  const rep = { repId: 5, canManage: false };
  const manager = { repId: 1, canManage: true };
  it("company stock is the company's, and only while there is no customer", () => {
    expect(pieceHolderLine(piece, rep)).toEqual({ kind: "company" });
    expect(pieceHolderLine({ ...piece, leadName: "Malden Hardware", status: "active" }, rep)).toBeNull();
  });
  it("a reseller reads their own piece as 'with you', no kit", () => {
    expect(pieceHolderLine({ ...piece, ...kevin }, rep)).toEqual({ kind: "you" });
  });
  it("another reseller is named, and the kit is for those who manage", () => {
    expect(pieceHolderLine({ ...piece, ...kevin }, { repId: 9, canManage: false })).toEqual({ kind: "with", repId: 5, name: "Kevin Brooks", kit: null });
    expect(pieceHolderLine({ ...piece, ...kevin }, manager)).toEqual({ kind: "with", repId: 5, name: "Kevin Brooks", kit: "K-0003" });
  });
  it("a piece at its customer is not 'with' anybody: the customer answers; another reseller is still named", () => {
    const live = { ...piece, ...kevin, status: "active", leadName: "Malden Hardware" };
    expect(pieceHolderLine(live, rep)).toBeNull();
    expect(pieceHolderLine(live, manager)).toEqual({ kind: "reseller", repId: 5, name: "Kevin Brooks", kit: "K-0003" });
  });
  it("nobody holds a piece that is not in stock yet, sold, lost or deactivated", () => {
    for (const stockStatus of ["pending", "sold", "damaged", "lost", "retired"]) expect(pieceHolderLine({ ...piece, ...kevin, stockStatus }, manager)).toBeNull();
    expect(pieceHolderLine({ ...piece, status: "retired" }, manager)).toBeNull();
  });
});
