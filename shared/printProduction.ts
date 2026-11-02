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
import { TAG_PRODUCT_TYPES, normalizeTagCode } from "./tags.js";
import { TAG_FACES } from "./tagFace.js";

export const PRINT_MODEL_KINDS = ["serialized", "part"] as const;
export type PrintModelKind = (typeof PRINT_MODEL_KINDS)[number];

/** `design_needed`: in the catalog, not drawn yet (Claude delivers its v1); `ready`: has a current version. */
export const PRINT_MODEL_STATUSES = ["design_needed", "ready", "retired"] as const;
export type PrintModelStatus = (typeof PRINT_MODEL_STATUSES)[number];

/** `current`: the recipe new orders use (one per model); `superseded`: an older one, still linked to what it printed. */
export const PRINT_VERSION_STATUSES = ["current", "superseded"] as const;
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

/** A version's 3D preview: one sample piece as a binary glTF (print-pipeline/preview.py), shown in Production. */
export const PRINT_PREVIEW_CONTENT_TYPE = "model/gltf-binary";
export const PRINT_PREVIEW_MAX_BYTES = 16 * 1024 * 1024;

export interface PrintPreviewInfo {
  fileName: string;
  bytes: number;
  sha256: string;
  uploadedAt: string;
}

/** Where the admin app loads a version's preview from (the server streams it from private storage). */
export function printPreviewPath(modelSlug: string, versionId: string): string {
  return `/api/xpot/admin/print-models/${encodeURIComponent(modelSlug)}/versions/${versionId}/preview`;
}

/**
 * What every picture of a piece needs to show it in 3D (the piece template, client/src/components/xpot/PiecePicture):
 * the models whose current version has a preview, and which of them each batch was printed from. A piece itself only
 * carries its product type and face, never its colour, so the batch is what tells a white plate from a black one.
 */
export interface PrintPreviewCatalog {
  models: Array<{ slug: string; title: string; productType: string | null; face: string | null; theme: string | null; sha256: string; private?:boolean }>;
  /** Batch code -> slug of the model it came from, for batches of models in `models`. */
  batches: Record<string, string>;
}

export const PRINT_PREVIEW_CATALOG_PATH = "/api/xpot/print-previews";

/** A model's current preview for any signed-in rep (the admin path above is for admins only). The hash busts the cache. */
export function printModelPreviewPath(modelSlug: string, sha256: string): string {
  return `${PRINT_PREVIEW_CATALOG_PATH}/${encodeURIComponent(modelSlug)}/glb?v=${sha256.slice(0, 12)}`;
}

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
  // Also from requested: a plate printed by hand from a file made outside Xpot (or before the catalog) has no
  // file to attach. Not from building, where a bench is still at work on it.
  printed: { from: ["requested", "ready", "printing"], to: "printed" },
  // Also from failed: a plate that will not be printed again is closed, so its request stops asking for action.
  cancel: { from: ["requested", "building", "ready", "failed"], to: "cancelled" },
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

/** Whether the admin may mark this order printed: what the "Mark printed" buttons show on. */
export function canMarkPrinted(status: string): boolean {
  return planPrintJobTransition(status, "printed").ok;
}

/** The bench's error code when a QR on layer 1 does not decode to its own code (print-pipeline/pipeline.py). */
export const PRINT_ERROR_QR_CHECK = "qr_check_failed";

/**
 * What "Print again" does with a failed or cancelled serialized plate's codes:
 * - `same`: the same batch again (same version and bed), while none of its pieces was received;
 * - `fresh`: a new batch from the current version, once some piece was received (those codes are taken);
 * - `replace`: the plate failed its QR check and nothing was received. The same codes would build into the same
 *   drawing and fail again (a plate could only be cancelled), so its pending codes are retired, its batch cancelled,
 *   and a new batch with fresh codes takes its place.
 */
export type PrintRedoCodes = "same" | "fresh" | "replace";

export function planRedoCodes(job: { errorCode: string | null; anyReceived: boolean }): PrintRedoCodes {
  if (job.anyReceived) return "fresh";
  return job.errorCode === PRINT_ERROR_QR_CHECK ? "replace" : "same";
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

/** A model's colour ("white", "black", "mixed"…): always stored and compared in lowercase. */
const themeText = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v), z.string().max(40).nullable().optional());

