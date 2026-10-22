import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  printJobFiles,
  printJobs,
  printModelVersions,
  printModels,
  printPartMovements,
  tagBatches,
  tagProvisioningDevices,
  type PrintJobRow,
  type PrintModelRow,
} from "#shared/schema.js";
import {
  PRINT_FILE_CONTENT_TYPES,
  PRINT_FILE_MAX_BYTES,
  PRINT_JOB_STALE_MS,
  PRINTER_STATUS_STALE_MS,
  bedPosition,
  nextPrintBatchCode,
  planPrintJobTransition,
  type PrintBed,
  type PrintFileKind,
  type PrintJobAction,
  type PrintJobCreateInput,
  type PrintJobDetail,
  type PrintJobFileItem,
  type PrintJobItem,
  type PrintJobPiece,
  type PrintJobStatus,
  type PrintJobTicket,
  type PrintModelDetail,
  type PrintModelInput,
  type PrintModelItem,
  type PrintModelKind,
  type PrintModelPatch,
  type PrintModelStatus,
  type PrintModelVersionItem,
  type PrintPartReason,
  type PrintVersionInput,
  type PrintVersionSource,
  type PrintVersionStatus,
  type PrinterItem,
  type PrinterStatus,
  type PrintSendTicket,
} from "#shared/printProduction.js";
import { TAG_DEFAULT_PUBLIC_BASE_URL, buildTagUrls, padSerial } from "#shared/tags.js";
import type { JourneySource } from "#shared/tagJourney.js";
import { FileStorageUnavailableError, parseRef, putPrivateFile, resolveFileUrl } from "../lib/files.js";
import { TagError, pgError } from "./errors.js";
import { journeyContext, recordJourney, resolveBatchId } from "./journey.js";
import { countMetricSql } from "./metrics.js";
import { createBatch, getBatchProduction, iso, rows, type Tx } from "./repository.js";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the catalog of what the house prints (models), the frozen
// recipes (versions) and the queue of print orders with their files. Rules and types: shared/printProduction.ts.
// A serialized order issues its batch through the same createBatch as Tags › Batches, in the same transaction;
// stock still enters only by scanning each printed piece into that batch. Everything here is the global admin's,
// plus the paired bench app (a provisioner device with the 'print' capability) for building and attaching files.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Rows → items ─────────────────────────────────────────────────────────────

interface VersionRow {
  id: string; model_id: string; version: number; status: string; builder: string | null;
  params: Record<string, unknown> | null; recipe: Record<string, unknown> | null; beds: PrintBed[] | null;
  consumes: Array<{ part: string; perPiece: number }> | null; changelog: string | null; fixes_batch_id: string | null;
  fixes_batch_code: string | null; source: string; created_at: Date | string; job_count: number;
}

const VERSION_SELECT = sql`
  SELECT v.id, v.model_id, v.version, v.status, v.builder, v.params, v.recipe, v.beds, v.consumes, v.changelog,
    v.fixes_batch_id, fb.batch_code AS fixes_batch_code, v.source, v.created_at,
    (SELECT count(*)::int FROM print_jobs j WHERE j.version_id = v.id) AS job_count
  FROM print_model_versions v
  LEFT JOIN tag_batches fb ON fb.id = v.fixes_batch_id`;

function versionItem(v: VersionRow): PrintModelVersionItem {
  return {
    id: v.id,
    modelId: v.model_id,
    version: Number(v.version),
    status: v.status as PrintVersionStatus,
    builder: v.builder,
    params: v.params ?? {},
    recipe: v.recipe ?? {},
    beds: v.beds ?? [],
    consumes: v.consumes ?? [],
    changelog: v.changelog,
    fixesBatchId: v.fixes_batch_id,
    fixesBatchCode: v.fixes_batch_code,
    source: v.source as PrintVersionSource,
    createdAt: iso(v.created_at)!,
    jobCount: Number(v.job_count),
  };
}

interface ModelRow {
  id: string; slug: string; kind: string; title: string; description: string | null; product_type: string | null;
  face: string | null; theme: string | null; sales_product_id: number | null; batch_prefix: string | null; status: string;
  current_version_id: string | null; part_on_hand: number; sort_order: number; created_at: Date | string; updated_at: Date | string;
  open_jobs: number; house_count: number; with_resellers_count: number;
}

// A serialized model's stock: the pieces of the batches its orders issued, counted like the rest of Tags.
const MODEL_SELECT = sql`
  SELECT m.id, m.slug, m.kind, m.title, m.description, m.product_type, m.face, m.theme, m.sales_product_id, m.batch_prefix,
    m.status, m.current_version_id, m.part_on_hand, m.sort_order, m.created_at, m.updated_at,
    (SELECT count(*)::int FROM print_jobs j WHERE j.model_id = m.id
      AND j.status IN ('requested', 'building', 'ready', 'printing')) AS open_jobs,
    (SELECT ${countMetricSql("house")} FROM tags t JOIN tag_batches b ON b.id = t.batch_id
      JOIN print_jobs j ON j.id = b.print_job_id WHERE j.model_id = m.id) AS house_count,
    (SELECT ${countMetricSql("withResellers")} FROM tags t JOIN tag_batches b ON b.id = t.batch_id
      JOIN print_jobs j ON j.id = b.print_job_id WHERE j.model_id = m.id) AS with_resellers_count
  FROM print_models m`;

function modelItem(m: ModelRow, current: PrintModelVersionItem | null): PrintModelItem {
  const kind = m.kind as PrintModelKind;
  return {
    id: m.id,
    slug: m.slug,
    kind,
    title: m.title,
    description: m.description,
    productType: m.product_type,
    face: m.face,
    theme: m.theme,
    salesProductId: m.sales_product_id,
    batchPrefix: m.batch_prefix,
    status: m.status as PrintModelStatus,
    sortOrder: Number(m.sort_order),
    currentVersion: current,
    onHand: kind === "part" ? Number(m.part_on_hand) : Number(m.house_count),
    withResellers: kind === "part" ? 0 : Number(m.with_resellers_count),
    openJobs: Number(m.open_jobs),
    createdAt: iso(m.created_at)!,
    updatedAt: iso(m.updated_at)!,
  };
}

