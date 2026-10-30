import { describe, expect, it } from "vitest";
import type { PrintModelItem, PrintRequestItem } from "../shared/printProduction";
import { batchPrefixFromTitle, canPrintModel, pendingPieces, printableBeds, printQuantity, productionJourneyStep, productionNeedsAction, productionPath, showPlateNumber, slugFromTitle } from "../client/src/pages/admin/tags/production-workflow";

const model = {
  id: "model", kind: "serialized", status: "ready", productType: "large_plate", face: "google_review", salesProductId: 1,
  currentVersion: { builder: "plate.google", beds: [{ label: "x4", copies: 4 }, { label: "x8", copies: 8 }] },
} as PrintModelItem;
const batch = { id: "batch", batchCode: "LP-001", productType: "large_plate", face: "google_review", salesProductId: 1, tagCount: 6 };

describe("unified production", () => {
  it("advances from preparing to printing to done, where marking printed is the last step", () => {
    const job = { status: "requested" } as const;
    expect(productionJourneyStep(job)).toBe(0);
    expect(productionJourneyStep({ status: "building" })).toBe(0);
    expect(productionJourneyStep({ status: "ready" })).toBe(1);
    expect(productionJourneyStep({ status: "printing" })).toBe(1);
    expect(productionJourneyStep({ status: "printed" })).toBe(2);
    expect(productionJourneyStep({ status: "failed" })).toBe(0);
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
  it("splits a requested quantity exactly and never truncates or clamps invalid input", () => {
    expect(printQuantity("10", 4, true)).toMatchObject({ valid: true, count: 10, plates: [4, 4, 2], pieces: 10 });
    for (const raw of ["", "0", "-1", "1.5", "NaN", "10001"]) expect(printQuantity(raw, 4, true).valid).toBe(false);
    expect(printQuantity("5", 4, false)).toMatchObject({ valid: true, plates: [4, 4], pieces: 8 });
  });
  it("treats a request as open only until every plate is printed", () => {
    const request = (...statuses: string[]) => ({ open: false, plates: statuses.map((status) => ({ status })) }) as unknown as PrintRequestItem;
    expect(productionNeedsAction(request("printed"))).toBe(false);
    expect(productionNeedsAction(request("printed", "failed", "cancelled"))).toBe(false);
    for (const status of ["requested", "building", "ready", "printing"]) expect(productionNeedsAction(request("printed", status))).toBe(true);
    expect(productionNeedsAction({ ...request("printed"), open: true })).toBe(true);
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
