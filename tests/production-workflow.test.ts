import { describe, expect, it } from "vitest";
import type { PrintModelItem, PrintRequestItem } from "../shared/printProduction";
import { canPrintModel, printableBeds, printQuantity, productionJourneyStep, productionNeedsAction, productionPath } from "../client/src/pages/admin/tags/production-workflow";

const model = {
  id: "model", kind: "serialized", status: "ready", productType: "large_plate", face: "google_review", salesProductId: 1,
  currentVersion: { builder: "plate.google", beds: [{ label: "x4", copies: 4 }, { label: "x8", copies: 8 }] },
} as PrintModelItem;
const batch = { id: "batch", batchCode: "LP-001", productType: "large_plate", face: "google_review", salesProductId: 1, tagCount: 6 };

describe("unified production", () => {
  it("advances from files to printing to receiving, completing only after the pieces enter stock", () => {
    const job = { status: "requested", batchId: "batch", quantity: 4, receivedCount: 0, pieceCount: 4 };
    expect(productionJourneyStep(job)).toBe(0);
    expect(productionJourneyStep({ ...job, status: "ready" })).toBe(1);
    expect(productionJourneyStep({ ...job, status: "printed" })).toBe(2);
    expect(productionJourneyStep({ ...job, status: "printed", receivedCount: 4 })).toBe(3);
    expect(productionJourneyStep({ ...job, status: "printed", batchId: null })).toBe(3);
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
  it("keeps a printed order actionable until its pieces are physically received", () => {
    const request = (overrides: object) => ({ open: false, plates: [{ status: "printed", batchId: "b", receivedCount: 0, pieceCount: 4, quantity: 4, ...overrides }] }) as PrintRequestItem;
    expect(productionNeedsAction(request({}))).toBe(true);
    expect(productionNeedsAction(request({ receivedCount: 4 }))).toBe(false);
    expect(productionNeedsAction(request({ status: "cancelled" }))).toBe(false);
    expect(productionNeedsAction(request({ batchId: null }))).toBe(false);
    expect(productionNeedsAction({ ...request({}), open: true })).toBe(true);
  });
});