async function currentVersions(versionIds: string[]): Promise<Map<string, PrintModelVersionItem>> {
  if (!versionIds.length) return new Map();
  const list = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id IN (${sql.join(versionIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(list.map((v) => [v.id, versionItem(v)]));
}

// ─── Models ───────────────────────────────────────────────────────────────────

export async function listModels(): Promise<PrintModelItem[]> {
  const list = await rows<ModelRow>(sql`${MODEL_SELECT} ORDER BY m.sort_order, m.title`);
  const versions = await currentVersions(list.map((m) => m.current_version_id).filter((id): id is string => Boolean(id)));
  return list.map((m) => modelItem(m, m.current_version_id ? versions.get(m.current_version_id) ?? null : null));
}

/** A model by uuid or slug. */
export async function resolveModel(ref: string): Promise<PrintModelRow> {
  const value = ref.trim();
  const [model] = await db
    .select()
    .from(printModels)
    .where(UUID.test(value) ? eq(printModels.id, value) : eq(printModels.slug, value.toLowerCase()))
    .limit(1);
  if (!model) throw new TagError("No print model with that id or slug", 404, "print_model_not_found");
  return model;
}

export async function getModel(ref: string): Promise<PrintModelDetail> {
  const model = await resolveModel(ref);
  const [row] = await rows<ModelRow>(sql`${MODEL_SELECT} WHERE m.id = ${model.id}`);
  const versions = (await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.model_id = ${model.id} ORDER BY v.version DESC`)).map(versionItem);
  const movements = await db
    .select()
    .from(printPartMovements)
    .where(eq(printPartMovements.modelId, model.id))
    .orderBy(sql`${printPartMovements.createdAt} DESC`)
    .limit(100);
  return {
    ...modelItem(row, versions.find((v) => v.id === row.current_version_id) ?? null),
    versions,
    partMovements: movements.map((m) => ({
      id: m.id,
      delta: m.delta,
      reason: m.reason as PrintPartReason,
      note: m.note,
      jobId: m.jobId,
      batchId: m.batchId,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function createModel(input: PrintModelInput, userId: string | null, source: PrintVersionSource = "admin"): Promise<PrintModelDetail> {
  try {
    const [model] = await db.insert(printModels).values({
      slug: input.slug,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      productType: input.kind === "serialized" ? input.productType ?? null : null,
      face: input.kind === "serialized" ? input.face ?? null : null,
      theme: input.theme ?? null,
      salesProductId: input.kind === "serialized" ? input.salesProductId ?? null : null,
      batchPrefix: input.kind === "serialized" ? input.batchPrefix ?? null : null,
      status: "design_needed",
      sortOrder: input.sortOrder,
      createdByUserId: userId,
    }).returning();
    if (input.version) await createVersion(model.id, input.version, userId, source);
    return getModel(model.id);
  } catch (err) {
    if (pgError(err).code === "23505") throw new TagError(`A print model with slug ${input.slug} already exists`, 409, "print_model_slug_taken");
    throw err;
  }
}

export async function updateModel(ref: string, patch: PrintModelPatch): Promise<PrintModelDetail> {
  const model = await resolveModel(ref);
  const serialized = model.kind === "serialized";
  const next = {
    title: patch.title ?? model.title,
    description: patch.description !== undefined ? patch.description : model.description,
    theme: patch.theme !== undefined ? patch.theme : model.theme,
    face: serialized && patch.face !== undefined ? patch.face : model.face,
    salesProductId: serialized && patch.salesProductId !== undefined ? patch.salesProductId : model.salesProductId,
    batchPrefix: serialized && patch.batchPrefix !== undefined ? patch.batchPrefix : model.batchPrefix,
    sortOrder: patch.sortOrder ?? model.sortOrder,
  };
  if (serialized && (!next.salesProductId || !next.batchPrefix)) {
    throw new TagError("A serialized model needs a sales product and a batch prefix", 400, "print_model_incomplete");
  }
  const status: PrintModelStatus =
    patch.retired === true ? "retired"
      : patch.retired === false || model.status !== "retired" ? (model.currentVersionId ? "ready" : "design_needed")
        : "retired";
  await db.update(printModels).set({ ...next, status, updatedAt: new Date() }).where(eq(printModels.id, model.id));
  return getModel(model.id);
}

// ─── Versions ─────────────────────────────────────────────────────────────────

/** A bed file reference must be one this service stored (print/<uuid>/…), never an arbitrary key or URL. */
function checkBedFiles(beds: PrintBed[]) {
  for (const bed of beds) {
    if (!bed.fileRef) continue;
    const parsed = parseRef(bed.fileRef);
    if (parsed?.kind !== "stored" || !parsed.key.startsWith("print/")) {
      throw new TagError(`Bed ${bed.label}: upload the print file instead of typing a reference`, 400, "print_bed_file_invalid");
    }
  }
}

/**
 * A new version becomes the model's current one; the previous current is superseded (it stays linked to the
 * orders it printed). The model leaves `design_needed` for `ready`, unless it is retired.
 */
export async function createVersion(modelRef: string, input: PrintVersionInput, userId: string | null, source: PrintVersionSource): Promise<PrintModelVersionItem> {
  const model = await resolveModel(modelRef);
  checkBedFiles(input.beds);
  if (model.kind === "serialized" && input.beds.some((bed) => bed.fileRef)) {
    throw new TagError("A serialized model's print file is built per order (each piece has its own code)", 400, "print_bed_file_serialized");
  }
  const fixesBatchId = input.fixesBatch ? await resolveBatchId(input.fixesBatch) : null;
  const id = await db.transaction(async (tx) => {
    const [{ next }] = await rows<{ next: number }>(
      sql`SELECT coalesce(max(version), 0)::int + 1 AS next FROM print_model_versions WHERE model_id = ${model.id}`,
      tx,
    );
    if (Number(next) > 1 && !input.changelog) {
      throw new TagError("Say what changed from the previous version (changelog)", 400, "print_version_changelog_required");
    }
    await tx.update(printModelVersions).set({ status: "superseded" })
      .where(sql`${printModelVersions.modelId} = ${model.id} AND ${printModelVersions.status} = 'current'`);
    const [version] = await tx.insert(printModelVersions).values({
      modelId: model.id,
      version: Number(next),
      status: "current",
      builder: input.builder ?? null,
      params: input.params,
      recipe: input.recipe,
      beds: input.beds as Array<Record<string, unknown>>,
      consumes: input.consumes,
      changelog: input.changelog ?? null,
      fixesBatchId,
      source,
      createdByUserId: userId,
    }).returning({ id: printModelVersions.id });
    await tx.update(printModels).set({
      currentVersionId: version.id,
      status: model.status === "retired" ? "retired" : "ready",
      updatedAt: new Date(),
    }).where(eq(printModels.id, model.id));
    return version.id;
  });
  const [row] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${id}`);
  return versionItem(row);
}

// ─── Files ────────────────────────────────────────────────────────────────────

/** A file name the store accepts: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]/g, "").replace(/^[.]+/, "").slice(-120);
  return cleaned || "file";
}

/** The kind a file name suggests, for a bed's fixed file (a .gcode.3mf is sliced, a plain .3mf is the project). */
export function fileKindFor(name: string): PrintFileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".gcode.3mf")) return "gcode_3mf";
  if (lower.endsWith(".csv")) return "serial_map";
  if (lower.endsWith(".json")) return "report";
  if (lower.endsWith(".png")) return "preview";
  return "3mf";
}

