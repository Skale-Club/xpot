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

/**
 * The lit tab of Production for a path: Models owns /models; everything else (the board, the full orders list at
 * /queue, a pending-batches list) belongs to Produce, since the board's "Waiting to print" is the day's queue.
 */
export function productionTabFor(view: string | undefined): "board" | "catalog" {
  return view === "models" ? "catalog" : "board";
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

const OPEN_STATUSES: readonly string[] = ["requested", "building", "ready", "printing"];

/**
 * A request needs action until the last attempt of each plate is printed or cancelled (marking a plate printed also
 * puts its pieces in stock). A failed plate does too: its pieces are still pending until it is printed again or
 * cancelled. A plate printed again keeps its failed attempt in the list, which no longer counts.
 */
export function productionNeedsAction(request: Pick<PrintRequestItem, "open" | "plates">): boolean {
  if (request.open) return true;
  const latest = new Map<number, Pick<PrintJobItem, "status" | "createdAt">>();
  for (const plate of request.plates) {
    const seen = latest.get(plate.plateNumber);
    if (!seen || plate.createdAt >= seen.createdAt) latest.set(plate.plateNumber, plate);
  }
  return Array.from(latest.values()).some((plate) => OPEN_STATUSES.includes(plate.status) || plate.status === "failed");
}

/** The next operation, independent of which screen opened the order: 0 prepare, 1 print, 2 done. */
export function productionJourneyStep(job: Pick<PrintJobItem, "status">): 0 | 1 | 2 {
  if (job.status === "ready" || job.status === "printing") return 1;
  return job.status === "printed" ? 2 : 0;
}

/** Pieces of a printed plate's batch that are still pending (plates printed before stock followed "printed"). */
export function pendingPieces(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount">): number {
  return job.status === "printed" && job.batchId ? job.pendingCount ?? 0 : 0;
}

/** "Plate 1 of 1" says nothing: only name the plate when the request has several. */
export function showPlateNumber(job: Pick<PrintJobItem, "plateCount">): boolean {
  return job.plateCount > 1;
}

// ─── New model: slug and batch prefix follow the title until they are typed by hand ──────────────────────────────

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** "Plate Large · Menu (White)" → "plate-large-menu-white" (the model slug pattern, at most 80 characters). */
export function slugFromTitle(title: string): string {
  return fold(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
}

/**
 * A short batch prefix from the title: uppercase letters and digits, starting with a letter, at most 12 characters.
 * Short titles keep every word whole ("Stand Base" → "STANDBASE"); longer ones give each word an equal share
 * ("Plate Large Menu White" → "PLALARMENWHI"). Empty when the title has no usable letters.
 */
export function batchPrefixFromTitle(title: string): string {
  const words = fold(title).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const joined = words.join("");
  let prefix = joined;
  if (joined.length > 12) {
    const share = Math.max(1, Math.floor(12 / words.length));
    prefix = words.map((word) => word.slice(0, share)).join("");
  }
  prefix = prefix.replace(/^[0-9]+/, "").slice(0, 12);
  return prefix.length >= 2 ? prefix : "";
}
