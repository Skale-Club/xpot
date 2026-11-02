import { PRINT_MAX_PLATES, planRedoCodes, splitIntoPlates, type PrintJobItem, type PrintModelItem, type PrintRedoCodes, type PrintRequestItem } from "@shared/printProduction";

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
export function productionNeedsAction(request: Pick<PrintRequestItem, "open"> & { plates: Array<Pick<PrintJobItem, "plateNumber" | "status" | "createdAt">> }): boolean {
  if (request.open) return true;
  return latestPlates(request).some((plate) => OPEN_STATUSES.includes(plate.status) || plate.status === "failed");
}

/**
 * Where a print job is on its way: 0 the file, 1 the printer, 2 into stock (a printed job whose pieces are not in stock
 * yet), 3 all done. A failed or cancelled job is not on the way anywhere: null, and the screen shows no steps.
 */
export function journeyProgress(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount">): 0 | 1 | 2 | 3 | null {
  switch (job.status) {
    case "requested":
    case "building":
      return 0;
    case "ready":
    case "printing":
      return 1;
    case "printed":
      return pendingPieces(job) ? 2 : 3;
    default:
      return null;
  }
}

/** Pieces of a printed plate's batch that are still pending (plates printed before stock followed "printed"). */
export function pendingPieces(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount">): number {
  return job.status === "printed" && job.batchId ? job.pendingCount ?? 0 : 0;
}

/**
 * What a printed job says about its pieces, in the order that matters: some are not in stock yet, some came out
 * damaged, all are in stock, or it was a part (no pieces, only a count).
 */
export type PrintedOutcome = "pending" | "damaged" | "inStock" | "count";

export function printedOutcome(job: Pick<PrintJobItem, "batchId" | "pendingCount" | "damagedCount">): PrintedOutcome {
  if (!job.batchId) return "count";
  if (job.pendingCount) return "pending";
  return job.damagedCount ? "damaged" : "inStock";
}

/** Assembling takes the parts off the count, so it waits until every piece is in stock. */
export function canAssembleJob(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount">, consumes: number, assembledAt: string | null): boolean {
  return job.status === "printed" && Boolean(job.batchId) && consumes > 0 && !assembledAt && !pendingPieces(job);
}

// ─── The board: what to print now ─────────────────────────────────────────────────────────────────────────────

/** The groups of "To print", in the order the operator needs them: what is broken, what is on the printer, what can go on it, what waits. */
export const BOARD_GROUPS = ["attention", "printing", "ready", "waiting"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

export function boardGroupOf(status: string): BoardGroup | null {
  if (status === "failed") return "attention";
  if (status === "printing") return "printing";
  if (status === "ready") return "ready";
  return status === "requested" || status === "building" ? "waiting" : null;
}

/** The last attempt of each plate, in plate order: a failed plate printed again leaves only its new attempt. */
export function latestPlates<P extends Pick<PrintJobItem, "plateNumber" | "createdAt">>(request: { plates: P[] }): P[] {
  const latest = new Map<number, P>();
  for (const plate of request.plates) {
    const seen = latest.get(plate.plateNumber);
    if (!seen || plate.createdAt >= seen.createdAt) latest.set(plate.plateNumber, plate);
  }
  return Array.from(latest.values()).sort((a, b) => a.plateNumber - b.plateNumber);
}

export interface BoardRequest {
  request: PrintRequestItem;
  plates: PrintJobItem[];
}

/** Open and failed plates by group; a request with plates in two groups shows in both, each with its own plates. Empty groups are left out. */
export function boardGroups(requests: readonly PrintRequestItem[]): Array<{ group: BoardGroup; requests: BoardRequest[] }> {
  return BOARD_GROUPS.flatMap((group) => {
    const inGroup = requests
      .map((request) => ({ request, plates: latestPlates(request).filter((plate) => boardGroupOf(plate.status) === group) }))
      .filter((entry) => entry.plates.length > 0);
    return inGroup.length ? [{ group, requests: inGroup }] : [];
  });
}

/** What a plate's row lets the operator do, left to right; the first is the main one. */
export type PlateAction = "uploadFile" | "download" | "start" | "markPrinted" | "printAgain";

/**
 * Marking printed comes only after the job is on the printer (started), so it is never offered for a job without a
 * file or before the file was taken. A job with no file yet offers the upload; a failed one, printing again.
 */
export function plateActions(job: Pick<PrintJobItem, "status" | "downloads" | "redoneBy">): PlateAction[] {
  const hasFile = job.downloads.length > 0;
  switch (job.status) {
    case "requested":
      return ["uploadFile"];
    case "ready":
      return hasFile ? ["download", "start"] : ["uploadFile"];
    case "printing":
      return hasFile ? ["markPrinted", "download"] : ["markPrinted"];
    case "failed":
      return job.redoneBy ? [] : ["printAgain"];
    default:
      return [];
  }
}

/** A print computer as the operator sees it: on while it was heard from lately. */
export const PRINT_COMPUTER_ON_MS = 10 * 60_000;

export interface PrintComputer {
  name: string;
  on: boolean;
  lastSeenAt: string | null;
}

/** The paired computers that make print files (device capability `print`), on or off. */
export function printComputers(
  devices: ReadonlyArray<{ deviceName: string; status: string; capabilities: string[]; lastSeenAt: string | null }>,
  now: number,
): PrintComputer[] {
  return devices
    .filter((device) => device.status === "active" && device.capabilities.includes("print"))
    .map((device) => ({
      name: device.deviceName,
      lastSeenAt: device.lastSeenAt,
      on: device.lastSeenAt !== null && now - new Date(device.lastSeenAt).getTime() <= PRINT_COMPUTER_ON_MS,
    }));
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

// ─── A failed job ─────────────────────────────────────────────────────────────────────────────────────────────

/** The codes the print computer's QR check could not read (`report.qr_failed_codes`). */
export function qrFailedCodes(report: Record<string, unknown> | null | undefined): string[] {
  const codes = report?.qr_failed_codes;
  return Array.isArray(codes) ? codes.map(String) : [];
}

/** What printing a failed or cancelled job again does with its pieces' codes; a part has none. */
export type RedoEffect = "part" | PrintRedoCodes;

export function redoEffect(job: Pick<PrintJobItem, "modelKind" | "batchId" | "errorCode" | "receivedCount">): RedoEffect {
  if (job.modelKind === "part" || !job.batchId) return "part";
  return planRedoCodes({ errorCode: job.errorCode, anyReceived: Boolean(job.receivedCount) });
}

/** The printer's pause asks for a chip that is already written ("programmed"), not a blank sticker: the chips must be written first. */
export function pauseNeedsChips(text: string | null | undefined): boolean {
  return /\bprogrammed\b/i.test(text ?? "");
}

/** The chips written out of a job's pieces, for "0 of 4 written". */
export function chipsWritten(pieces: ReadonlyArray<{ chipWritten: boolean }>): { done: number; total: number } {
  return { done: pieces.filter((piece) => piece.chipWritten).length, total: pieces.length };
}