async function storeFile(owner: string, filename: string, body: Uint8Array, kind: PrintFileKind) {
  if (!body.byteLength) throw new TagError("The file is empty", 400, "print_file_empty");
  if (body.byteLength > PRINT_FILE_MAX_BYTES) throw new TagError("The file is larger than 64 MB", 413, "print_file_too_large");
  const name = safeFileName(filename);
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  try {
    const ref = await putPrivateFile(`print/${owner}/${Date.now()}-${name}`, body, PRINT_FILE_CONTENT_TYPES[kind]);
    return { ref, name, sha256, bytes: body.byteLength };
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) throw new TagError("File storage is not configured", 503, "print_storage_unavailable");
    throw err;
  }
}

export async function signedFileUrl(ref: string): Promise<string> {
  const url = await resolveFileUrl(ref);
  if (!url) throw new TagError("File storage is not configured", 503, "print_storage_unavailable");
  return url;
}

export async function getJobFile(fileId: string) {
  if (!UUID.test(fileId)) throw new TagError("File not found", 404);
  const [file] = await db.select().from(printJobFiles).where(eq(printJobFiles.id, fileId)).limit(1);
  if (!file) throw new TagError("File not found", 404);
  return file;
}

/** A part's fixed print file, on one bed of a version no order has used yet. */
export async function attachBedFile(modelRef: string, versionId: string, bedLabel: string, filename: string, body: Uint8Array, userId: string | null): Promise<PrintModelVersionItem> {
  const model = await resolveModel(modelRef);
  if (model.kind !== "part") throw new TagError("Only a part keeps a fixed print file; a serialized model builds one per order", 400, "print_bed_file_serialized");
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  if (!version) throw new TagError("Version not found", 404);
  // Once an order took the file (ready and beyond), the file is part of what that order printed: a new file is a new version.
  const [{ used }] = await rows<{ used: number }>(sql`
    SELECT count(*)::int AS used FROM print_jobs WHERE version_id = ${versionId} AND status IN ('ready', 'printing', 'printed')`);
  if (Number(used) > 0) throw new TagError("Orders already used this version's file: make a new version for a new file", 409, "print_version_used");
  const beds = version.beds ?? [];
  const index = beds.findIndex((bed) => bed.label.toLowerCase() === bedLabel.toLowerCase());
  if (index < 0) throw new TagError("No bed with that label in this version", 404);
  const stored = await storeFile(versionId, filename, body, fileKindFor(filename));
  const updated = beds.map((bed, i) => (i === index ? { ...bed, fileRef: stored.ref, fileName: stored.name, fileBytes: stored.bytes, fileSha256: stored.sha256 } : bed));
  await db.update(printModelVersions).set({ beds: updated as Array<Record<string, unknown>> }).where(eq(printModelVersions.id, versionId));
  console.log(`[production] bed ${bedLabel} of ${model.slug} v${version.version}: file ${stored.name} (${stored.bytes} B, user ${userId ?? "?"})`);
  const [row] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId}`);
  return versionItem(row);
}

export async function bedFileRef(modelRef: string, versionId: string, bedLabel: string): Promise<string> {
  const model = await resolveModel(modelRef);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  const bed = version?.beds?.find((b) => b.label.toLowerCase() === bedLabel.toLowerCase());
  if (!bed?.fileRef) throw new TagError("This bed has no print file", 404);
  return bed.fileRef;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

interface JobRow {
  id: string; model_id: string; model_slug: string; model_title: string; model_kind: string; version_id: string;
  version_number: number; bed_label: string; plates: number; quantity: number; status: string; batch_id: string | null;
  batch_code: string | null; piece_count: number | null; received_count: number | null; device_name: string | null;
  notes: string | null; error_message: string | null; report: Record<string, unknown> | null; created_at: Date | string;
  built_at: Date | string | null; printed_at: Date | string | null; updated_at: Date | string; last_event_at: Date | string | null;
  send_requested_at: Date | string | null; send_claimed_at: Date | string | null; sent_at: Date | string | null;
}

const JOB_SELECT = sql`
  SELECT j.id, j.model_id, m.slug AS model_slug, m.title AS model_title, m.kind AS model_kind, j.version_id,
    v.version AS version_number, j.bed_label, j.plates, j.quantity, j.status, j.batch_id, b.batch_code,
    CASE WHEN j.batch_id IS NULL THEN NULL ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id) END AS piece_count,
    CASE WHEN j.batch_id IS NULL THEN NULL
      ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id AND t.stock_status <> 'pending') END AS received_count,
    d.device_name, j.notes, j.error_message, j.report, j.created_at, j.built_at, j.printed_at, j.updated_at, j.last_event_at,
    j.send_requested_at, j.send_claimed_at, j.sent_at
  FROM print_jobs j
  JOIN print_models m ON m.id = j.model_id
  JOIN print_model_versions v ON v.id = j.version_id
  LEFT JOIN tag_batches b ON b.id = j.batch_id
  LEFT JOIN tag_provisioning_devices d ON d.id = j.device_id`;

function jobItem(j: JobRow, now = Date.now()): PrintJobItem {
  const lastNews = j.last_event_at ?? j.updated_at;
  return {
    id: j.id,
    modelId: j.model_id,
    modelSlug: j.model_slug,
    modelTitle: j.model_title,
    modelKind: j.model_kind as PrintModelKind,
    versionId: j.version_id,
    version: Number(j.version_number),
    bedLabel: j.bed_label,
    plates: Number(j.plates),
    quantity: Number(j.quantity),
    status: j.status as PrintJobStatus,
    batchId: j.batch_id,
    batchCode: j.batch_code,
    receivedCount: j.received_count === null ? null : Number(j.received_count),
    pieceCount: j.piece_count === null ? null : Number(j.piece_count),
    deviceName: j.device_name,
    notes: j.notes,
    errorMessage: j.error_message,
    report: j.report ?? {},
    createdAt: iso(j.created_at)!,
    builtAt: iso(j.built_at),
    printedAt: iso(j.printed_at),
    updatedAt: iso(j.updated_at)!,
    stale: j.status === "building" && now - new Date(lastNews).getTime() > PRINT_JOB_STALE_MS,
    sendRequestedAt: iso(j.send_requested_at),
    sendClaimedAt: iso(j.send_claimed_at),
    sentAt: iso(j.sent_at),
  };
}

export type JobListFilter = "open" | "done" | "all" | PrintJobStatus;

export async function listJobs(filter: JobListFilter = "open", modelRef?: string | null): Promise<PrintJobItem[]> {
  const conds = [];
  if (filter === "open") conds.push(sql`j.status IN ('requested', 'building', 'ready', 'printing')`);
  else if (filter === "done") conds.push(sql`j.status IN ('printed', 'failed', 'cancelled')`);
  else if (filter !== "all") conds.push(sql`j.status = ${filter}`);
  if (modelRef) conds.push(sql`j.model_id = ${(await resolveModel(modelRef)).id}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  return (await rows<JobRow>(sql`${JOB_SELECT} ${where} ORDER BY j.created_at DESC LIMIT 200`)).map((j) => jobItem(j));
}