/** The one way two colours are compared: "White" and "white" are the same colour. */
export function sameTheme(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

export const PRINT_MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What a model needs besides our print files, so a partner buys the right thing ("What you need"). */
export const PRINT_MATERIAL_KINDS = ["nfc_sticker", "filament", "other"] as const;
export type PrintMaterialKind = (typeof PRINT_MATERIAL_KINDS)[number];

/** A buy link is a web address a person opens: http(s) only, never a script or file link. */
const webUrl = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() || null : v),
  z.string().max(500).refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "A web address starting with https://").nullable().optional(),
);

export const printMaterialSchema = z.object({
  kind: z.enum(PRINT_MATERIAL_KINDS),
  name: z.string().trim().min(1, "Name the material").max(120),
  /** Size or colour: "10 x 20 mm", "White PLA". */
  spec: optionalText(120),
  /** Where to buy it. The platform names it; nothing is guessed. */
  supplier: optionalText(120),
  url: webUrl,
  note: optionalText(500),
}).strict();
export type PrintMaterial = z.infer<typeof printMaterialSchema>;

export const PRINT_MATERIALS_MAX = 20;
export const printMaterialsSchema = z.array(printMaterialSchema).max(PRINT_MATERIALS_MAX);

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

/**
 * The NFC types a piece can take, chosen when a print is asked for. Each is a different print file (the pocket, the
 * pause, the part it uses), made by print-pipeline/nfc/Stand/source/design/nfc_mounts.py. The round sticker is the default.
 */
export const PRINT_NFC_MOUNTS = ["sticker_round_25", "sticker_10x20", "embedded_round"] as const;
export type PrintNfcMount = (typeof PRINT_NFC_MOUNTS)[number];
export const PRINT_DEFAULT_NFC_MOUNT: PrintNfcMount = "sticker_round_25";

/** What one NFC type changes in a version: its pause and the parts one piece takes. A material replaces the listed sticker. */
export const printNfcVariantSchema = z.object({
  pause: z.object({ z: z.number().nonnegative().max(500), text: z.string().trim().min(1).max(600) }).strict(),
  consumes: z.array(printConsumeSchema).max(10).default([]),
  material: printMaterialSchema.optional(),
}).strict();
export type PrintNfcVariant = z.infer<typeof printNfcVariantSchema>;
export type PrintNfcVariants = Partial<Record<PrintNfcMount, PrintNfcVariant>>;

/** The types a version offers, in the order they are asked; none on a version made before the choice existed. */
export function nfcMountsOf(variants: PrintNfcVariants | null | undefined): PrintNfcMount[] {
  return PRINT_NFC_MOUNTS.filter((mount) => variants?.[mount]);
}

/** The answer already marked when the question shows: the default when this version has it. */
export function preferredNfcMount(mounts: readonly PrintNfcMount[]): PrintNfcMount | null {
  return mounts.includes(PRINT_DEFAULT_NFC_MOUNT) ? PRINT_DEFAULT_NFC_MOUNT : mounts[0] ?? null;
}

/** A version as one NFC type prints it: the builder's params, the recipe's pause, every bed's pause and the parts it takes. */
export function withNfcVariant<V extends { params: Record<string, unknown>; recipe: Record<string, unknown>; beds: PrintBed[]; consumes: Array<{ part: string; perPiece: number }> }>(
  version: V, variants: PrintNfcVariants | null | undefined, mount: string | null | undefined,
): V {
  const variant = mount ? variants?.[mount as PrintNfcMount] : undefined;
  if (!variant) return version;
  const { _pause: _note, ...recipe } = version.recipe;
  return {
    ...version,
    params: { ...version.params, nfc_mount: mount },
    recipe: { ...recipe, pause_top_z: variant.pause.z },
    beds: version.beds.map((bed) => ({ ...bed, pause: variant.pause })),
    consumes: variant.consumes,
  };
}

/** "What you need" for one NFC type: its sticker instead of whichever the model lists. */
export function materialsForNfc(materials: readonly PrintMaterial[] | null | undefined, variant: PrintNfcVariant | null | undefined): PrintMaterial[] {
  const list = materials ?? [];
  return variant?.material ? [variant.material, ...list.filter((material) => material.kind !== "nfc_sticker")] : [...list];
}

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
  /** One variant per NFC type this version was built and checked with; `consumes` and the beds' pause are the default's. */
  nfcVariants: z.record(z.enum(PRINT_NFC_MOUNTS), printNfcVariantSchema).default({}),
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

