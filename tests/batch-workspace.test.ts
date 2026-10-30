import { describe, expect, it } from "vitest";
import { filterBatchList } from "../client/src/pages/admin/tags/batches-model";

const batches = [
  { batchCode: "REV-001", name: "Avaliação Google", vendor: "São Paulo", productType: "large_stand", face: "google_review", stage: "issued", pendingCount: 4, createdAt: "2026-10-20T12:00:00Z" },
  { batchCode: "REV-002", name: "Google branco", vendor: null, productType: "large_stand", face: "google_review", stage: "received", pendingCount: 0, createdAt: "2026-10-21T12:00:00Z" },
  { batchCode: "PLATE-001", name: "Instagram", vendor: "São Paulo", productType: "small_plate", face: "instagram", stage: "printed", pendingCount: 8, createdAt: "2026-10-22T12:00:00Z" },
  { batchCode: "OLD-001", name: "Cancelado", vendor: null, productType: "large_stand", face: null, stage: "cancelled", pendingCount: 12, createdAt: "2026-10-19T12:00:00Z" },
];
const defaults = { stage: "", pendingOnly: false, q: "", product: "", sort: "newest" };
const codes = (options: Partial<typeof defaults>) => filterBatchList(batches, { ...defaults, ...options }).map((b) => b.batchCode);

describe("batch workspace", () => {
  it("orders all stages together by date without mutating the query cache", () => {
    expect(codes({})).toEqual(["PLATE-001", "REV-002", "REV-001", "OLD-001"]);
    expect(batches[0].batchCode).toBe("REV-001");
    expect(codes({ sort: "oldest" })).toEqual(["OLD-001", "REV-001", "REV-002", "PLATE-001"]);
  });
  it("combines stage, model and pending filters, excluding cancelled batches from awaiting pieces", () => {
    expect(codes({ pendingOnly: true })).toEqual(["PLATE-001", "REV-001"]);
    expect(codes({ pendingOnly: true, stage: "issued", product: "large_stand" })).toEqual(["REV-001"]);
    expect(codes({ stage: "cancelled" })).toEqual(["OLD-001"]);
    expect(codes({ stage: "printed", product: "large_stand" })).toEqual([]);
  });
  it("searches across code, name and vendor, ignoring accents, case and surrounding whitespace", () => {
    expect(codes({ q: "  AVALIACAO sao  " })).toEqual(["REV-001"]);
    expect(codes({ q: "rev-002" })).toEqual(["REV-002"]);
    expect(codes({ q: "unmatched" })).toEqual([]);
  });
  it("searches translated model and face labels", () => {
    expect(filterBatchList(batches, { ...defaults, q: "Suporte grande" }, (b) => b.productType === "large_stand" ? "Suporte grande" : "Placa pequena")).toHaveLength(3);
  });
  it("sorts most pending first, using newest first for ties", () => {
    expect(codes({ sort: "pending" })).toEqual(["PLATE-001", "REV-001", "REV-002", "OLD-001"]);
    expect(codes({ sort: "pending", pendingOnly: true })).toEqual(["PLATE-001", "REV-001"]);
    expect(filterBatchList([batches[0], { ...batches[2], pendingCount: 4 }], { ...defaults, sort: "pending" })[0].batchCode).toBe("PLATE-001");
  });
});