async function loadJob(id: string): Promise<PrintJobRow> {
  if (!UUID.test(id)) throw new TagError("Print order not found", 404, "print_job_not_found");
  const [job] = await db.select().from(printJobs).where(eq(printJobs.id, id)).limit(1);
  if (!job) throw new TagError("Print order not found", 404, "print_job_not_found");
  return job;
}

async function jobPieces(batchId: string, bed: PrintBed | null): Promise<PrintJobPiece[]> {
  const list = await rows<{ serial_number: number | null; public_code: string; stock_status: string }>(sql`
    SELECT serial_number, public_code, stock_status FROM tags WHERE batch_id = ${batchId} ORDER BY serial_number NULLS LAST, public_code`);
  const base = tagBaseUrl();
  return list.map((t) => {
    const urls = buildTagUrls(base, t.public_code);
    return {
      serialNumber: t.serial_number,
      publicCode: t.public_code,
      position: bedPosition(bed, t.serial_number),
      qrUrl: urls.qrUrl,
      nfcUrl: urls.nfcUrl,
      stockStatus: t.stock_status,
    };
  });
}

/** Where printed QR / programmed NFC URLs point (the same rule as routes.ts, which imports this module). */
function tagBaseUrl(): string {
  return (process.env.TAG_PUBLIC_BASE_URL?.trim() || TAG_DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

export async function getJob(id: string): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  const [row] = await rows<JobRow>(sql`${JOB_SELECT} WHERE j.id = ${job.id}`);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${job.versionId}`);
  const bed = version?.beds?.find((b) => b.label === job.bedLabel) ?? null;
  const files = await db.select().from(printJobFiles).where(eq(printJobFiles.jobId, job.id)).orderBy(printJobFiles.createdAt);
  return {
    ...jobItem(row),
    bed,
    builder: version?.builder ?? null,
    params: version?.params ?? {},
    recipe: version?.recipe ?? {},
    files: files.map(fileItem),
    pieces: job.batchId ? await jobPieces(job.batchId, bed) : [],
  };
}

function fileItem(f: typeof printJobFiles.$inferSelect): PrintJobFileItem {
  return { id: f.id, kind: f.kind as PrintFileKind, filename: f.filename, bytes: f.bytes, sha256: f.sha256, createdAt: f.createdAt.toISOString() };
}

async function currentVersionOf(model: PrintModelRow): Promise<VersionRow> {
  if (model.status === "retired") throw new TagError("This model is retired", 409, "print_model_retired");
  if (!model.currentVersionId) throw new TagError("This model has no design yet: its first version comes from the design work", 409, "print_model_design_needed");
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${model.currentVersionId}`);
  if (!version) throw new TagError("This model has no current version", 409, "print_model_design_needed");
  return version;
}

function pickBed(version: VersionRow, label: string | undefined): PrintBed {
  const beds = version.beds ?? [];
  const bed = label ? beds.find((b) => b.label.toLowerCase() === label.toLowerCase()) : beds[0];
  if (!bed) throw new TagError(label ? `No bed "${label}" in the current version` : "The current version has no bed layout", 400, "print_bed_not_found");
  return bed;
}