/**
 * What a serialized model must say to be printed and generated (canGenerateModel): which product, face and colour it
 * is, which sales product its pieces are and the prefix of its batches. Required when it is created and kept on edit.
 */
export const SERIALIZED_MODEL_FIELDS = ["productType", "face", "theme", "salesProductId", "batchPrefix"] as const;
const SERIALIZED_MODEL_MESSAGE = "A serialized model needs a product type, a face, a colour, a sales product and a batch prefix";

export const printModelInputSchema = z.object({
  /** A customer's dedicated design is private from its first write. Platform creation only. */
  customerOrderLineId:z.string().uuid().optional(),
  slug: z.string().trim().toLowerCase().regex(PRINT_MODEL_SLUG_PATTERN, "Slug: lowercase words joined by dashes").max(80),
  kind: z.enum(PRINT_MODEL_KINDS),
  title: z.string().trim().min(1, "Give it a title").max(120),
  description: optionalText(2000),
  productType: z.enum(TAG_PRODUCT_TYPES).nullable().optional(),
  face: z.enum(TAG_FACES).nullable().optional(),
  theme: themeText,
  salesProductId: z.number().int().positive().nullable().optional(),
  batchPrefix: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v), z.string().regex(PRINT_BATCH_PREFIX_PATTERN, "Prefix: 2-12 letters/digits, e.g. LPLATE").nullable().optional()),
  sortOrder: z.number().int().min(-1000).max(100_000).default(0),
  /** What the model needs besides our files (platform only). */
  materials: printMaterialsSchema.optional(),
  /** Optional: the model arrives with its v1 and is `ready` at once. */
  version: printVersionInputSchema.optional(),
}).strict().superRefine((input, ctx) => {
  if (input.kind !== "serialized") return;
  for (const key of SERIALIZED_MODEL_FIELDS) {
    if (input[key] === null || input[key] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: SERIALIZED_MODEL_MESSAGE });
    }
  }
});
export type PrintModelInput = z.infer<typeof printModelInputSchema>;

export const printModelPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: optionalText(2000),
  theme: themeText,
  /** Product and face: only while no plate was ordered (the batches printed from the model keep what they were). */
  productType: z.enum(TAG_PRODUCT_TYPES).nullable().optional(),
  face: z.enum(TAG_FACES).nullable().optional(),
  salesProductId: z.number().int().positive().nullable().optional(),
  batchPrefix: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v), z.string().regex(PRINT_BATCH_PREFIX_PATTERN).nullable().optional()),
  sortOrder: z.number().int().min(-1000).max(100_000).optional(),
  /** The whole list, replaced (platform only): the sticker, the filament, where to buy them. */
  materials: printMaterialsSchema.optional(),
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
  /** Which NFC goes inside: required when the model's current version offers a choice. */
  nfcMount: z.enum(PRINT_NFC_MOUNTS).optional(),
  notes: optionalText(2000),
  /**
   * Link an existing batch instead of issuing codes (the orders behind batches made before this catalog existed).
   * The order's status follows the batch: received/printed → printed, built → ready if a file is attached later.
   */
  existingBatch: optionalText(80),
  /**
   * Whose pieces these are (organization slug or id): the request, its plates, batches and pieces are filed under it.
   * Omitted: the company ('xpot-company') for an admin, the branch itself for a branch's Rep Admin.
   */
  organization: z.union([z.string().trim().min(1).max(80), z.number().int().positive()]).optional(),
}).strict();
export type PrintJobCreateInput = z.infer<typeof printJobCreateSchema>;

export const printProblemSchema = z.object({
  text: z.string().trim().min(3, "Say what went wrong").max(2000),
}).strict();

// Public codes of the pieces that came out bad on the plate (damaged, not stock). Printed only.
const badPiecesField = z.array(z.string().trim().min(1).max(40)).max(1000).optional();

export const printJobUpdateSchema = z.object({
  action: z.enum(["start", "printed", "fail", "cancel", "release", "complete"]),
  reason: optionalText(500),
  /** `printed`: pieces that came out bad (public codes of the plate's batch); the rest of the batch goes into stock. */
  badPieces: badPiecesField,
}).strict().refine((v) => !v.badPieces?.length || v.action === "printed", {
  message: "Only a printed plate can list bad pieces",
  path: ["badPieces"],
});

