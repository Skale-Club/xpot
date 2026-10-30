import { PRINT_MAX_PLATES, splitIntoPlates, type PrintJobItem, type PrintModelItem, type PrintRequestItem } from "@shared/printProduction";

export interface ExistingProductionBatch {
  id: string;
  batchCode: string;
  productType: string;
  face: string | null;
  salesProductId: number | null;
  tagCount: number;
}

/** Old batch links keep working while all new navigation stays inside Production. */
export function productionPath(path: string): string {
  return path.replace(/^\/batches(?=\/|\?|$)/, "/production/batches");
}

export function printableBeds(model: PrintModelItem, batch?: ExistingProductionBatch) {
  return (model.currentVersion?.beds ?? []).filter((bed) =>
    (model.kind === "serialized" ? !!model.currentVersion?.builder : !!bed.fileRef) &&
    (!batch || bed.copies >= batch.tagCount),
  );
}

/** A printing choice must actually have a generator (or a part's fixed file). */
export function canPrintModel(model: PrintModelItem, batch?: ExistingProductionBatch): boolean {
  if (model.status !== "ready" || !printableBeds(model, batch).length) return false;
  return !batch || (model.kind === "serialized" && model.productType === batch.productType &&
    (!batch.face || model.face === batch.face) && (!batch.salesProductId || model.salesProductId === batch.salesProductId));
}

/** Never clamp or truncate the quantity: the review must match what will be ordered. */
export function printQuantity(raw: string, copies: number, serialized: boolean) {
  const count = Number(raw);
  const max = Math.min(10_000, PRINT_MAX_PLATES * copies);
  const valid = raw.trim() !== "" && Number.isInteger(count) && count >= 1 && count <= max;
  const plates = valid ? splitIntoPlates(count, copies, serialized) : [];
  return { count, max, valid, plates, pieces: plates.reduce((sum, n) => sum + n, 0) };
}

/** A serialized request remains actionable until its physical pieces have been received. */
export function productionNeedsAction(request: Pick<PrintRequestItem, "open" | "plates">): boolean {
  return request.open || request.plates.some((plate) => plate.status === "printed" && !!plate.batchId &&
    (plate.receivedCount ?? 0) < (plate.pieceCount ?? plate.quantity));
}

/** The next operation, independent of which screen opened the order. */
export function productionJourneyStep(job: Pick<PrintJobItem, "status" | "batchId" | "receivedCount" | "pieceCount" | "quantity">): 0 | 1 | 2 | 3 {
  if (job.status === "ready" || job.status === "printing") return 1;
  if (job.status === "printed") return job.batchId && (job.receivedCount ?? 0) < (job.pieceCount ?? job.quantity) ? 2 : 3;
  return 0;
}
