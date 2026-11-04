import { describe, expect, it } from "vitest";
import type { PrintModelItem, PrintRequestItem } from "../shared/printProduction";
import { parseBatchName, batchTabsFor, pendingBatches } from "../client/src/pages/admin/tags/batches-model";
import { piecesAwaitingPrinted, assemblyParts, buildState, collapsedPlates, damagedToReprint, needsPrintComputer, journeyTitle, personName, plainTitle, batchPrefixFromTitle, boardGroups, chipsWritten, pauseNeedsChips, canAssembleJob, canPrintModel, journeyProgress, latestPlates, pendingPieces, plateActions, printableBeds, printComputers, printedOutcome, printQuantity, productionNeedsAction, productionPath, productionTabFor, showPlateNumber, slugFromTitle } from "../client/src/pages/admin/tags/production-workflow";

const model = {
  id: "model", kind: "serialized", status: "ready", productType: "large_plate", face: "google_review", salesProductId: 1,
  currentVersion: { builder: "plate.google", beds: [{ label: "x4", copies: 4 }, { label: "x8", copies: 8 }] },
} as PrintModelItem;
const batch = { id: "batch", batchCode: "LP-001", productType: "large_plate", face: "google_review", salesProductId: 1, tagCount: 6 };

describe("the bar of pieces waiting to be marked printed", () => {
  const plate = (status: string, quantity: number) => ({ status, quantity, downloads: [], redoneBy: null });
  const request = (modelKind: string, ...plates: unknown[]) => ({ modelKind, plates }) as unknown as PrintRequestItem;
  it("counts the pieces of the plates that can be marked printed, parts and finished plates apart", () => {
    expect(piecesAwaitingPrinted([])).toBe(0);
    expect(piecesAwaitingPrinted([request("serialized", plate("ready", 4), plate("printing", 2), plate("printed", 4), plate("requested", 8), plate("failed", 4))])).toBe(6);
    expect(piecesAwaitingPrinted([request("part", plate("ready", 16))])).toBe(0);
  });
});

describe("production tabs", () => {
  it("lights Models only on /models and Produce on every other view, the orders list included", () => {
    expect(productionTabFor(undefined)).toBe("board");
    expect(productionTabFor("queue")).toBe("board");
    expect(productionTabFor("batches")).toBe("board");
    expect(productionTabFor("jobs")).toBe("board");
    expect(productionTabFor("models")).toBe("catalog");
    expect(productionTabFor("printing")).toBe("board");
  });
});