/** Put the pending pieces of an already printed plate into stock (`POST /print-jobs/:id/stock`). */
export const printJobStockSchema = z.object({ badPieces: badPiecesField }).strict();

export interface PrintedPieceSplit {
  /** Pending pieces that go into house stock. */
  good: string[];
  /** Pending pieces marked bad: they become damaged. */
  bad: string[];
  /** Codes of `badPieces` that are not pieces of the plate's batch. */
  unknown: string[];
}

/**
 * Splits a plate's pieces when it is printed: the pending ones are good unless listed as bad. `badPieces` may be
 * written as typed (case, dashes, O/0); a code outside the batch is reported, never ignored. Pieces that are not
 * pending any more (already in stock, damaged) are left alone.
 */
export function splitPrintedPieces(
  pieces: ReadonlyArray<{ publicCode: string; stockStatus: string }>,
  badPieces: readonly string[] = [],
): PrintedPieceSplit {
  const known = new Set(pieces.map((p) => p.publicCode));
  const wanted = new Set<string>();
  const unknown: string[] = [];
  for (const raw of badPieces) {
    const code = normalizeTagCode(raw);
    if (code && known.has(code)) wanted.add(code);
    else unknown.push(raw);
  }
  const pending = pieces.filter((p) => p.stockStatus === "pending").map((p) => p.publicCode);
  return { good: pending.filter((c) => !wanted.has(c)), bad: pending.filter((c) => wanted.has(c)), unknown };
}

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
  nfcVariants: PrintNfcVariants;
  changelog: string | null;
  fixesBatchId: string | null;
  fixesBatchCode: string | null;
  source: PrintVersionSource;
  createdAt: string;
  /** Orders printed with it. */
  jobCount: number;
  /** The 3D preview of one sample piece, when one was uploaded. */
  preview: PrintPreviewInfo | null;
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
  /** What a partner needs to buy to print it (migrations/0069). */
  materials: PrintMaterial[];
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
  /** The NFC type chosen; null on a plate of a version with no choice. */
  nfcMount: PrintNfcMount | null;
  /** Serialized orders: pieces in stock (not pending, not damaged) out of the batch's pieces. */
  receivedCount: number | null;
  /** Serialized orders: pieces still pending (a plate printed before stock followed "printed" may still have some). */
  pendingCount: number | null;
  pieceCount: number | null;
  /** Serialized orders: pieces marked damaged when the plate was printed. */
  damagedCount: number | null;
  deviceName: string | null;
  notes: string | null;
  /** Why a failed plate failed, as a code (`build_failed`, `qr_check_failed`, `failed` when marked by hand). */
  errorCode: string | null;
  errorMessage: string | null;
  report: Record<string, unknown>;
  createdAt: string;
  builtAt: string | null;
  printedAt: string | null;
  updatedAt: string;
  /** No bench event for a while on a `building` order. */
  stale: boolean;
  /** A failed or cancelled plate already printed again: the attempt that took its place (it cannot be redone twice). */
  redoneBy: string | null;
  /** A printed plate whose damaged pieces were asked for again: the first live plate of that request (null again if it was cancelled). */
  reprintedBy: { id: string; batchCode: string | null } | null;
  /** This plate belongs to a request that replaces the damaged pieces of another printed plate. */
  replaces: { id: string; batchCode: string | null } | null;
  /** The request this plate belongs to, its place in it ("plate 2 of 3") and how many pieces the request asked for. */
  requestId: string | null;
  plateNumber: number;
  plateCount: number;
  requestQuantity: number;
  /** The print files to download: the Bambu Studio project (.3mf) and the sliced, checked file (.gcode.3mf). */
  downloads: Array<{ id: string; kind: PrintFileKind; filename: string }>;
  /** Whose production this plate is (its batch and pieces belong to it). */
  organizationId: number;
  organizationName: string;
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
  nfcMount: PrintNfcMount | null;
  notes: string | null;
  createdAt: string;
  /** Some plate still to build or print. */
  open: boolean;
  plates: PrintJobItem[];
  /** Whose production the request is. */
  organizationId: number;
  organizationName: string;
}

