// Tags › Production: what the house prints, how, and the queue of print orders (docs/PRINT_EXECUTION_PLAN.md).
// Pure rules shared by the server and the app: allowed values, the order state machine, the input schemas and
// the API types. No I/O here. The CHECK constraints in migrations/0059_print_production.sql mirror these lists.
//
//   model    what is sold and printed: product × face × theme ("Plate Large · Menu · White"), or a part with no
//            code (a Stand base, a G token). It never changes when the recipe improves.
//   version  the frozen recipe that produced a batch: builder + parameters, slicer settings, bed layouts. A version
//            an order used is never edited; an improvement is a new version with a changelog.
//   request  "print N pieces of this model" (print_requests), split into plates of at most one bed each; the last
//            plate may be partial (10 on a 4-up bed: 4 + 4 + 2).
//   plate    one bed to print (print_jobs, "print order" in the API): for a serialized model it owns its batch and
//            codes; for a part it is the fixed file and a count. The admin downloads it, prints it in Bambu Studio
//            and marks it printed: nothing is sent to the printer from here.

import { z } from "zod";
import { TAG_PRODUCT_TYPES } from "./tags.js";
import { TAG_FACES } from "./tagFace.js";

export const PRINT_MODEL_KINDS = ["serialized", "part"] as const;
export type PrintModelKind = (typeof PRINT_MODEL_KINDS)[number];

/** `design_needed`: in the catalog, not drawn yet (Claude delivers its v1); `ready`: has a current version. */
export const PRINT_MODEL_STATUSES = ["design_needed", "ready", "retired"] as const;
export type PrintModelStatus = (typeof PRINT_MODEL_STATUSES)[number];

export const PRINT_VERSION_STATUSES = ["draft", "current", "superseded"] as const;
export type PrintVersionStatus = (typeof PRINT_VERSION_STATUSES)[number];

/** Who wrote a version: the admin panel, an AI session (MCP) or the bench app. */
export const PRINT_VERSION_SOURCES = ["admin", "mcp", "bench"] as const;
export type PrintVersionSource = (typeof PRINT_VERSION_SOURCES)[number];

/**
 * requested → building (the bench claimed it) → ready (file attached and checked) → printing → printed.
 * failed and cancelled are terminal. A part order whose bed already has its file is born `ready`.
 */
export const PRINT_JOB_STATUSES = ["requested", "building", "ready", "printing", "printed", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const OPEN_PRINT_JOB_STATUSES: readonly PrintJobStatus[] = ["requested", "building", "ready", "printing"];

export const PRINT_FILE_KINDS = ["3mf", "gcode_3mf", "serial_map", "report", "preview"] as const;
export type PrintFileKind = (typeof PRINT_FILE_KINDS)[number];

export const PRINT_FILE_CONTENT_TYPES: Record<PrintFileKind, string> = {
  "3mf": "model/3mf",
  gcode_3mf: "model/3mf",
  serial_map: "text/csv",
  report: "application/json",
  preview: "image/png",
};

/** One upload: a full A1 project with meshes stays well under this. */
export const PRINT_FILE_MAX_BYTES = 64 * 1024 * 1024;

export const PRINT_PART_REASONS = ["printed", "assembled", "used", "adjustment"] as const;
export type PrintPartReason = (typeof PRINT_PART_REASONS)[number];

/** How many plates one request may make (a full plate of tokens is ~270 pieces). */
export const PRINT_MAX_PLATES = 20;

/**
 * How a request of `quantity` pieces fills beds of `copies`: full plates, then the rest on a partial one
 * (10 on 4 → [4, 4, 2]). A part's plate is its fixed file and is never partial: the count rounds up to whole plates.
 */
export function splitIntoPlates(quantity: number, copies: number, partial = true): number[] {
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(copies) || copies < 1) return [];
  const full = Math.floor(quantity / copies);
  const rest = quantity % copies;
  const plates: number[] = Array.from({ length: full }, () => copies);
  if (rest) plates.push(partial ? rest : copies);
  return plates;
}

// ─── Order state machine ──────────────────────────────────────────────────────

export const PRINT_JOB_ACTIONS = ["claim", "release", "complete", "fail", "start", "printed", "cancel"] as const;
export type PrintJobAction = (typeof PRINT_JOB_ACTIONS)[number];

const TRANSITIONS: Record<PrintJobAction, { from: readonly PrintJobStatus[]; to: PrintJobStatus }> = {
  claim: { from: ["requested"], to: "building" },
  // A bench that died mid-build: the admin hands the order back to the queue.
  release: { from: ["building"], to: "requested" },
  // The file is attached and checked. An admin may also attach it by hand to a requested order.
  complete: { from: ["requested", "building"], to: "ready" },
  fail: { from: ["requested", "building", "ready", "printing"], to: "failed" },
  start: { from: ["ready"], to: "printing" },
  printed: { from: ["ready", "printing"], to: "printed" },
  cancel: { from: ["requested", "building", "ready"], to: "cancelled" },
};