describe("unified production", () => {
  it("reviews assembly parts for the selected NFC without changing the model recipe", () => {
    const original = [{ part: "round", perPiece: 1 }];
    const configured = { ...model, currentVersion: { ...model.currentVersion!, consumes: original,
      nfcVariants: { sticker_10x20: { pause: { z: 1, text: "Insert NFC" }, consumes: [{ part: "base", perPiece: 1 }, { part: "rectangle", perPiece: 1 }] } },
    } } as PrintModelItem;
    const names = new Map([["round", { title: "Round NFC" }], ["rectangle", { title: "Rectangle NFC" }], ["base", { title: "Base" }]]);
    expect(assemblyParts(configured, names, "sticker_10x20")).toEqual(["1 Base", "1 Rectangle NFC"]);
    expect(assemblyParts(configured, names)).toEqual(["1 Round NFC"]);
    expect(configured.currentVersion!.consumes).toEqual(original);
  });
  it("walks file, printer, stock and done; a failed or cancelled job is on no step", () => {
    const at = (status: string, extra = {}) => journeyProgress({ status, batchId: "b", pendingCount: 0, ...extra } as never);
    expect(at("requested")).toBe(0);
    expect(at("building")).toBe(0);
    expect(at("ready")).toBe(1);
    expect(at("printing")).toBe(1);
    expect(at("printed")).toBe(3);
    // Printed, but the pieces are not in stock: it is not "completed" yet.
    expect(at("printed", { pendingCount: 8 })).toBe(2);
    expect(at("printed", { batchId: null, pendingCount: null })).toBe(3);
    expect(at("failed")).toBeNull();
    expect(at("cancelled")).toBeNull();
  });
  it("tells what a printed job did to its pieces, pending first", () => {
    expect(printedOutcome({ batchId: null, pendingCount: null, damagedCount: null })).toBe("count");
    expect(printedOutcome({ batchId: "b", pendingCount: 8, damagedCount: 0 })).toBe("pending");
    expect(printedOutcome({ batchId: "b", pendingCount: 2, damagedCount: 2 })).toBe("pending");
    expect(printedOutcome({ batchId: "b", pendingCount: 0, damagedCount: 2 })).toBe("damaged");
    expect(printedOutcome({ batchId: "b", pendingCount: 0, damagedCount: 0 })).toBe("inStock");
  });
  it("assembles only a printed job whose pieces are all in stock", () => {
    const job = { status: "printed", batchId: "b", pendingCount: 0 } as const;
    expect(canAssembleJob(job, 1, null)).toBe(true);
    expect(canAssembleJob({ ...job, pendingCount: 8 }, 1, null)).toBe(false);
    expect(canAssembleJob(job, 0, null)).toBe(false);
    expect(canAssembleJob(job, 1, "2026-11-01")).toBe(false);
    expect(canAssembleJob({ ...job, status: "ready" }, 1, null)).toBe(false);
    expect(canAssembleJob({ ...job, batchId: null }, 1, null)).toBe(false);
  });
  it("offers Mark printed only once the job is on the printer, never without a file or before the file was taken", () => {
    const job = (status: string, files = 1, redoneBy: string | null = null) => ({ status, redoneBy, downloads: Array.from({ length: files }, (_, i) => ({ id: String(i), kind: "gcode_3mf", filename: "x" })) }) as never;
    expect(plateActions(job("requested", 0))).toEqual([]);
    expect(plateActions(job("building", 0))).toEqual([]);
    expect(plateActions(job("ready"))).toEqual(["markPrinted", "download"]);
    expect(plateActions(job("ready", 0))).toEqual(["markPrinted"]);
    expect(plateActions(job("printing"))).toEqual(["markPrinted", "download"]);
    expect(plateActions(job("failed"))).toEqual(["printAgain"]);
    expect(plateActions(job("failed", 1, "next"))).toEqual([]);
    expect(plateActions(job("printed"))).toEqual([]);
    expect(plateActions(job("cancelled"))).toEqual([]);
    for (const status of ["requested", "building", "failed", "cancelled", "printed"]) expect(plateActions(job(status))).not.toContain("markPrinted");
  });
  it("groups the board by what the operator must do, failed first, and only the last attempt of each plate", () => {
    const plate = (plateNumber: number, status: string, createdAt: string, redoneBy: string | null = null) => ({ plateNumber, status, createdAt, redoneBy }) as never;
    const request = (id: string, ...plates: unknown[]) => ({ id, plates, open: true }) as never;
    const groups = boardGroups([
      request("a", plate(1, "waiting-ignored", "1"), plate(1, "requested", "2"), plate(2, "failed", "1"), plate(2, "failed", "2")),
      request("b", plate(1, "printing", "1"), plate(2, "printed", "1"), plate(3, "ready", "1"), plate(4, "cancelled", "1")),
    ]);
    expect(groups.map((g) => [g.group, g.requests.map((r) => [(r.request as { id: string }).id, r.plates.map((p) => `${p.plateNumber}:${p.status}`)])])).toEqual([
      ["attention", [["a", ["2:failed"]]]],
      ["printing", [["b", ["1:printing"]]]],
      ["ready", [["b", ["3:ready"]]]],
      ["waiting", [["a", ["1:requested"]]]],
    ]);
    // A plate being built is the computer's work, not a file the operator owes: its own group, after the ones with a button.
    const mixed = boardGroups([request("d", plate(1, "building", "1"), plate(2, "requested", "1"))]);
    expect(mixed.map((g) => [g.group, g.requests[0].plates.map((p) => p.status)])).toEqual([["waiting", ["requested"]], ["making", ["building"]]]);
    expect(needsPrintComputer([request("d", plate(1, "building", "1"))])).toBe(true);
    expect(needsPrintComputer([request("e", plate(1, "ready", "1"), plate(2, "failed", "1"))])).toBe(false);
    // A failed plate printed again no longer asks for attention: only its new attempt counts.
    expect(latestPlates({ plates: [plate(1, "failed", "1"), plate(1, "ready", "2")] as never[] }).map((p) => (p as { status: string }).status)).toEqual(["ready"]);
    expect(boardGroups([request("c", plate(1, "printed", "1"))])).toEqual([]);
  });
  it("tells one story about a plate being built, from the job and its computer together", () => {
    const computer = (name: string, on: boolean) => ({ name, on, lastSeenAt: on ? "2026-11-02T09:59:00Z" : "2026-11-02T01:00:00Z" });
    const job = (status: string, stale: boolean, deviceName: string | null) => ({ status, stale, deviceName }) as never;
    const computers = [computer("Bench PC", true), computer("Harbor bench", false)];
    // The computer is on and the file moves: making. On but silent for 30 minutes: quiet.
    expect(buildState(job("building", false, "Bench PC"), computers)).toBe("making");
    expect(buildState(job("building", true, "Bench PC"), computers)).toBe("quiet");
    // The computer that took it is off: it waits for it, however recent the job's own news is, and silence does not change that.
    expect(buildState(job("building", false, "Harbor bench"), computers)).toBe("computerOff");
    expect(buildState(job("building", true, "Harbor bench"), computers)).toBe("computerOff");
    // A computer no longer paired is not coming back.
    expect(buildState(job("building", false, "Old PC"), computers)).toBe("computerOff");
    // Computers not loaded, or a job no computer took yet: the job's own news is all there is.
    expect(buildState(job("building", false, "Harbor bench"), null)).toBe("making");
    expect(buildState(job("building", true, null), computers)).toBe("quiet");
    expect(buildState(job("building", false, null), computers)).toBe("making");
    for (const status of ["requested", "ready", "printing", "printed", "failed", "cancelled"]) expect(buildState(job(status, true, "Bench PC"), computers)).toBeNull();
  });
  it("says nine alike prints once, and not before three", () => {
    const plate = (quantity: number, files: number) => ({ quantity, downloads: Array.from({ length: files }, (_, i) => ({ id: String(i) })) }) as never;
    expect(collapsedPlates([plate(4, 0), plate(4, 0)])).toBeNull();
    expect(collapsedPlates(Array.from({ length: 9 }, () => plate(4, 0)))).toEqual({ count: 9, each: 4, filesSent: 0 });
    expect(collapsedPlates([plate(4, 1), plate(4, 0), plate(2, 1)])).toEqual({ count: 3, each: null, filesSent: 2 });
  });
  it("asks for damaged pieces again only while no replacement is alive", () => {
    const job = (extra = {}) => ({ status: "printed", batchId: "b", pendingCount: 0, damagedCount: 2, reprintedBy: null, ...extra }) as never;
    expect(damagedToReprint(job())).toBe(2);
    expect(damagedToReprint(job({ reprintedBy: { id: "n", batchCode: "LPLATE-2026-014" } }))).toBe(0);
    expect(damagedToReprint(job({ damagedCount: 0 }))).toBe(0);
    expect(damagedToReprint(job({ pendingCount: 1 }))).toBe(0);
    expect(damagedToReprint(job({ status: "failed" }))).toBe(0);
  });
  it("knows when the pause needs chips written first, and how many are", () => {
    expect(pauseNeedsChips("Peel one programmed 10 × 20 NTAG213 sticker and press it flat")).toBe(true);
    expect(pauseNeedsChips("Drop one blank NTAG sticker in each pocket")).toBe(false);
    expect(pauseNeedsChips(null)).toBe(false);
    expect(chipsWritten([{ chipWritten: true }, { chipWritten: false }, { chipWritten: false }])).toEqual({ done: 1, total: 3 });
  });
  it("keeps the piece's name and print job number out of a batch name, old or new", () => {
    expect(parseBatchName("Stand Large · Google Review · White · v1 · plate 1/2 · 4 of x4")).toEqual({ title: "Stand Large · Google Review · White", plate: { number: 1, total: 2 } });
    expect(parseBatchName("Plate Large · Menu · White · print job 3/3")).toEqual({ title: "Plate Large · Menu · White", plate: { number: 3, total: 3 } });
    expect(parseBatchName("Plate Large · Menu · White · v2 · 4 of x4")).toEqual({ title: "Plate Large · Menu · White", plate: null });
    expect(parseBatchName("Tagworks acrylic run")).toEqual({ title: "Tagworks acrylic run", plate: null });
    expect(plainTitle("Google G token · Large Stand (rounded relief v2)")).toBe("Google G token · Large Stand");
    expect(plainTitle("Stand base · Small")).toBe("Stand base · Small");
  });
  it("leaves a cancelled print job's batch out of the batches awaiting pieces, and a scanned batch without Print", () => {
    const batch = (printJobStatus: string | null, pendingCount = 4, status = "open") => ({ status, pendingCount, printJobStatus });
    expect(pendingBatches([batch("printing"), batch("cancelled"), batch(null), batch("failed"), batch("printed", 0), batch(null, 4, "cancelled")]).length).toBe(3);
    expect(batchTabsFor({ printJobId: null, codeSource: "scanned" })).toEqual(["summary", "receive"]);
    expect(batchTabsFor({ printJobId: null, codeSource: "issued" })).toEqual(["summary", "print", "receive"]);
  });
  it("shows a piece, not a tag, and a name, not an address, in the history", () => {
    expect(journeyTitle("Tag 0XBAXB57 created (Plate)")).toBe("Piece 0XBAXB57 created (Plate)");
    expect(journeyTitle("Tag shop updated")).toBe("Tag shop updated");
    expect(personName("Jessica Alvarez", "jessica.alvarez@lab.example")).toBe("Jessica Alvarez");
    expect(personName(null, "jessica.alvarez@lab.example")).toBe("Jessica Alvarez");
    expect(personName(null, null)).toBeNull();
  });
  it("calls a print computer on when it was heard from in the last ten minutes", () => {
    const now = Date.parse("2026-11-02T10:00:00Z");
    const device = (deviceName: string, lastSeenAt: string | null, extra = {}) => ({ deviceName, lastSeenAt, status: "active", capabilities: ["print"], ...extra });
    expect(printComputers([
      device("Bench PC", "2026-11-02T09:55:00Z"),
      device("Harbor bench", "2026-11-02T09:00:00Z"),
      device("Never", null),
      device("Writer", "2026-11-02T09:59:00Z", { capabilities: ["nfc"] }),
      device("Old", "2026-11-02T09:59:00Z", { status: "revoked" }),
    ], now).map((c) => [c.name, c.on])).toEqual([["Bench PC", true], ["Harbor bench", false], ["Never", false]]);
  });
  it("keeps batch links and filters inside Production without changing other paths", () => {
    expect(productionPath("/batches?pending=1")).toBe("/production/batches?pending=1");
    expect(productionPath("/batches/id?tab=receive")).toBe("/production/batches/id?tab=receive");
    expect(productionPath("/production/batches/id")).toBe("/production/batches/id");
    expect(productionPath("/pieces/id")).toBe("/pieces/id");
  });
  it("offers only models with a generator or a part's fixed file", () => {
    expect(canPrintModel(model)).toBe(true);
    expect(canPrintModel({ ...model, status: "retired" })).toBe(false);
    expect(canPrintModel({ ...model, currentVersion: { ...model.currentVersion!, builder: null } })).toBe(false);
    expect(canPrintModel({ ...model, kind: "part", currentVersion: { ...model.currentVersion!, builder: null } })).toBe(false);
    expect(canPrintModel({ ...model, kind: "part", currentVersion: { ...model.currentVersion!, builder: null, beds: [{ label: "x4", copies: 4, fileRef: "fixed" }] } })).toBe(true);
  });
  it("reuses an existing batch only with a compatible product, artwork, sales product and bed", () => {
    expect(canPrintModel(model, batch)).toBe(true);
    expect(printableBeds(model, batch).map((b) => b.label)).toEqual(["x8"]);
    expect(canPrintModel(model, { ...batch, productType: "small_plate" })).toBe(false);
    expect(canPrintModel(model, { ...batch, face: "venmo" })).toBe(false);
    expect(canPrintModel(model, { ...batch, salesProductId: 2 })).toBe(false);
    expect(canPrintModel(model, { ...batch, tagCount: 9 })).toBe(false);
  });
  it("limits serialized generation to one printer plate without clamping", () => {
    expect(printQuantity("4", 4, true)).toMatchObject({ valid: true, count: 4, max: 4, plates: [4], pieces: 4 });
    expect(printQuantity("3", 4, true)).toMatchObject({ valid: true, plates: [3], pieces: 3 });
    for (const raw of ["5", "10", "80"]) expect(printQuantity(raw, 4, true)).toMatchObject({ valid: false, plates: [], pieces: 0 });
    for (const raw of ["", "0", "-1", "1.5", "NaN", "10001"]) expect(printQuantity(raw, 4, true).valid).toBe(false);
    expect(printQuantity("5", 4, false)).toMatchObject({ valid: true, plates: [4, 4], pieces: 8 });
  });
  it("treats a request as open until the last attempt of every plate is printed or cancelled", () => {
    const request = (...plates: Array<[number, string]>) => ({
      open: false,
      plates: plates.map(([plateNumber, status], i) => ({ plateNumber, status, createdAt: `2026-10-31T10:0${i}:00Z` })),
    }) as unknown as PrintRequestItem;
    expect(productionNeedsAction(request([1, "printed"]))).toBe(false);
    expect(productionNeedsAction(request([1, "failed"], [1, "printed"], [2, "cancelled"]))).toBe(false);
    // A failed plate not printed again still has its pieces pending.
    expect(productionNeedsAction(request([1, "printed"], [2, "failed"]))).toBe(true);
    expect(productionNeedsAction(request([1, "failed"], [1, "failed"]))).toBe(true);
    for (const status of ["requested", "building", "ready", "printing"]) expect(productionNeedsAction(request([1, "printed"], [2, status]))).toBe(true);
    expect(productionNeedsAction({ ...request([1, "printed"]), open: true })).toBe(true);
  });
  it("offers to stock a printed plate only while its pieces are still pending", () => {
    expect(pendingPieces({ status: "printed", batchId: "b", pendingCount: 4 })).toBe(4);
    expect(pendingPieces({ status: "printed", batchId: "b", pendingCount: 0 })).toBe(0);
    expect(pendingPieces({ status: "printed", batchId: null, pendingCount: null })).toBe(0);
    expect(pendingPieces({ status: "ready", batchId: "b", pendingCount: 4 })).toBe(0);
  });
  it("names the plate only when the request has several", () => {
    expect(showPlateNumber({ plateCount: 1 })).toBe(false);
    expect(showPlateNumber({ plateCount: 3 })).toBe(true);
  });
  it("fills a new model's slug from its title in kebab-case", () => {
    expect(slugFromTitle("Plate Large · Menu · White")).toBe("plate-large-menu-white");
    expect(slugFromTitle("  Placa Pequeña — Café!  ")).toBe("placa-pequena-cafe");
    expect(slugFromTitle("Stand base (L)")).toBe("stand-base-l");
    expect(slugFromTitle("***")).toBe("");
    expect(slugFromTitle("a".repeat(120)).length).toBe(80);
  });
  it("fills the batch prefix with up to 12 uppercase letters and digits that start with a letter", () => {
    expect(batchPrefixFromTitle("Stand Base")).toBe("STANDBASE");
    expect(batchPrefixFromTitle("Plate Large Menu White")).toBe("PLALARMENWHI");
    expect(batchPrefixFromTitle("Placa Pequeña")).toBe("PLACAPEQUENA");
    expect(batchPrefixFromTitle("3D Stand")).toBe("DSTAND");
    expect(batchPrefixFromTitle("A")).toBe("");
    expect(batchPrefixFromTitle("12 34")).toBe("");
    for (const title of ["Plate Large Menu White", "Supercalifragilisticexpialidocious", "Stand Large Google Review White Edition", "x y z"]) {
      const prefix = batchPrefixFromTitle(title);
      if (prefix) expect(prefix).toMatch(/^[A-Z][A-Z0-9]{1,11}$/);
    }
  });
});