export interface PrintJobPiece {
  serialNumber: number | null;
  publicCode: string;
  position: string | null;
  qrUrl: string;
  nfcUrl: string;
  stockStatus: string;
  /** Its chip was written (programmed, verified or locked). */
  chipWritten: boolean;
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
  /** The version's 3D preview (one sample piece), when it has one. */
  preview: PrintPreviewInfo | null;
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
  nfcMount: PrintNfcMount | null;
  files: Array<{ id: string; kind: PrintFileKind; filename: string; sha256: string; bytes: number; url: string }>;
}

/** The serial map a bed and its pieces give, in copy order: plate n, copy k → position k. */
export function bedPosition(bed: Pick<PrintBed, "positions" | "copies"> | null, serialNumber: number | null): string | null {
  if (!bed?.positions?.length || !serialNumber) return null;
  return bed.positions[(serialNumber - 1) % bed.copies] ?? null;
}

// ─── The Production page: always-ready pieces and pieces to generate ─────────────────────────────────────────────

/**
 * Whether an organization may request, generate and print a model (organizations.released_print_models): `null` is
 * every model (the company, and any organization nobody restricted); a list is exactly those models, by slug.
 */
export function modelReleased(released: readonly string[] | null | undefined, slug: string): boolean {
  return released == null || released.includes(slug);
}

/** A part's bed that only counts what was bought (a sticker, a washer): nothing to print. */
export const PRINT_BOUGHT_BED = "bought";

/** The beds of a part that come off the printer, in the version's order. */
export function printedPartBeds(model: Pick<PrintModelItem, "kind" | "currentVersion">): PrintBed[] {
  if (model.kind !== "part") return [];
  return (model.currentVersion?.beds ?? []).filter((bed) => bed.label.toLowerCase() !== PRINT_BOUGHT_BED);
}

/**
 * Always-ready pieces: parts with no serial (a Stand base, a G token) that are printed from a fixed file at any
 * time, as often as needed. Downloading one records nothing. Bought parts (stickers, washers) are not on the page.
 */
export function isAlwaysReadyPart(model: Pick<PrintModelItem, "kind" | "status" | "currentVersion">): boolean {
  return model.kind === "part" && model.status === "ready" && printedPartBeds(model).length > 0;
}

/** The versions of one always-ready piece, in the order they came. */
export interface PrintPartFamily<T> {
  name: string;
  models: T[];
}

const PART_TITLE_SEPARATOR = " · ";

/** "Google G token · Small Stand (13.5 mm)" is the "Small Stand (13.5 mm)" of the piece before the separator. */
export function printPartVariant(title: string): string {
  const at = title.indexOf(PART_TITLE_SEPARATOR);
  return at < 0 ? title : title.slice(at + PART_TITLE_SEPARATOR.length).trim();
}

/** Always-ready parts as one entry per piece: the catalog titles them "Piece · Version". */
export function printPartFamilies<T extends { title: string }>(parts: readonly T[]): PrintPartFamily<T>[] {
  const families = new Map<string, T[]>();
  for (const part of parts) {
    const at = part.title.indexOf(PART_TITLE_SEPARATOR);
    const name = at < 0 ? part.title : part.title.slice(0, at).trim();
    families.set(name, [...(families.get(name) ?? []), part]);
  }
  return Array.from(families, ([name, models]) => ({ name, models }));
}

/** A serialized model the house can generate right now: ready, with a generator, a bed and what its batch needs. */
export function canGenerateModel(model: PrintModelItem): boolean {
  return model.kind === "serialized" && model.status === "ready" && !!model.currentVersion?.builder &&
    (model.currentVersion.beds?.length ?? 0) > 0 && !!model.productType && !!model.face && !!model.theme &&
    !!model.salesProductId && !!model.batchPrefix;
}

export interface PrintGenerateFace {
  face: string;
  modelId: string;
  slug: string;
  title: string;
  /** Pieces on one printer plate of the model's first bed. */
  copies: number;
  bedLabel: string;
  hasPreview: boolean;
  /** What the model needs to be bought ("What you need"). */
  materials: PrintMaterial[];
  /** The NFC types to ask about, with what each one changes; empty on a version with no choice. */
  nfcMounts: PrintNfcMount[];
  nfcVariants: PrintNfcVariants;
}