export type PrintJobTransition = { ok: true; status: PrintJobStatus } | { ok: false; error: string; code: string };

const ACTION_WORDS: Record<PrintJobAction, string> = {
  claim: "claimed",
  release: "released",
  complete: "made ready",
  fail: "marked failed",
  start: "started",
  printed: "marked printed",
  cancel: "cancelled",
};

export function planPrintJobTransition(status: string, action: PrintJobAction): PrintJobTransition {
  const rule = TRANSITIONS[action];
  if (rule.from.includes(status as PrintJobStatus)) return { ok: true, status: rule.to };
  return { ok: false, error: `A ${status} print order cannot be ${ACTION_WORDS[action]}`, code: "print_job_state" };
}

// ─── Batch codes ──────────────────────────────────────────────────────────────

export const PRINT_BATCH_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;

/** `<PREFIX>-<year>-<nnn>`: the next number after the highest one already used this year (gaps are not refilled). */
export function nextPrintBatchCode(prefix: string, year: number, existing: readonly string[]): string {
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const code of existing) {
    if (!code.startsWith(head)) continue;
    const n = Number(code.slice(head.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${head}${String(max + 1).padStart(3, "0")}`;
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullable().optional());

export const PRINT_MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const printBedSchema = z.object({
  /** How the admin picks it: "x4", "x6 full plate". Unique within a version. */
  label: z.string().trim().min(1).max(40),
  /** Pieces one print of this bed makes. */
  copies: z.number().int().positive().max(1000),
  /** Bed positions in copy order, as seen facing the printer ("front-left", …); for the serial map. */
  positions: z.array(z.string().trim().min(1).max(40)).max(1000).optional(),
  /** Where each copy sits on the bed, in copy order: mm from the bed centre, and an optional turn (the 3MF builder's `copies`). */
  slots: z.array(z.object({
    offset: z.tuple([z.number().min(-200).max(200), z.number().min(-200).max(200)]),
    rotation: z.number().min(-360).max(360).optional(),
  }).strict()).max(1000).optional(),
  minutes: z.number().nonnegative().max(10_000).nullable().optional(),
  swaps: z.number().int().nonnegative().max(10_000).nullable().optional(),
  /** Grams per filament, by the name on the AMS slot ("White PLA": 99.7). */
  grams: z.record(z.number().nonnegative().max(10_000)).optional(),
  ams: z.array(z.object({ slot: z.number().int().min(1).max(16), colour: z.string().trim().min(1).max(60) }).strict()).max(16).optional(),
  pause: z.object({ z: z.number().nonnegative().max(500), text: z.string().trim().min(1).max(600) }).strict().nullable().optional(),
  /** A part's fixed print file, uploaded once (the reference the server stored). Serialized beds are built per order. */
  fileRef: z.string().max(300).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  fileBytes: z.number().int().nonnegative().nullable().optional(),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
}).strict();
export type PrintBed = z.infer<typeof printBedSchema>;

/** What a part consumes when a serialized model's batch is assembled: one Stand takes a base and a G token. */
export const printConsumeSchema = z.object({
  part: z.string().regex(PRINT_MODEL_SLUG_PATTERN),
  perPiece: z.number().int().positive().max(100),
}).strict();

export const printVersionInputSchema = z.object({
  /** The builder id in print-pipeline/builders (plate.menu, stand.google, …); null for a part's fixed file. */
  builder: z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/, "Builder: lowercase id like plate.menu").nullable().optional()),
  /** What the builder takes besides the code: size, theme, pocket depth, font… */
  params: z.record(z.unknown()).default({}),
  /**
   * The bed recipe the 3MF builder reads (print-pipeline/lib/build_3mf.py): template, orientation, pause_top_z,
   * top_band, first_layer_sequence, settings_files and `settings` (wall_loops, top_shell_layers, the filament colours
   * and purge matrix…), without the per-piece `parts` and `copies`, which the builder writes for each order.
   */
  recipe: z.record(z.unknown()).default({}),
  beds: z.array(printBedSchema).min(1, "A version needs at least one bed layout").max(20),
  consumes: z.array(printConsumeSchema).max(10).default([]),
  changelog: optionalText(4000),
  /** The batch whose problem this version fixes (uuid or batch code). */
  fixesBatch: optionalText(80),
}).strict().superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.beds.forEach((bed, index) => {
    const key = bed.label.toLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beds", index, "label"], message: "Two beds with the same label" });
    seen.add(key);
    if (bed.positions && bed.positions.length !== bed.copies) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beds", index, "positions"], message: "One position per copy" });
    }
    if (bed.slots && bed.slots.length !== bed.copies) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["beds", index, "slots"], message: "One slot per copy" });
    }
  });
});
export type PrintVersionInput = z.infer<typeof printVersionInputSchema>;

export const printModelInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(PRINT_MODEL_SLUG_PATTERN, "Slug: lowercase words joined by dashes").max(80),
  kind: z.enum(PRINT_MODEL_KINDS),
  title: z.string().trim().min(1, "Give it a title").max(120),
  description: optionalText(2000),
  productType: z.enum(TAG_PRODUCT_TYPES).nullable().optional(),
  face: z.enum(TAG_FACES).nullable().optional(),
  theme: optionalText(40),
  salesProductId: z.number().int().positive().nullable().optional(),
  batchPrefix: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v), z.string().regex(PRINT_BATCH_PREFIX_PATTERN, "Prefix: 2-12 letters/digits, e.g. LPLATE").nullable().optional()),
  sortOrder: z.number().int().min(-1000).max(100_000).default(0),
  /** Optional: the model arrives with its v1 and is `ready` at once. */
  version: printVersionInputSchema.optional(),
}).strict().superRefine((input, ctx) => {
  if (input.kind !== "serialized") return;
  for (const key of ["productType", "salesProductId", "batchPrefix"] as const) {
    if (input[key] === null || input[key] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "A serialized model needs a product type, a sales product and a batch prefix" });
    }
  }
});
export type PrintModelInput = z.infer<typeof printModelInputSchema>;

export const printModelPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: optionalText(2000),
  theme: optionalText(40),
  face: z.enum(TAG_FACES).nullable().optional(),
  salesProductId: z.number().int().positive().nullable().optional(),
  batchPrefix: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v), z.string().regex(PRINT_BATCH_PREFIX_PATTERN).nullable().optional()),
  sortOrder: z.number().int().min(-1000).max(100_000).optional(),
  /** A part's reorder point: below it the catalog warns. Null: no alert. */
  partReorderAt: z.number().int().min(0).max(100_000).nullable().optional(),
  /** Only `retired` ⇄ back: `ready`/`design_needed` follow from having a current version. */
  retired: z.boolean().optional(),
}).strict();
export type PrintModelPatch = z.infer<typeof printModelPatchSchema>;

export const printJobCreateSchema = z.object({
  /** Model uuid or slug. */
  model: z.string().trim().min(1).max(80),
  /** The bed label; omitted: the version's first bed. */
  bed: z.string().trim().min(1).max(40).optional(),
  /** How many pieces: split into plates of the bed's copies, the last one partial. Omitted: one full bed (or `plates`). */
  quantity: z.number().int().positive().max(10_000).optional(),
  /** Whole beds instead of a count of pieces (`quantity` wins when both come). */
  plates: z.number().int().positive().max(PRINT_MAX_PLATES).optional(),
  notes: optionalText(2000),
  /**
   * Link an existing batch instead of issuing codes (the orders behind batches made before this catalog existed).
   * The order's status follows the batch: received/printed → printed, built → ready if a file is attached later.
   */
  existingBatch: optionalText(80),
}).strict();
export type PrintJobCreateInput = z.infer<typeof printJobCreateSchema>;

export const printProblemSchema = z.object({
  text: z.string().trim().min(3, "Say what went wrong").max(2000),
}).strict();

export const printJobUpdateSchema = z.object({
  action: z.enum(["start", "printed", "fail", "cancel", "release", "complete"]),
  reason: optionalText(500),
}).strict();

export const printPartAdjustSchema = z.object({
  delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Change the count by at least one"),
  reason: z.enum(PRINT_PART_REASONS).default("adjustment"),
  note: optionalText(300),
}).strict();

// ─── API types ────────────────────────────────────────────────────────────────

export interface PrintModelVersionItem {
  id: string;
  modelId: string;
  version: number;
  status: PrintVersionStatus;
  builder: string | null;
  params: Record<string, unknown>;
  recipe: Record<string, unknown>;
  beds: PrintBed[];
  consumes: Array<{ part: string; perPiece: number }>;
  changelog: string | null;
  fixesBatchId: string | null;
  fixesBatchCode: string | null;
  source: PrintVersionSource;
  createdAt: string;
  /** Orders printed with it. */
  jobCount: number;
}

export interface PrintModelItem {
  id: string;
  slug: string;
  kind: PrintModelKind;
  title: string;
  description: string | null;
  productType: string | null;
  face: string | null;
  theme: string | null;
  salesProductId: number | null;
  batchPrefix: string | null;
  status: PrintModelStatus;
  sortOrder: number;
  currentVersion: PrintModelVersionItem | null;
  /** Serialized: pieces of this model's batches in house stock / with resellers. Part: the counter. */
  onHand: number;
  withResellers: number;
  /** Orders not finished yet (requested … printing). */
  openJobs: number;
  /** A part's reorder point, and whether its count is below it. */
  partReorderAt: number | null;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintModelDetail extends PrintModelItem {
  versions: PrintModelVersionItem[];
  partMovements: Array<{ id: string; delta: number; reason: PrintPartReason; note: string | null; jobId: string | null; batchId: string | null; createdAt: string }>;
}

export interface PrintJobFileItem {
  id: string;
  kind: PrintFileKind;
  filename: string;
  bytes: number;
  sha256: string;
  createdAt: string;
}

export interface PrintJobItem {
  id: string;
  modelId: string;
  modelSlug: string;
  modelTitle: string;
  modelKind: PrintModelKind;
  versionId: string;
  version: number;
  bedLabel: string;
  plates: number;
  quantity: number;
  status: PrintJobStatus;
  batchId: string | null;
  batchCode: string | null;
  /** Serialized orders: pieces scanned into stock out of the batch's pieces. */
  receivedCount: number | null;
  pieceCount: number | null;
  deviceName: string | null;
  notes: string | null;
  errorMessage: string | null;
  report: Record<string, unknown>;
  createdAt: string;
  builtAt: string | null;
  printedAt: string | null;
  updatedAt: string;
  /** No bench event for a while on a `building` order. */
  stale: boolean;
  /** The request this plate belongs to, its place in it ("plate 2 of 3") and how many pieces the request asked for. */
  requestId: string | null;
  plateNumber: number;
  plateCount: number;
  requestQuantity: number;
  /** The print files to download: the Bambu Studio project (.3mf) and the sliced, checked file (.gcode.3mf). */
  downloads: Array<{ id: string; kind: PrintFileKind; filename: string }>;
}

/** What was asked, with its plates (a redone plate shows next to the one it replaces). */
export interface PrintRequestItem {
  id: string;
  modelId: string;
  modelSlug: string;
  modelTitle: string;
  modelKind: PrintModelKind;
  version: number;
  bedLabel: string;
  /** Pieces asked for (a part's plates may round it up to whole beds). */
  quantity: number;
  notes: string | null;
  createdAt: string;
  /** Some plate still to build or print. */
  open: boolean;
  plates: PrintJobItem[];
}

export interface PrintJobPiece {
  serialNumber: number | null;
  publicCode: string;
  position: string | null;
  qrUrl: string;
  nfcUrl: string;
  stockStatus: string;
}

export interface PrintJobDetail extends PrintJobItem {
  bed: PrintBed | null;
  /** The parts one piece of this version takes when it is assembled (a Stand: a base and a G token). */
  consumes: Array<{ part: string; perPiece: number }>;
  builder: string | null;
  params: Record<string, unknown>;
  recipe: Record<string, unknown>;
  files: PrintJobFileItem[];
  pieces: PrintJobPiece[];
}

/** What the bench receives when it claims an order: everything `bench.py build` needs, nothing else. */
export interface PrintJobTicket {
  job: { id: string; status: PrintJobStatus; plates: number; quantity: number; notes: string | null };
  model: { slug: string; title: string; kind: PrintModelKind; productType: string | null; face: string | null; theme: string | null };
  version: { id: string; version: number; builder: string | null; params: Record<string, unknown>; recipe: Record<string, unknown>; bed: PrintBed };
  batch: { id: string; batchCode: string } | null;
  tags: Array<{ serial_number: string; public_code: string; qr_url: string; nfc_url: string; position: string | null }>;
}

/** After how long without news a `building` order is shown as stuck (the bench died or lost the network). */
export const PRINT_JOB_STALE_MS = 30 * 60_000;

/** How long a printed plate stays in the bench's Print Now folder (Printed/) before the bench clears it. */
export const PRINT_NOW_PRINTED_DAYS = 14;

/** A plate as the bench mirrors it into the Print Now folder: where it goes and the files to fetch (signed links). */
export interface PrintNowPlate {
  id: string;
  status: PrintJobStatus;
  requestId: string | null;
  requestCreatedAt: string;
  requestQuantity: number;
  plateNumber: number;
  plateCount: number;
  quantity: number;
  batchCode: string | null;
  modelTitle: string;
  files: Array<{ id: string; kind: PrintFileKind; filename: string; sha256: string; bytes: number; url: string }>;
}

/** The serial map a bed and its pieces give, in copy order: plate n, copy k → position k. */
export function bedPosition(bed: Pick<PrintBed, "positions" | "copies"> | null, serialNumber: number | null): string | null {
  if (!bed?.positions?.length || !serialNumber) return null;
  return bed.positions[(serialNumber - 1) % bed.copies] ?? null;
}