async function existingCodes(prefix: string, year: number): Promise<string[]> {
  return (await rows<{ batch_code: string }>(sql`SELECT batch_code FROM tag_batches WHERE batch_code LIKE ${`${prefix}-${year}-%`}`)).map((r) => r.batch_code);
}

/** The order behind a batch made before the catalog existed: its status follows what the batch already went through. */
async function linkExistingBatch(model: PrintModelRow, version: VersionRow, bed: PrintBed, input: PrintJobCreateInput, userId: string | null) {
  const batchId = await resolveBatchId(input.existingBatch!);
  const batch = (await getBatchProduction(batchId))?.batch;
  if (!batch) throw new TagError("Batch not found", 404, "batch_not_found");
  if (batch.status === "cancelled") throw new TagError("A cancelled batch cannot be linked", 409);
  if (batch.productType !== model.productType) {
    throw new TagError(`Batch ${batch.batchCode} is a ${batch.productType}, this model prints ${model.productType}`, 409, "print_batch_product_mismatch");
  }
  if (batch.printJobId) {
    const [linked] = await db.select({ status: printJobs.status }).from(printJobs).where(eq(printJobs.id, batch.printJobId)).limit(1);
    if (linked && !["failed", "cancelled"].includes(linked.status)) throw new TagError(`Batch ${batch.batchCode} already has a print order`, 409, "print_batch_linked");
  }
  if (!batch.tagCount) throw new TagError("This batch has no pieces", 409);
  const printed = ["printed", "receiving", "received"].includes(batch.stage);
  const [printedEntry] = printed
    ? await rows<{ occurred_at: Date | string }>(sql`
        SELECT occurred_at FROM tag_journey_entries WHERE batch_id = ${batchId} AND action = 'printed' AND status = 'active'
        ORDER BY occurred_at DESC LIMIT 1`)
    : [];
  return db.transaction(async (tx) => {
    const [job] = await tx.insert(printJobs).values({
      modelId: model.id,
      versionId: version.id,
      bedLabel: bed.label,
      plates: 1,
      quantity: batch.tagCount,
      batchId,
      status: printed ? "printed" : "requested",
      notes: input.notes ?? `Linked to ${batch.batchCode}, made before the catalog`,
      requestedByUserId: userId,
      printedAt: printed ? new Date(printedEntry?.occurred_at ?? Date.now()) : null,
    }).returning();
    await tx.update(tagBatches).set({ printJobId: job.id, updatedAt: new Date() }).where(eq(tagBatches.id, batchId));
    return job;
  });
}

export async function createJob(input: PrintJobCreateInput, userId: string | null, source: JourneySource = "admin"): Promise<PrintJobDetail> {
  const model = await resolveModel(input.model);
  const version = await currentVersionOf(model);
  const bed = pickBed(version, input.bed);

  if (model.kind === "part") {
    if (input.existingBatch) throw new TagError("A part has no batch", 400);
    const ready = Boolean(bed.fileRef);
    const job = await db.transaction(async (tx) => {
      const [job] = await tx.insert(printJobs).values({
        modelId: model.id,
        versionId: version.id,
        bedLabel: bed.label,
        plates: input.plates,
        quantity: bed.copies * input.plates,
        status: ready ? "ready" : "requested",
        notes: input.notes ?? null,
        requestedByUserId: userId,
        builtAt: ready ? new Date() : null,
      }).returning();
      if (ready) {
        const name = bed.fileName ?? "print.3mf";
        await tx.insert(printJobFiles).values({
          jobId: job.id,
          kind: fileKindFor(name),
          fileRef: bed.fileRef!,
          filename: name,
          bytes: bed.fileBytes ?? 0,
          sha256: bed.fileSha256 ?? "",
        });
      }
      return job;
    });
    return getJob(job.id);
  }

  if (input.existingBatch) return getJob((await linkExistingBatch(model, version, bed, input, userId)).id);

  if (!model.batchPrefix || !model.productType || !model.salesProductId) {
    throw new TagError("This model needs a product, a sales product and a batch prefix before printing", 409, "print_model_incomplete");
  }
  const quantity = bed.copies * input.plates;
  const year = new Date().getUTCFullYear();
  for (let attempt = 1; ; attempt++) {
    const batchCode = nextPrintBatchCode(model.batchPrefix, year, await existingCodes(model.batchPrefix, year));
    let jobId: string | null = null;
    try {
      await createBatch({
        name: `${model.title} · v${version.version} · ${bed.label}${input.plates > 1 ? ` × ${input.plates}` : ""}`,
        batchCode,
        productType: model.productType,
        salesProductId: model.salesProductId,
        face: model.face,
        vendor: "Skale Club",
        notes: input.notes ?? null,
        quantity,
      }, userId, source, async (tx: Tx, batch) => {
        const [job] = await tx.insert(printJobs).values({
          modelId: model.id,
          versionId: version.id,
          bedLabel: bed.label,
          plates: input.plates,
          quantity,
          batchId: batch.id,
          status: "requested",
          notes: input.notes ?? null,
          requestedByUserId: userId,
        }).returning({ id: printJobs.id });
        await tx.update(tagBatches).set({ printJobId: job.id }).where(eq(tagBatches.id, batch.id));
        jobId = job.id;
      });
    } catch (err) {
      if (err instanceof TagError && err.code === "batch_code_taken" && attempt < 3) continue;
      throw err;
    }
    console.log(`[production] order ${jobId} for ${model.slug} v${version.version}: ${quantity} pieces, batch ${batchCode} (user ${userId ?? "?"})`);
    return getJob(jobId!);
  }
}