export interface PrintGenerateOption {
  productType: string;
  colours: Array<{ theme: string; faces: PrintGenerateFace[] }>;
}

const THEME_ORDER = ["white", "black"];
const rank = (list: readonly string[], value: string) => {
  const index = list.indexOf(value);
  return index < 0 ? list.length : index;
};

/**
 * The questions of "generate pieces", from the catalog: per product (Large Stand, Small Plate…) the colours that
 * have at least one generable face, and per colour the faces. Only what the house can actually make shows up; a
 * product × colour × face with two ready models takes the first by the catalog's order.
 */
export function printGenerateOptions(models: readonly PrintModelItem[]): PrintGenerateOption[] {
  const byProduct = new Map<string, Map<string, Map<string, PrintModelItem>>>();
  for (const model of [...models].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))) {
    if (!canGenerateModel(model)) continue;
    const colours = byProduct.get(model.productType!) ?? new Map<string, Map<string, PrintModelItem>>();
    byProduct.set(model.productType!, colours);
    // Colours group in lowercase: a model typed "White" is the same colour as "white".
    const theme = model.theme!.trim().toLowerCase();
    const faces = colours.get(theme) ?? new Map<string, PrintModelItem>();
    colours.set(theme, faces);
    if (!faces.has(model.face!)) faces.set(model.face!, model);
  }
  return Array.from(byProduct.entries())
    .sort(([a], [b]) => rank(TAG_PRODUCT_TYPES, a) - rank(TAG_PRODUCT_TYPES, b))
    .map(([productType, colours]) => ({
      productType,
      colours: Array.from(colours.entries())
        .sort(([a], [b]) => rank(THEME_ORDER, a) - rank(THEME_ORDER, b) || a.localeCompare(b))
        .map(([theme, faces]) => ({
          theme,
          faces: Array.from(faces.values())
            .sort((a, b) => rank(TAG_FACES, a.face!) - rank(TAG_FACES, b.face!))
            .map((model) => {
              const bed = model.currentVersion!.beds[0];
              return {
                face: model.face!,
                modelId: model.id,
                slug: model.slug,
                title: model.title,
                copies: bed.copies,
                bedLabel: bed.label,
                hasPreview: !!model.currentVersion!.preview,
                materials: model.materials ?? [],
                nfcMounts: nfcMountsOf(model.currentVersion!.nfcVariants),
                nfcVariants: model.currentVersion!.nfcVariants ?? {},
              };
            }),
        })),
    }));
}

/** "Generate N pieces of this product, colour and face": the server finds the model, so only stocked choices work. */
export const printGenerateSchema = z.object({
  productType: z.enum(TAG_PRODUCT_TYPES),
  theme: z.string().trim().toLowerCase().pipe(z.string().min(1).max(40)),
  face: z.enum(TAG_FACES),
  quantity: z.number().int().positive().max(10_000),
  /** Which NFC goes inside (as printJobCreateSchema's). */
  nfcMount: z.enum(PRINT_NFC_MOUNTS).optional(),
  notes: optionalText(2000),
  /** Whose pieces (as printJobCreateSchema's `organization`): omitted, the company's or the branch's own. */
  organization: z.union([z.string().trim().min(1).max(80), z.number().int().positive()]).optional(),
}).strict();
export type PrintGenerateInput = z.infer<typeof printGenerateSchema>;

/** The model behind one choice of printGenerateOptions, or null when the house does not make it. */
export function pickGenerateFace(options: readonly PrintGenerateOption[], choice: Pick<PrintGenerateInput, "productType" | "theme" | "face">): PrintGenerateFace | null {
  const colours = options.find((option) => option.productType === choice.productType)?.colours ?? [];
  const faces = colours.find((colour) => sameTheme(colour.theme, choice.theme))?.faces ?? [];
  return faces.find((face) => face.face === choice.face) ?? null;
}

/** A part that is only bought (its one bed is "bought"): nothing to print, only a count to keep right. */
export function isBoughtPart(model: Pick<PrintModelItem, "kind" | "currentVersion">): boolean {
  const beds = model.currentVersion?.beds ?? [];
  return model.kind === "part" && beds.length > 0 && beds.every((bed) => bed.label.toLowerCase() === PRINT_BOUGHT_BED);
}
