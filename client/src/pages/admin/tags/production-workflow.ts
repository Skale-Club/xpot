import { PRINT_MAX_PLATES, isAlwaysReadyPart, planRedoCodes, splitIntoPlates, type PrintJobItem, type PrintModelItem, type PrintNfcMount, type PrintRedoCodes, type PrintRequestItem } from "@shared/printProduction";

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
 * The lit tab of Production for a path: Models owns /models, Printing owns /printing; everything else (the board, the
 * full orders list at /queue, a pending-batches list) belongs to Produce.
 */
export function productionTabFor(view: string | undefined): "board" | "printing" | "catalog" {
  if (view === "models") return "catalog";
  return view === "printing" ? "printing" : "board";
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
  const max = serialized ? copies : Math.min(10_000, PRINT_MAX_PLATES * copies);
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

/** How many damaged pieces a printed plate can still ask for again: none once that was done (the server refuses a second time too). */
export function damagedToReprint(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount" | "damagedCount" | "reprintedBy">): number {
  return job.status === "printed" && printedOutcome(job) === "damaged" && !job.reprintedBy ? job.damagedCount ?? 0 : 0;
}

/** Assembling takes the parts off the count, so it waits until every piece is in stock. */
export function canAssembleJob(job: Pick<PrintJobItem, "status" | "batchId" | "pendingCount">, consumes: number, assembledAt: string | null): boolean {
  return job.status === "printed" && Boolean(job.batchId) && consumes > 0 && !assembledAt && !pendingPieces(job);
}

// ─── The board: what to print now ─────────────────────────────────────────────────────────────────────────────

/**
 * The groups of "To print", in the order the operator needs them: what is broken, what is on the printer, what can go on
 * it, what waits for a file from the operator (it has an Upload button), and what the print computer is making (nothing
 * to do). One state, one group, one name on every screen: a plate being built is never "waiting for the file".
 */
export const BOARD_GROUPS = ["attention", "printing", "ready", "waiting", "making"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

export function boardGroupOf(status: string): BoardGroup | null {
  if (status === "failed") return "attention";
  if (status === "printing") return "printing";
  if (status === "ready") return "ready";
  if (status === "requested") return "waiting";
  return status === "building" ? "making" : null;
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

/** The requests the Printing screen follows: pieces with a serial. A part has no code to confirm, only a count on its page. */
export function serializedRequests(requests: readonly PrintRequestItem[]): PrintRequestItem[] {
  return requests.filter((request) => request.modelKind === "serialized");
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
export type PlateAction = "download" | "markPrinted" | "printAgain";

/**
 * Whether it printed is what the operator answers, so marking printed comes first and the file second. A job with no
 * file yet offers nothing: the print computer makes it. A failed one offers printing again.
 */
export function plateActions(job: Pick<PrintJobItem, "status" | "downloads" | "redoneBy">): PlateAction[] {
  const hasFile = job.downloads.length > 0;
  switch (job.status) {
    case "ready":
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

/**
 * What a plate being built is really doing, from the job and its computer together, so the board, the list and the page
 * tell the same story: the computer is making it (nothing to do), the computer that took it is off (it waits for it), or
 * the computer is on but the file has not moved for a while (`job.stale`, 30 minutes). A computer that is off wins over
 * the job's own silence, and a computer that was unpaired counts as off. `computers` null: not loaded yet, so the job's
 * own news is all there is. Null for a plate that is not being built.
 */
export type BuildState = "making" | "computerOff" | "quiet";

export function buildState(job: Pick<PrintJobItem, "status" | "stale" | "deviceName">, computers: readonly PrintComputer[] | null): BuildState | null {
  if (job.status !== "building") return null;
  if (computers && job.deviceName) {
    const computer = computers.find((c) => c.name === job.deviceName);
    if (!computer || !computer.on) return "computerOff";
  }
  return job.stale ? "quiet" : "making";
}

/** Whether some plate depends on a print computer (waiting for its file or being built): the line that says "files will wait" is true only then. */
export function needsPrintComputer(requests: readonly PrintRequestItem[]): boolean {
  return boardGroups(requests).some((g) => g.group === "waiting" || g.group === "making");
}

/** Prints of one request that share a group, said once ("9 prints · 4 pieces each") instead of nine alike rows: from three up. */
export function collapsedPlates(plates: readonly Pick<PrintJobItem, "quantity" | "downloads">[]): { count: number; each: number | null; filesSent: number } | null {
  if (plates.length < 3) return null;
  const sizes = new Set(plates.map((p) => p.quantity));
  return { count: plates.length, each: sizes.size === 1 ? plates[0].quantity : null, filesSent: plates.filter((p) => p.downloads.length > 0).length };
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

/** A title as the catalog typed it, without the note in parentheses ("Google G token · Large Stand (rounded relief v2)"). */
export function plainTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title;
}

/** Where to go once pieces were ordered: the one print job that came out of it, or the Printing screen when there are several. */
export function orderedPath(request: Pick<PrintRequestItem, "plates">): string {
  return request.plates.length === 1 ? `/production/jobs/${request.plates[0].id}` : "/production/printing";
}

/** The filament colours of the model's first bed ("White PLA"). */
export function filamentColours(model: Pick<PrintModelItem, "currentVersion"> | undefined): string[] {
  return (model?.currentVersion?.beds[0]?.ams ?? []).map((slot) => slot.colour);
}

/** What one piece takes off the counts when assembled, by name ("1 Stand base · Large"), when the part is a model of the catalog. */
export function assemblyParts(model: Pick<PrintModelItem, "currentVersion"> | undefined, models: ReadonlyMap<string, Pick<PrintModelItem, "title">>, nfcMount?: PrintNfcMount | null): string[] {
  const selected = nfcMount ? model?.currentVersion?.nfcVariants?.[nfcMount]?.consumes : undefined;
  return (selected ?? model?.currentVersion?.consumes ?? []).map((c) => `${c.perPiece} ${plainTitle(models.get(c.part)?.title ?? c.part)}`);
}

/** The always-ready parts below their reorder point, worst first (the biggest shortfall, then by title). Serial pieces and parts with no reorder point are never listed. */
export function missingParts<T extends Pick<PrintModelItem, "kind" | "status" | "currentVersion" | "title" | "onHand" | "partReorderAt" | "lowStock">>(models: readonly T[]): T[] {
  const shortfall = (part: T) => (part.partReorderAt ?? 0) - part.onHand;
  return models
    .filter((part) => isAlwaysReadyPart(part) && part.lowStock && part.partReorderAt != null)
    .sort((x, y) => shortfall(y) - shortfall(x) || x.title.localeCompare(y.title));
}

// ─── History ──────────────────────────────────────────────────────────────────────────────────────────────────

/** "Tag 0XBAXB57 created" is written by the server in English; the object is a piece (the glossary never calls it a tag). */
export function journeyTitle(title: string): string {
  return title.replace(/^Tag (?=[A-Z0-9]{6,}\b)/, "Piece ");
}

/** A person's name for the log: the name they have, else what their e-mail says before the "@" ("jessica.alvarez@x" → "Jessica Alvarez"). Never the address itself. */
export function personName(name: string | null | undefined, email: string | null | undefined): string | null {
  if (name?.trim()) return name.trim();
  const local = email?.split("@")[0]?.trim();
  if (!local) return null;
  return local.split(/[._\-+]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || null;
}