/** Print a failed or cancelled order again: the same version and bed, and the same batch while none of its pieces was received. */
export async function redoJob(id: string, userId: string | null): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  if (job.status !== "failed" && job.status !== "cancelled") throw new TagError("Only a failed or cancelled order can be printed again", 409, "print_job_state");
  const [model] = await db.select().from(printModels).where(eq(printModels.id, job.modelId)).limit(1);
  if (model.status === "retired") throw new TagError("This model is retired", 409, "print_model_retired");
  const reuse = job.batchId
    ? Number((await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM tags WHERE batch_id = ${job.batchId} AND stock_status <> 'pending'`))[0]?.n ?? 0) === 0
    : false;
  if (model.kind === "serialized" && !reuse) {
    return createJob({ model: model.id, bed: job.bedLabel, plates: job.plates, notes: job.notes }, userId);
  }
  const created = await db.transaction(async (tx) => {
    const [next] = await tx.insert(printJobs).values({
      modelId: job.modelId,
      versionId: job.versionId,
      bedLabel: job.bedLabel,
      plates: job.plates,
      quantity: job.quantity,
      batchId: job.batchId,
      status: "requested",
      notes: job.notes,
      requestedByUserId: userId,
    }).returning();
    if (job.batchId) await tx.update(tagBatches).set({ printJobId: next.id, updatedAt: new Date() }).where(eq(tagBatches.id, job.batchId));
    return next;
  });
  if (model.kind === "part") {
    // A part's fixed file comes along again (the same one the version holds).
    const files = await db.select().from(printJobFiles).where(eq(printJobFiles.jobId, job.id));
    if (files.length) {
      await db.insert(printJobFiles).values(files.map(({ id: _id, createdAt: _c, ...f }) => ({ ...f, jobId: created.id })));
      await db.update(printJobs).set({ status: "ready", builtAt: new Date() }).where(eq(printJobs.id, created.id));
    }
  }
  return getJob(created.id);
}

export interface TransitionInput {
  action: PrintJobAction;
  reason?: string | null;
  userId: string | null;
  source?: JourneySource;
}

/**
 * Moves an order through its state machine (shared/printProduction.ts) with the side effects of each step:
 * `printed` records the batch's `printed` journey step (or adds a part's pieces to its count), `complete`
 * needs a print file, `fail` keeps the reason.
 */
export async function transitionJob(id: string, input: TransitionInput): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  const plan = planPrintJobTransition(job.status, input.action);
  if (!plan.ok) throw new TagError(plan.error, 409, plan.code);
  const now = new Date();
  if (input.action === "complete") {
    const files = await db.select({ kind: printJobFiles.kind }).from(printJobFiles).where(eq(printJobFiles.jobId, job.id));
    if (!files.some((f) => f.kind === "3mf" || f.kind === "gcode_3mf")) {
      throw new TagError("Attach the print file before marking the order ready", 409, "print_job_file_missing");
    }
  }
  const [model] = await db.select().from(printModels).where(eq(printModels.id, job.modelId)).limit(1);
  await db.transaction(async (tx) => {
    const updated = await tx.update(printJobs).set({
      status: plan.status,
      updatedAt: now,
      ...(input.action === "complete" ? { builtAt: now, errorCode: null, errorMessage: null } : {}),
      ...(input.action === "printed" ? { printedAt: now } : {}),
      ...(input.action === "fail" ? { errorCode: "failed", errorMessage: input.reason ?? null } : {}),
      ...(input.action === "release" ? { deviceId: null, claimedAt: null } : {}),
    }).where(sql`${printJobs.id} = ${job.id} AND ${printJobs.status} = ${job.status}`).returning({ id: printJobs.id });
    if (!updated.length) throw new TagError("The order changed meanwhile; reload it", 409, "print_job_state");
    if (input.action === "printed" && model.kind === "part") {
      await tx.insert(printPartMovements).values({ modelId: model.id, delta: job.quantity, reason: "printed", jobId: job.id, actorUserId: input.userId });
      await tx.update(printModels).set({ partOnHand: sql`${printModels.partOnHand} + ${job.quantity}`, updatedAt: now }).where(eq(printModels.id, model.id));
    }
  });
  if (job.batchId && (input.action === "printed" || input.action === "fail")) {
    const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
    await recordJourney(input.action === "printed" ? {
      kind: "execution",
      action: "printed",
      title: `Batch ${batch?.batchCode ?? ""} printed`.trim(),
      batchId: job.batchId,
      metadata: { printJobId: job.id, bed: job.bedLabel, plates: job.plates },
    } : {
      kind: "observation",
      action: "print_failed",
      title: `Print order for ${batch?.batchCode ?? "the batch"} failed`,
      content: input.reason ?? null,
      batchId: job.batchId,
      metadata: { printJobId: job.id },
    }, journeyContext(input.userId, input.source));
  }
  return getJob(job.id);
}

export async function attachJobFile(id: string, kind: PrintFileKind, filename: string, body: Uint8Array, opts: { deviceId?: string | null } = {}): Promise<PrintJobFileItem> {
  const job = await loadJob(id);
  if (opts.deviceId !== undefined && (job.deviceId !== opts.deviceId || job.status !== "building")) {
    throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
  }
  if (["printed", "cancelled"].includes(job.status)) throw new TagError(`A ${job.status} order takes no more files`, 409, "print_job_state");
  const stored = await storeFile(job.id, filename, body, kind);
  const [file] = await db.insert(printJobFiles).values({
    jobId: job.id,
    kind,
    fileRef: stored.ref,
    filename: stored.name,
    bytes: stored.bytes,
    sha256: stored.sha256,
  }).returning();
  await db.update(printJobs).set({ lastEventAt: new Date(), updatedAt: new Date() }).where(eq(printJobs.id, job.id));
  return fileItem(file);
}

// ─── Parts ────────────────────────────────────────────────────────────────────

export async function adjustPart(modelRef: string, delta: number, reason: PrintPartReason, note: string | null, userId: string | null): Promise<PrintModelDetail> {
  const model = await resolveModel(modelRef);
  if (model.kind !== "part") throw new TagError("Only a part has a count; a serialized model's stock is its pieces", 400, "print_model_not_part");
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(printModels)
      .set({ partOnHand: sql`${printModels.partOnHand} + ${delta}`, updatedAt: new Date() })
      .where(sql`${printModels.id} = ${model.id} AND ${printModels.partOnHand} + ${delta} >= 0`)
      .returning({ id: printModels.id });
    if (!updated) throw new TagError("The count cannot go below zero", 409, "print_part_negative");
    await tx.insert(printPartMovements).values({ modelId: model.id, delta, reason, note, actorUserId: userId });
  });
  return getModel(model.id);
}

// ─── The bench (paired device with the 'print' capability) ───────────────────

/** What `bench.py build` needs for one order. */
export async function jobTicket(id: string): Promise<PrintJobTicket> {
  const job = await loadJob(id);
  const [model] = await db.select().from(printModels).where(eq(printModels.id, job.modelId)).limit(1);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${job.versionId}`);
  const bed = version.beds?.find((b) => b.label === job.bedLabel);
  if (!bed) throw new TagError("The order's bed is missing from its version", 409);
  let batch: PrintJobTicket["batch"] = null;
  let tagRows: PrintJobTicket["tags"] = [];
  if (job.batchId) {
    const [b] = await db.select({ id: tagBatches.id, batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
    batch = b ?? null;
    tagRows = (await jobPieces(job.batchId, bed)).map((p) => ({
      serial_number: padSerial(p.serialNumber, job.quantity),
      public_code: p.publicCode,
      qr_url: p.qrUrl,
      nfc_url: p.nfcUrl,
      position: p.position,
    }));
  }
  return {
    job: { id: job.id, status: job.status as PrintJobStatus, plates: job.plates, quantity: job.quantity, notes: job.notes },
    model: { slug: model.slug, title: model.title, kind: model.kind as PrintModelKind, productType: model.productType, face: model.face, theme: model.theme },
    version: { id: version.id, version: Number(version.version), builder: version.builder, params: version.params ?? {}, recipe: version.recipe ?? {}, bed },
    batch,
    tags: tagRows,
  };
}

/**
 * The bench takes an order: a given one (`bench.py attach`, building by hand), or the oldest requested order whose
 * version has a builder (the bench building on its own). Null when there is nothing to do.
 */
export async function claimJob(deviceId: string, jobId?: string | null): Promise<PrintJobTicket | null> {
  const now = new Date();
  if (jobId) {
    const job = await loadJob(jobId);
    if (job.status === "building" && job.deviceId === deviceId) return jobTicket(job.id);
    const plan = planPrintJobTransition(job.status, "claim");
    if (!plan.ok) throw new TagError(plan.error, 409, plan.code);
    const claimed = await db.update(printJobs).set({ status: "building", deviceId, claimedAt: now, lastEventAt: now, updatedAt: now })
      .where(sql`${printJobs.id} = ${job.id} AND ${printJobs.status} = 'requested'`).returning({ id: printJobs.id });
    if (!claimed.length) throw new TagError("Another bench took this order", 409, "print_job_state");
    return jobTicket(job.id);
  }
  const [claimed] = await rows<{ id: string }>(sql`
    UPDATE print_jobs SET status = 'building', device_id = ${deviceId}, claimed_at = ${now}, last_event_at = ${now}, updated_at = ${now}
    WHERE id = (
      SELECT j.id FROM print_jobs j JOIN print_model_versions v ON v.id = j.version_id
      WHERE j.status = 'requested' AND v.builder IS NOT NULL
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    ) AND status = 'requested'
    RETURNING id`);
  return claimed ? jobTicket(claimed.id) : null;
}

/** The bench reports progress: keeps the order from looking stuck, and the last messages for the queue. */
export async function recordBenchEvent(deviceId: string, jobId: string, type: string, detail: Record<string, unknown> | null) {
  const job = await loadJob(jobId);
  if (job.deviceId !== deviceId || job.status !== "building") throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
  const log = Array.isArray(job.report?.log) ? (job.report.log as unknown[]) : [];
  const entry = { at: new Date().toISOString(), type, ...(detail ? { detail } : {}) };
  await db.update(printJobs).set({
    report: { ...(job.report ?? {}), log: [...log, entry].slice(-50) },
    lastEventAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(printJobs.id, job.id));
}

export interface BenchCompleteInput {
  outcome: "ready" | "failed";
  report?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** The bench is done: the file is attached and checked (`ready`, with the slice numbers), or the build failed. */
export async function completeFromBench(deviceId: string, jobId: string, input: BenchCompleteInput): Promise<PrintJobDetail> {
  const job = await loadJob(jobId);
  if (job.deviceId !== deviceId || job.status !== "building") throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
  const report = { ...(job.report ?? {}), ...(input.report ?? {}) };
  await db.update(printJobs).set({ report }).where(eq(printJobs.id, job.id));
  if (input.outcome === "failed") {
    await db.update(printJobs).set({
      status: "failed",
      errorCode: input.errorCode ?? "build_failed",
      errorMessage: input.errorMessage ?? null,
      updatedAt: new Date(),
    }).where(eq(printJobs.id, job.id));
    return getJob(job.id);
  }
  const detail = await transitionJob(job.id, { action: "complete", userId: null, source: "system" });
  if (job.batchId) {
    const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
    const numbers = Object.fromEntries(Object.entries(report).filter(([key]) => ["minutes", "swaps", "grams", "qr_check", "file", "slicer"].includes(key)));
    await recordJourney({
      kind: "execution",
      action: "sliced",
      title: `Batch ${batch?.batchCode ?? ""} built and sliced`.trim(),
      batchId: job.batchId,
      metadata: { printJobId: job.id, version: detail.version, bed: job.bedLabel, ...numbers },
    }, journeyContext(null, "system"));
  }
  return detail;
}


// ─── Send to printer (phase 3, docs/PRINT_EXECUTION_PLAN.md §7.3) ─────────────
// The admin's click is the confirmation before hardware moves; the bench on the printer's network does the sending
// (FTPS upload, MQTT start) with an access code that never leaves it, and reports back.

/** A bench that took a send and went quiet for this long gives it back to the queue. */
const SEND_CLAIM_TTL_MS = 15 * 60_000;

function latestSliced(files: Array<typeof printJobFiles.$inferSelect>) {
  return files.filter((f) => f.kind === "gcode_3mf").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

export async function requestSend(id: string, userId: string | null): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  if (job.status !== "ready") throw new TagError("Only an order ready to print can be sent to the printer", 409, "print_send_not_ready");
  if (job.sendRequestedAt && !job.sentAt) throw new TagError("This order is already on its way to the printer", 409, "print_send_pending");
  const files = await db.select().from(printJobFiles).where(eq(printJobFiles.jobId, job.id));
  if (!latestSliced(files)) throw new TagError("This order has no sliced file (.gcode.3mf) to send", 409, "print_send_no_gcode");
  await db.update(printJobs).set({
    sendRequestedAt: new Date(),
    sendRequestedByUserId: userId,
    sendClaimedAt: null,
    sendDeviceId: null,
    updatedAt: new Date(),
  }).where(eq(printJobs.id, job.id));
  return getJob(job.id);
}

export async function cancelSend(id: string): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  if (!job.sendRequestedAt || job.sentAt) throw new TagError("Nothing waiting to be sent", 409, "print_send_none");
  const fresh = job.sendClaimedAt && Date.now() - job.sendClaimedAt.getTime() < SEND_CLAIM_TTL_MS;
  if (fresh) throw new TagError("The bench is sending it right now", 409, "print_send_in_progress");
  await db.update(printJobs).set({ sendRequestedAt: null, sendRequestedByUserId: null, sendClaimedAt: null, sendDeviceId: null, updatedAt: new Date() })
    .where(eq(printJobs.id, job.id));
  return getJob(job.id);
}

/** The oldest send waiting for this bench (or given up by another one), with a signed link to its sliced file. */
export async function claimSend(deviceId: string): Promise<PrintSendTicket | null> {
  const now = new Date();
  const stale = new Date(now.getTime() - SEND_CLAIM_TTL_MS);
  const [claimed] = await rows<{ id: string }>(sql`
    UPDATE print_jobs SET send_claimed_at = ${now}, send_device_id = ${deviceId}, updated_at = ${now}
    WHERE id = (
      SELECT j.id FROM print_jobs j
      WHERE j.status = 'ready' AND j.send_requested_at IS NOT NULL AND j.sent_at IS NULL
        AND (j.send_claimed_at IS NULL OR j.send_claimed_at < ${stale})
      ORDER BY j.send_requested_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`);
  if (!claimed) return null;
  const job = await getJob(claimed.id);
  const files = await db.select().from(printJobFiles).where(eq(printJobFiles.jobId, job.id));
  const file = latestSliced(files);
  if (!file) throw new TagError("This order has no sliced file to send", 409, "print_send_no_gcode");
  // Project filament n (1-based, the AMS slot the recipe names) prints from tray n-1 of the AMS lite.
  const slots = (job.bed?.ams ?? []).map((a) => a.slot).sort((a, b) => a - b);
  const amsMapping = slots.length ? Array.from({ length: Math.max(...slots) }, (_, i) => i) : [0, 1, 2, 3];
  return {
    job: { id: job.id, quantity: job.quantity, batchCode: job.batchCode, modelTitle: job.modelTitle },
    file: { id: file.id, filename: file.filename, sha256: file.sha256, bytes: file.bytes, url: await signedFileUrl(file.fileRef) },
    amsMapping,
    subtaskName: (job.batchCode ? `${job.batchCode} ` : "") + job.modelTitle.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60),
  };
}

export interface SendResult {
  ok: boolean;
  error?: string | null;
  printer?: string | null;
}

/** The bench says how the send went: started (the order is `printing`) or refused (the request is cleared, with why). */
export async function sendResult(deviceId: string, id: string, input: SendResult): Promise<PrintJobDetail> {
  const job = await loadJob(id);
  if (job.sendDeviceId !== deviceId || !job.sendClaimedAt || job.sentAt) {
    throw new TagError("This bench is not sending that order", 409, "print_send_not_claimed");
  }
  const now = new Date();
  if (!input.ok) {
    await db.update(printJobs).set({
      sendRequestedAt: null,
      sendClaimedAt: null,
      sendDeviceId: null,
      report: { ...(job.report ?? {}), sendError: { at: now.toISOString(), message: input.error ?? "The printer refused the job" } },
      updatedAt: now,
    }).where(eq(printJobs.id, job.id));
    return getJob(job.id);
  }
  await db.update(printJobs).set({
    sentAt: now,
    report: { ...(job.report ?? {}), sendError: null, printer: input.printer ?? null },
    updatedAt: now,
  }).where(eq(printJobs.id, job.id));
  return transitionJob(job.id, { action: "start", userId: null, source: "system" });
}

export async function setPrinterStatus(deviceId: string, status: PrinterStatus): Promise<void> {
  await db.update(tagProvisioningDevices).set({ printerStatus: status as Record<string, unknown>, printerStatusAt: new Date() })
    .where(eq(tagProvisioningDevices.id, deviceId));
}

export async function listPrinters(): Promise<PrinterItem[]> {
  const list = await db.select().from(tagProvisioningDevices).where(eq(tagProvisioningDevices.status, "active"));
  const now = Date.now();
  return list
    .filter((d) => (d.capabilities ?? []).includes("print"))
    .map((d) => ({
      deviceId: d.id,
      deviceName: d.deviceName,
      status: (d.printerStatus as PrinterStatus | null) ?? null,
      statusAt: d.printerStatusAt ? d.printerStatusAt.toISOString() : null,
      stale: !d.printerStatusAt || now - d.printerStatusAt.getTime() > PRINTER_STATUS_STALE_MS,
    }));
}
