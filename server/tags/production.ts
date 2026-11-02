import crypto from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  organizations,
  printJobFiles,
  printJobs,
  printModelVersions,
  printModels,
  printPartMovements,
  printRequests,
  tagBatches,
  tagStockMovements,
  tags,
  type PrintJobRow,
  type PrintModelRow,
} from "#shared/schema.js";
import {
  PRINT_BOUGHT_BED,
  PRINT_FILE_CONTENT_TYPES,
  PRINT_FILE_MAX_BYTES,
  PRINT_JOB_STALE_MS,
  PRINT_MAX_PLATES,
  PRINT_NOW_PRINTED_DAYS,
  PRINT_PREVIEW_CONTENT_TYPE,
  PRINT_PREVIEW_MAX_BYTES,
  SERIALIZED_MODEL_FIELDS,
  bedPosition,
  modelReleased,
  nextPrintBatchCode,
  pickGenerateFace,
  planPrintJobTransition,
  planRedoCodes,
  printGenerateOptions,
  splitIntoPlates,
  splitPrintedPieces,
  type PrintBed,
  type PrintFileKind,
  type PrintGenerateInput,
  type PrintJobAction,
  type PrintJobCreateInput,
  type PrintJobDetail,
  type PrintJobFileItem,
  type PrintJobItem,
  type PrintJobPiece,
  type PrintJobStatus,
  type PrintJobTicket,
  type PrintMaterial,
  type PrintModelDetail,
  type PrintModelInput,
  type PrintModelItem,
  type PrintModelKind,
  type PrintModelPatch,
  type PrintModelStatus,
  type PrintModelVersionItem,
  type PrintNowPlate,
  type PrintPartReason,
  type PrintPreviewCatalog,
  type PrintPreviewInfo,
  type PrintRequestItem,
  type PrintVersionInput,
  type PrintVersionSource,
  type PrintVersionStatus,
} from "#shared/printProduction.js";
import { TAG_DEFAULT_PUBLIC_BASE_URL, buildTagUrls, padSerial } from "#shared/tags.js";
import type { JourneySource } from "#shared/tagJourney.js";
import { FileStorageUnavailableError, discardFiles, getPrivateFile, parseRef, putPrivateFile, resolveFileUrl } from "../lib/files.js";
import { TagError, pgError } from "./errors.js";
import { createJourneyEntry, journeyContext, recordJourney, resolveBatchId } from "./journey.js";
import { countMetricSql } from "./metrics.js";
import { createBatch, getBatchProduction, iso, rows, type BatchInTransaction, type Tx } from "./repository.js";
import { companyOrganizationId } from "../organizations/service.js";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): the catalog of what the house prints (models), the frozen
// recipes (versions), the print requests ("N pieces of this model") and their plates (print orders) with their files.
// Rules and types: shared/printProduction.ts. A serialized plate issues its batch through the same createBatch as
// Tags › Batches, in the same transaction; marking the plate printed puts its pieces in house stock (the ones that
// came out bad become damaged), so no scan is needed. The scan station of the batch stays as an optional QR check.
// Printing is by hand: the admin downloads a plate, prints it in Bambu Studio and marks it printed. Everything here
// is the global admin's, plus the paired bench app (a provisioner device with the 'print' capability), which builds
// the plates' files and mirrors them into its Print Now folder.
// Per organization (migrations/0065): a request, its plates, their batches and pieces belong to one organization:
// the company's for Boston, or a branch that prints its own pieces. The admin sees every one; a branch's Rep Admin
// and its bench only their own (ProductionScope). The catalog stays shared; parts and their counts stay the company's.
// A branch prints only the models the platform released to it (organizations.released_print_models, migrations/0069;
// null = every model): the catalog it is offered is filtered, and a request, a generate or a plate printed again for
// any other model is refused (print_model_not_released). Each model lists the materials a partner must buy.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whose production a call may touch (server/tags/access.ts requireProductionUser): null = every organization (an
 * admin), else these organizations only (a branch's Rep Admin, or a bench: its own). Out of scope reads as not found.
 */
export type ProductionScope = readonly number[] | null;

function scopeSql(column: string, scope: ProductionScope) {
  if (scope === null) return sql`TRUE`;
  if (!scope.length) return sql`FALSE`;
  return sql`${sql.raw(column)} IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})`;
}

const inScope = (organizationId: number, scope: ProductionScope) => scope === null || scope.includes(organizationId);

// ─── Rows → items ─────────────────────────────────────────────────────────────

interface VersionRow {
  id: string; model_id: string; version: number; status: string; builder: string | null;
  params: Record<string, unknown> | null; recipe: Record<string, unknown> | null; beds: PrintBed[] | null;
  consumes: Array<{ part: string; perPiece: number }> | null; changelog: string | null; fixes_batch_id: string | null;
  fixes_batch_code: string | null; source: string; created_at: Date | string; job_count: number;
  preview: StoredPreview | null;
}

/** What print_model_versions.preview holds: the file's ref stays on the server. */
interface StoredPreview extends PrintPreviewInfo {
  fileRef: string;
}

function previewInfo(stored: StoredPreview | null | undefined): PrintPreviewInfo | null {
  if (!stored?.fileRef) return null;
  return { fileName: stored.fileName, bytes: Number(stored.bytes), sha256: stored.sha256, uploadedAt: stored.uploadedAt };
}

const VERSION_SELECT = sql`
  SELECT v.id, v.model_id, v.version, v.status, v.builder, v.params, v.recipe, v.beds, v.consumes, v.preview, v.changelog,
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
    preview: previewInfo(v.preview),
  };
}

interface ModelRow {
  id: string; slug: string; kind: string; title: string; description: string | null; product_type: string | null;
  face: string | null; theme: string | null; sales_product_id: number | null; batch_prefix: string | null; status: string;
  current_version_id: string | null; part_on_hand: number; part_reorder_at: number | null; sort_order: number; materials: PrintMaterial[] | null;
  created_at: Date | string; updated_at: Date | string;
  open_jobs: number; house_count: number; with_resellers_count: number;
}

// A serialized model's stock: the pieces of the batches its orders issued, counted like the rest of Tags (within the
// scope: a branch counts its own plates and pieces).
const modelSelect = (scope: ProductionScope) => sql`
  SELECT m.id, m.slug, m.kind, m.title, m.description, m.product_type, m.face, m.theme, m.sales_product_id, m.batch_prefix,
    m.status, m.current_version_id, m.part_on_hand, m.part_reorder_at, m.sort_order, m.materials, m.created_at, m.updated_at,
    (SELECT count(*)::int FROM print_jobs j WHERE j.model_id = m.id
      AND j.status IN ('requested', 'building', 'ready', 'printing') AND ${scopeSql("j.organization_id", scope)}) AS open_jobs,
    (SELECT ${countMetricSql("house")} FROM tags t JOIN tag_batches b ON b.id = t.batch_id
      JOIN print_jobs j ON j.id = b.print_job_id WHERE j.model_id = m.id AND ${scopeSql("j.organization_id", scope)}) AS house_count,
    (SELECT ${countMetricSql("withResellers")} FROM tags t JOIN tag_batches b ON b.id = t.batch_id
      JOIN print_jobs j ON j.id = b.print_job_id WHERE j.model_id = m.id AND ${scopeSql("j.organization_id", scope)}) AS with_resellers_count
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
    materials: m.materials ?? [],
    currentVersion: current,
    onHand: kind === "part" ? Number(m.part_on_hand) : Number(m.house_count),
    withResellers: kind === "part" ? 0 : Number(m.with_resellers_count),
    openJobs: Number(m.open_jobs),
    partReorderAt: m.part_reorder_at === null ? null : Number(m.part_reorder_at),
    lowStock: kind === "part" && m.part_reorder_at !== null && Number(m.part_on_hand) < Number(m.part_reorder_at),
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

/** The models each of these organizations may print (organizations.released_print_models): null = every model. */
async function releasedModels(organizationIds: readonly number[]): Promise<Array<string[] | null>> {
  if (!organizationIds.length) return [];
  const list = await db.select({ released: organizations.releasedPrintModels }).from(organizations)
    .where(inArray(organizations.id, [...organizationIds]));
  return list.map((row) => row.released);
}

/** Of a scope's models, the ones released to at least one of its organizations (an admin's scope: all). */
async function releasedWithin<T extends { slug: string }>(models: T[], scope: ProductionScope): Promise<T[]> {
  if (scope === null) return models;
  const released = await releasedModels(scope);
  return models.filter((model) => released.some((list) => modelReleased(list, model.slug)));
}

async function catalogOf(scope: ProductionScope): Promise<PrintModelItem[]> {
  const where = scope === null ? sql`` : sql`WHERE m.kind = 'serialized'`;
  const list = await rows<ModelRow>(sql`${modelSelect(scope)} ${where} ORDER BY m.sort_order, m.title`);
  const versions = await currentVersions(list.map((m) => m.current_version_id).filter((id): id is string => Boolean(id)));
  return list.map((m) => modelItem(m, m.current_version_id ? versions.get(m.current_version_id) ?? null : null));
}

/**
 * The catalog. A branch (a scope) prints serialized pieces only (parts and their counts are the company's) and only
 * the ones the platform released to it: that is what the board, Generate and the Print dialog offer.
 */
export async function listModels(scope: ProductionScope = null): Promise<PrintModelItem[]> {
  return releasedWithin(await catalogOf(scope), scope);
}

/** A non-admin may print a model only if the platform released it to the organization it prints for. */
async function assertReleased(organizationId: number, model: Pick<PrintModelRow, "slug" | "title">, scope: ProductionScope) {
  if (scope === null) return;
  const [released] = await releasedModels([organizationId]);
  if (!modelReleased(released, model.slug)) {
    throw new TagError(`${model.title} is not released to this organization`, 403, "print_model_not_released", { model: model.title });
  }
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

export async function getModel(ref: string, scope: ProductionScope = null): Promise<PrintModelDetail> {
  const model = await resolveModel(ref);
  if (scope !== null && (model.kind === "part" || !(await releasedWithin([model], scope)).length)) {
    throw new TagError("No print model with that id or slug", 404, "print_model_not_found");
  }
  const [row] = await rows<ModelRow>(sql`${modelSelect(scope)} WHERE m.id = ${model.id}`);
  const versions = (await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.model_id = ${model.id} ORDER BY v.version DESC`)).map(versionItem);
  const movements = scope !== null ? [] : await db
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
  // The v1 is checked before anything is written, and the model and its v1 go in together: a refused version never
  // leaves a model behind whose slug is then taken.
  const fixesBatchId = input.version ? await checkVersion(input.kind, input.version) : null;
  try {
    const id = await db.transaction(async (tx) => {
      const [model] = await tx.insert(printModels).values({
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
        materials: input.materials ?? [],
        createdByUserId: userId,
      }).returning();
      if (input.version) await writeVersion(tx, model, input.version, fixesBatchId, userId, source);
      return model.id;
    });
    return getModel(id);
  } catch (err) {
    if (pgError(err).code === "23505" && pgError(err).constraint === "print_models_slug_unique") {
      throw new TagError(`A print model with slug ${input.slug} already exists`, 409, "print_model_slug_taken");
    }
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
    productType: serialized && patch.productType !== undefined ? patch.productType : model.productType,
    face: serialized && patch.face !== undefined ? patch.face : model.face,
    salesProductId: serialized && patch.salesProductId !== undefined ? patch.salesProductId : model.salesProductId,
    batchPrefix: serialized && patch.batchPrefix !== undefined ? patch.batchPrefix : model.batchPrefix,
    sortOrder: patch.sortOrder ?? model.sortOrder,
    materials: patch.materials ?? model.materials,
    partReorderAt: model.kind === "part" && patch.partReorderAt !== undefined ? patch.partReorderAt : model.partReorderAt,
  };
  if (serialized) {
    // The same fields the model is created with (and canGenerateModel needs): an edit never empties one. The sales
    // product and batch prefix were always required; product, face and colour are checked when the patch touches
    // them, so a model saved before they were required can still be retired, restored or reordered as it is.
    const checked = SERIALIZED_MODEL_FIELDS.filter((key) => key === "salesProductId" || key === "batchPrefix" || patch[key] !== undefined);
    const missing = checked.filter((key) => next[key] === null || next[key] === undefined || next[key] === "");
    if (missing.length) {
      throw new TagError("A serialized model needs a product type, a face, a colour, a sales product and a batch prefix", 400,
        "print_model_incomplete", { missing: missing.join(", ") });
    }
    // The batches printed from the model keep the product and face they were made with: changing them afterwards
    // would show those pieces as something else (the piece pictures find a batch's model by its plates). Filling in
    // one that was never set is a completion, not a change.
    if ((model.productType && next.productType !== model.productType) || (model.face && next.face !== model.face)) {
      const [{ used }] = await rows<{ used: number }>(sql`SELECT count(*)::int AS used FROM print_jobs WHERE model_id = ${model.id}`);
      if (Number(used) > 0) {
        throw new TagError("Plates were already ordered from this model: its product and face stay what they printed (make a new model)", 409, "print_model_used");
      }
    }
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

/** What a version is checked for before anything is written: its bed files and the batch it fixes (its id). */
async function checkVersion(kind: string, input: PrintVersionInput): Promise<string | null> {
  checkBedFiles(input.beds);
  if (kind === "serialized" && input.beds.some((bed) => bed.fileRef)) {
    throw new TagError("A serialized model's print file is built per order (each piece has its own code)", 400, "print_bed_file_serialized");
  }
  return input.fixesBatch ? resolveBatchId(input.fixesBatch) : null;
}

/** Writes the next version as the model's current one, in the caller's transaction. Returns its id. */
async function writeVersion(
  tx: Tx,
  model: Pick<PrintModelRow, "id" | "status">,
  input: PrintVersionInput,
  fixesBatchId: string | null,
  userId: string | null,
  source: PrintVersionSource,
): Promise<string> {
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
}

/**
 * A new version becomes the model's current one; the previous current is superseded (it stays linked to the
 * orders it printed). The model leaves `design_needed` for `ready`, unless it is retired.
 */
export async function createVersion(modelRef: string, input: PrintVersionInput, userId: string | null, source: PrintVersionSource): Promise<PrintModelVersionItem> {
  const model = await resolveModel(modelRef);
  const fixesBatchId = await checkVersion(model.kind, input);
  let id: string;
  try {
    id = await db.transaction((tx) => writeVersion(tx, model, input, fixesBatchId, userId, source));
  } catch (err) {
    // Two versions saved at once: the second one meets the unique number (or the one current version) of the first.
    if (pgError(err).code === "23505" && /^print_model_versions_/.test(pgError(err).constraint ?? "")) {
      throw new TagError("Another version of this model was saved at the same time: reload it and try again", 409, "print_version_conflict");
    }
    throw err;
  }
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

async function storeFile(owner: string, filename: string, body: Uint8Array, contentType: string) {
  if (!body.byteLength) throw new TagError("The file is empty", 400, "print_file_empty");
  if (body.byteLength > PRINT_FILE_MAX_BYTES) throw new TagError("The file is larger than 64 MB", 413, "print_file_too_large");
  const name = safeFileName(filename);
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  try {
    const ref = await putPrivateFile(`print/${owner}/${Date.now()}-${name}`, body, contentType);
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

export async function getJobFile(fileId: string, scope: ProductionScope) {
  if (!UUID.test(fileId)) throw new TagError("File not found", 404);
  const [found] = await db.select({ file: printJobFiles, organizationId: printJobs.organizationId }).from(printJobFiles)
    .innerJoin(printJobs, eq(printJobs.id, printJobFiles.jobId))
    .where(eq(printJobFiles.id, fileId)).limit(1);
  if (!found || !inScope(found.organizationId, scope)) throw new TagError("File not found", 404);
  return found.file;
}

/** A part's fixed print file, on one bed of a version no order has used yet. */
export async function attachBedFile(modelRef: string, versionId: string, bedLabel: string, filename: string, body: Uint8Array, userId: string | null): Promise<PrintModelVersionItem> {
  const model = await resolveModel(modelRef);
  if (model.kind !== "part") throw new TagError("Only a part keeps a fixed print file; a serialized model builds one per order", 400, "print_bed_file_serialized");
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  if (!version) throw new TagError("Version not found", 404);
  const beds = version.beds ?? [];
  const index = beds.findIndex((bed) => bed.label.toLowerCase() === bedLabel.toLowerCase());
  if (index < 0) throw new TagError("No bed with that label in this version", 404);
  // Once a plate took the file (whatever became of that plate: printed, failed or cancelled, it can be printed again
  // with it), the file is part of what that plate printed: a new file is a new version.
  const taken = () => new TagError("Plates already took this bed's file: make a new version for a new file", 409, "print_version_used");
  if (beds[index].fileRef && await fileTakenByPlate(beds[index].fileRef!)) throw taken();
  const stored = await storeFile(versionId, filename, body, PRINT_FILE_CONTENT_TYPES[fileKindFor(filename)]);
  // Checked again and written under the version's lock: a plate being created takes the same lock (createPartPlate),
  // so it either copies the old file before this runs (and the old file stays) or the new file after it.
  let previous: string | null;
  try {
    previous = await db.transaction(async (tx) => {
      const [locked] = await rows<{ beds: PrintBed[] | null }>(sql`SELECT beds FROM print_model_versions WHERE id = ${versionId} FOR UPDATE`, tx);
      const current = locked?.beds ?? [];
      const at = current.findIndex((bed) => bed.label.toLowerCase() === bedLabel.toLowerCase());
      if (at < 0) throw new TagError("No bed with that label in this version", 404);
      const old = current[at].fileRef ?? null;
      if (old && await fileTakenByPlate(old, tx)) throw taken();
      const updated = current.map((bed, i) => (i === at ? { ...bed, fileRef: stored.ref, fileName: stored.name, fileBytes: stored.bytes, fileSha256: stored.sha256 } : bed));
      await tx.update(printModelVersions).set({ beds: updated as Array<Record<string, unknown>> }).where(eq(printModelVersions.id, versionId));
      return old;
    });
  } catch (err) {
    await discardFiles([stored.ref], `refused print file of ${model.slug} v${version.version} bed ${bedLabel}`);
    throw err;
  }
  // The replaced file is dropped, like a replaced preview, unless another version's bed still points at it.
  if (previous && previous !== stored.ref && !(await fileInUse(previous))) {
    await discardFiles([previous], `print file of ${model.slug} v${version.version} bed ${bedLabel}`);
  }
  console.log(`[production] bed ${bedLabel} of ${model.slug} v${version.version}: file ${stored.name} (${stored.bytes} B, user ${userId ?? "?"})`);
  const [row] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId}`);
  return versionItem(row);
}

/** Whether a plate took this stored print file (its copy of the bed's file). */
async function fileTakenByPlate(ref: string, executor: typeof db | Tx = db): Promise<boolean> {
  const [{ n }] = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM print_job_files WHERE file_ref = ${ref}`, executor);
  return Number(n) > 0;
}

/** Whether a stored print file is still referenced: by a plate's files, or by a bed of any version. */
async function fileInUse(ref: string): Promise<boolean> {
  const [{ n }] = await rows<{ n: number }>(sql`
    SELECT (SELECT count(*) FROM print_job_files WHERE file_ref = ${ref})
      + (SELECT count(*) FROM print_model_versions WHERE beds @> ${JSON.stringify([{ fileRef: ref }])}::jsonb) AS n`);
  return Number(n) > 0;
}

export async function bedFileRef(modelRef: string, versionId: string, bedLabel: string): Promise<string> {
  const model = await resolveModel(modelRef);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  const bed = version?.beds?.find((b) => b.label.toLowerCase() === bedLabel.toLowerCase());
  if (!bed?.fileRef) throw new TagError("This bed has no print file", 404);
  return bed.fileRef;
}

/**
 * An always-ready piece's print file (a part's fixed file on its current version): the named bed, or the first one
 * that has a file. Nothing is recorded: the piece is printed by hand as often as needed.
 */
export async function partFileRef(modelRef: string, bedLabel?: string | null): Promise<string> {
  const model = await resolveModel(modelRef);
  if (model.kind !== "part") throw new TagError("Only a part has a ready print file; a serialized model is generated per order", 400, "print_bed_file_serialized");
  const version = await currentVersionOf(model);
  const beds = (version.beds ?? []).filter((b) => b.label.toLowerCase() !== PRINT_BOUGHT_BED);
  const bed = bedLabel ? beds.find((b) => b.label.toLowerCase() === bedLabel.toLowerCase()) : beds.find((b) => b.fileRef);
  if (!bed?.fileRef) throw new TagError("This piece has no print file yet", 404, "print_bed_file_missing");
  return bed.fileRef;
}

/** A binary glTF starts with the magic "glTF" and version 2. */
export function isGlb(body: Uint8Array): boolean {
  return body.byteLength >= 12 && body[0] === 0x67 && body[1] === 0x6c && body[2] === 0x54 && body[3] === 0x46 && body[4] === 2;
}

/**
 * A version's 3D preview (print-pipeline/preview.py: one sample piece, coloured by its AMS slots). Unlike a bed's
 * print file it is not part of what an order printed, so it can be replaced at any time; the old file is dropped.
 */
export async function attachVersionPreview(modelRef: string, versionId: string, filename: string, body: Uint8Array, userId: string | null): Promise<PrintModelVersionItem> {
  const model = await resolveModel(modelRef);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  if (!version) throw new TagError("Version not found", 404);
  if (!isGlb(body)) throw new TagError("The preview must be a binary glTF (.glb)", 400, "print_preview_not_glb");
  if (body.byteLength > PRINT_PREVIEW_MAX_BYTES) throw new TagError("The preview is larger than 16 MB", 413, "print_preview_too_large");
  const stored = await storeFile(versionId, filename.toLowerCase().endsWith(".glb") ? filename : `${filename}.glb`, body, PRINT_PREVIEW_CONTENT_TYPE);
  const preview: StoredPreview = { fileRef: stored.ref, fileName: stored.name, bytes: stored.bytes, sha256: stored.sha256, uploadedAt: new Date().toISOString() };
  await db.update(printModelVersions).set({ preview: preview as unknown as Record<string, unknown> }).where(eq(printModelVersions.id, versionId));
  if (version.preview?.fileRef) await discardFiles([version.preview.fileRef], `print preview of ${model.slug} v${version.version}`);
  console.log(`[production] preview of ${model.slug} v${version.version}: ${stored.name} (${stored.bytes} B, user ${userId ?? "?"})`);
  const [row] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId}`);
  return versionItem(row);
}

/** The preview's bytes, for the server to stream (the browser never fetches the storage bucket itself). */
export async function versionPreview(modelRef: string, versionId: string, scope: ProductionScope = null): Promise<{ body: Uint8Array; sha256: string }> {
  if (!UUID.test(versionId)) throw new TagError("Version not found", 404);
  const model = await resolveModel(modelRef);
  // As getModel: a branch prints serialized pieces only, so parts (and their previews) are not there for it.
  if (scope !== null && model.kind === "part") throw new TagError("No print model with that id or slug", 404, "print_model_not_found");
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${versionId} AND v.model_id = ${model.id}`);
  if (!version?.preview?.fileRef) throw new TagError("This version has no 3D preview", 404, "print_preview_missing");
  try {
    return { body: await getPrivateFile(version.preview.fileRef), sha256: version.preview.sha256 };
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) throw new TagError("File storage is not configured", 503, "print_storage_unavailable");
    throw err;
  }
}

/** The models that have a 3D preview and the batches printed from them: what the piece pictures look up (any rep). */
export async function previewCatalog(): Promise<PrintPreviewCatalog> {
  const models = await rows<{ id: string; slug: string; title: string; product_type: string | null; face: string | null; theme: string | null; sha256: string }>(sql`
    SELECT m.id, m.slug, m.title, m.product_type, m.face, m.theme, v.preview->>'sha256' AS sha256
    FROM print_models m
    JOIN print_model_versions v ON v.id = m.current_version_id
    WHERE m.kind = 'serialized' AND v.preview->>'fileRef' IS NOT NULL
    ORDER BY m.sort_order, m.title`);
  if (!models.length) return { models: [], batches: {} };
  const batches = await rows<{ batch_code: string; slug: string }>(sql`
    SELECT DISTINCT b.batch_code, m.slug
    FROM tag_batches b
    JOIN print_jobs j ON j.id = b.print_job_id OR j.batch_id = b.id
    JOIN print_models m ON m.id = j.model_id
    WHERE m.id IN (${sql.join(models.map((m) => sql`${m.id}::uuid`), sql`, `)})`);
  return {
    models: models.map((m) => ({ slug: m.slug, title: m.title, productType: m.product_type, face: m.face, theme: m.theme, sha256: m.sha256 })),
    batches: Object.fromEntries(batches.map((b) => [b.batch_code, b.slug])),
  };
}

/** A model's current version's preview, for the server to stream (see versionPreview). */
export async function currentPreview(modelRef: string): Promise<{ body: Uint8Array; sha256: string }> {
  const model = await resolveModel(modelRef);
  if (!model.currentVersionId) throw new TagError("This model has no 3D preview", 404, "print_preview_missing");
  return versionPreview(model.id, model.currentVersionId);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

interface JobRow {
  id: string; model_id: string; model_slug: string; model_title: string; model_kind: string; version_id: string;
  version_number: number; bed_label: string; plates: number; quantity: number; status: string; batch_id: string | null;
  batch_code: string | null; piece_count: number | null; received_count: number | null; pending_count: number | null; damaged_count: number | null; device_name: string | null;
  notes: string | null; error_code: string | null; error_message: string | null; report: Record<string, unknown> | null; created_at: Date | string;
  built_at: Date | string | null; printed_at: Date | string | null; updated_at: Date | string; last_event_at: Date | string | null;
  request_id: string | null; plate_number: number; plate_count: number; request_quantity: number;
  request_created_at: Date | string; downloads: Array<{ id: string; kind: string; filename: string }> | null;
  organization_id: number; organization_name: string; redone_by: string | null;
  reprinted_by: { id: string; batchCode: string | null } | null; replaces: { id: string; batchCode: string | null } | null;
}

/** The attempt that took a plate's place: a later plate of the same request with the same number (redoJob). */
const REDONE_BY = sql`
  SELECT j3.id FROM print_jobs j3
  WHERE j.request_id IS NOT NULL AND j3.request_id = j.request_id AND COALESCE(j3.plate_number, 1) = COALESCE(j.plate_number, 1)
    AND j3.id <> j.id AND j3.created_at > j.created_at
  ORDER BY j3.created_at LIMIT 1`;

/** The live plate (not cancelled) of a request that replaces this printed plate's damaged pieces (reprintDamaged). */
const REPRINTED_BY = sql`
  SELECT json_build_object('id', j4.id, 'batchCode', b4.batch_code)
  FROM print_requests r4 JOIN print_jobs j4 ON j4.request_id = r4.id LEFT JOIN tag_batches b4 ON b4.id = j4.batch_id
  WHERE r4.replaces_job_id = j.id AND j4.status <> 'cancelled'
  ORDER BY r4.created_at, j4.plate_number LIMIT 1`;

const JOB_SELECT = sql`
  SELECT j.id, j.model_id, m.slug AS model_slug, m.title AS model_title, m.kind AS model_kind, j.version_id,
    v.version AS version_number, j.bed_label, j.plates, j.quantity, j.status, j.batch_id, b.batch_code,
    CASE WHEN j.batch_id IS NULL THEN NULL ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id) END AS piece_count,
    CASE WHEN j.batch_id IS NULL THEN NULL
      ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id AND t.stock_status NOT IN ('pending', 'damaged')) END AS received_count,
    CASE WHEN j.batch_id IS NULL THEN NULL
      ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id AND t.stock_status = 'pending') END AS pending_count,
    CASE WHEN j.batch_id IS NULL THEN NULL
      ELSE (SELECT count(*)::int FROM tags t WHERE t.batch_id = j.batch_id AND t.stock_status = 'damaged') END AS damaged_count,
    d.device_name, j.notes, j.error_code, j.error_message, j.report, j.created_at, j.built_at, j.printed_at, j.updated_at, j.last_event_at,
    j.request_id, COALESCE(j.plate_number, 1) AS plate_number,
    CASE WHEN j.request_id IS NULL THEN 1
      ELSE (SELECT count(DISTINCT COALESCE(j2.plate_number, 1))::int FROM print_jobs j2 WHERE j2.request_id = j.request_id) END AS plate_count,
    COALESCE(r.quantity, j.quantity) AS request_quantity, COALESCE(r.created_at, j.created_at) AS request_created_at,
    (SELECT json_agg(json_build_object('id', f.id, 'kind', f.kind, 'filename', f.filename) ORDER BY f.created_at DESC)
      FROM print_job_files f WHERE f.job_id = j.id AND f.kind IN ('3mf', 'gcode_3mf')) AS downloads,
    j.organization_id, o.name AS organization_name,
    (${REDONE_BY}) AS redone_by,
    (${REPRINTED_BY}) AS reprinted_by,
    (SELECT json_build_object('id', rj.id, 'batchCode', rb.batch_code)
      FROM print_jobs rj LEFT JOIN tag_batches rb ON rb.id = rj.batch_id WHERE rj.id = r.replaces_job_id) AS replaces
  FROM print_jobs j
  JOIN organizations o ON o.id = j.organization_id
  JOIN print_models m ON m.id = j.model_id
  JOIN print_model_versions v ON v.id = j.version_id
  LEFT JOIN print_requests r ON r.id = j.request_id
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
    pendingCount: j.pending_count === null ? null : Number(j.pending_count),
    pieceCount: j.piece_count === null ? null : Number(j.piece_count),
    damagedCount: j.damaged_count === null ? null : Number(j.damaged_count),
    deviceName: j.device_name,
    notes: j.notes,
    errorCode: j.error_code,
    errorMessage: j.error_message,
    report: j.report ?? {},
    createdAt: iso(j.created_at)!,
    builtAt: iso(j.built_at),
    printedAt: iso(j.printed_at),
    updatedAt: iso(j.updated_at)!,
    stale: j.status === "building" && now - new Date(lastNews).getTime() > PRINT_JOB_STALE_MS,
    redoneBy: j.redone_by,
    reprintedBy: j.reprinted_by,
    replaces: j.replaces,
    requestId: j.request_id,
    plateNumber: Number(j.plate_number),
    plateCount: Number(j.plate_count),
    requestQuantity: Number(j.request_quantity),
    downloads: (j.downloads ?? []).map((f) => ({ id: f.id, kind: f.kind as PrintFileKind, filename: f.filename })),
    organizationId: Number(j.organization_id),
    organizationName: j.organization_name,
  };
}

export type JobListFilter = "open" | "done" | "all" | PrintJobStatus;

export async function listJobs(filter: JobListFilter, modelRef: string | null, scope: ProductionScope): Promise<PrintJobItem[]> {
  const conds = [scopeSql("j.organization_id", scope)];
  if (filter === "open") conds.push(sql`j.status IN ('requested', 'building', 'ready', 'printing')`);
  else if (filter === "done") conds.push(sql`j.status IN ('printed', 'failed', 'cancelled')`);
  else if (filter !== "all") conds.push(sql`j.status = ${filter}`);
  if (modelRef) conds.push(sql`j.model_id = ${(await resolveModel(modelRef)).id}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  return (await rows<JobRow>(sql`${JOB_SELECT} ${where} ORDER BY j.created_at DESC, j.plate_number LIMIT 200`)).map((j) => jobItem(j));
}

// ─── Requests ─────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string; model_id: string; model_slug: string; model_title: string; model_kind: string; version_number: number;
  bed_label: string; quantity: number; notes: string | null; created_at: Date | string; open: boolean;
  organization_id: number; organization_name: string;
}

// A plate is open until it is printed: marking it printed also puts its pieces in stock, so nothing is left to do.
// Applied before LIMIT so older open requests are not hidden behind a page of newer completed ones.
const OPEN_PLATE = sql`j.status IN ('requested', 'building', 'ready', 'printing')`;

const REQUEST_SELECT = sql`
  SELECT r.id, r.model_id, m.slug AS model_slug, m.title AS model_title, m.kind AS model_kind, v.version AS version_number,
    r.bed_label, r.quantity, r.notes, r.created_at,
    EXISTS (SELECT 1 FROM print_jobs j WHERE j.request_id = r.id AND ${OPEN_PLATE}) AS open,
    r.organization_id, o.name AS organization_name
  FROM print_requests r
  JOIN organizations o ON o.id = r.organization_id
  JOIN print_models m ON m.id = r.model_id
  JOIN print_model_versions v ON v.id = r.version_id`;

async function withPlates(list: RequestRow[]): Promise<PrintRequestItem[]> {
  if (!list.length) return [];
  const ids = sql.join(list.map((r) => sql`${r.id}`), sql`, `);
  const plates = (await rows<JobRow>(sql`${JOB_SELECT} WHERE j.request_id IN (${ids}) ORDER BY j.plate_number, j.created_at`)).map((j) => jobItem(j));
  return list.map((r) => ({
    id: r.id,
    modelId: r.model_id,
    modelSlug: r.model_slug,
    modelTitle: r.model_title,
    modelKind: r.model_kind as PrintModelKind,
    version: Number(r.version_number),
    bedLabel: r.bed_label,
    quantity: Number(r.quantity),
    notes: r.notes,
    createdAt: iso(r.created_at)!,
    open: Boolean(r.open),
    plates: plates.filter((p) => p.requestId === r.id),
    organizationId: Number(r.organization_id),
    organizationName: r.organization_name,
  }));
}

/** The requests, newest first, each with its plates: open (some plate still to build or print), done, or all. */
export async function listRequests(filter: "open" | "done" | "all", modelRef: string | null, scope: ProductionScope): Promise<PrintRequestItem[]> {
  const conds = [scopeSql("r.organization_id", scope)];
  if (filter === "open") conds.push(sql`EXISTS (SELECT 1 FROM print_jobs j WHERE j.request_id = r.id AND ${OPEN_PLATE})`);
  else if (filter === "done") conds.push(sql`NOT EXISTS (SELECT 1 FROM print_jobs j WHERE j.request_id = r.id AND ${OPEN_PLATE})`);
  if (modelRef) conds.push(sql`r.model_id = ${(await resolveModel(modelRef)).id}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  return withPlates(await rows<RequestRow>(sql`${REQUEST_SELECT} ${where} ORDER BY r.created_at DESC LIMIT 100`));
}

export async function getRequest(id: string, scope: ProductionScope): Promise<PrintRequestItem> {
  if (!UUID.test(id)) throw new TagError("Print request not found", 404, "print_request_not_found");
  const [request] = await withPlates(await rows<RequestRow>(sql`${REQUEST_SELECT} WHERE r.id = ${id} AND ${scopeSql("r.organization_id", scope)}`));
  if (!request) throw new TagError("Print request not found", 404, "print_request_not_found");
  return request;
}

async function loadJob(id: string, scope: ProductionScope): Promise<PrintJobRow> {
  if (!UUID.test(id)) throw new TagError("Print order not found", 404, "print_job_not_found");
  const [job] = await db.select().from(printJobs).where(eq(printJobs.id, id)).limit(1);
  if (!job || !inScope(job.organizationId, scope)) throw new TagError("Print order not found", 404, "print_job_not_found");
  return job;
}

async function jobPieces(batchId: string, bed: PrintBed | null): Promise<PrintJobPiece[]> {
  const list = await rows<{ serial_number: number | null; public_code: string; stock_status: string; nfc_provisioning_status: string }>(sql`
    SELECT serial_number, public_code, stock_status, nfc_provisioning_status FROM tags WHERE batch_id = ${batchId} ORDER BY serial_number NULLS LAST, public_code`);
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
      chipWritten: t.nfc_provisioning_status !== "not_programmed",
    };
  });
}

/** Where printed QR / programmed NFC URLs point (the same rule as routes.ts, which imports this module). */
function tagBaseUrl(): string {
  return (process.env.TAG_PUBLIC_BASE_URL?.trim() || TAG_DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, "");
}

export async function getJob(id: string, scope: ProductionScope): Promise<PrintJobDetail> {
  const job = await loadJob(id, scope);
  const [row] = await rows<JobRow>(sql`${JOB_SELECT} WHERE j.id = ${job.id}`);
  const [version] = await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${job.versionId}`);
  const bed = version?.beds?.find((b) => b.label === job.bedLabel) ?? null;
  const files = await db.select().from(printJobFiles).where(eq(printJobFiles.jobId, job.id)).orderBy(printJobFiles.createdAt);
  return {
    ...jobItem(row),
    bed,
    consumes: version?.consumes ?? [],
    builder: version?.builder ?? null,
    params: version?.params ?? {},
    recipe: version?.recipe ?? {},
    files: files.map(fileItem),
    pieces: job.batchId ? await jobPieces(job.batchId, bed) : [],
    preview: previewInfo(version?.preview),
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

async function existingCodes(prefix: string, year: number, executor: typeof db | Tx = db): Promise<string[]> {
  return (await rows<{ batch_code: string }>(sql`SELECT batch_code FROM tag_batches WHERE batch_code LIKE ${`${prefix}-${year}-%`}`, executor)).map((r) => r.batch_code);
}

/** Runs what a transaction left for after its commit (journey entries that need the rows committed). */
async function runAfterCommit(afterCommit: Array<() => Promise<void>>) {
  for (const run of afterCommit) await run();
}

/**
 * The order behind a batch made before the catalog existed: its status follows what the batch already went through.
 * The same checks as the Print dialog (client production-workflow canPrintModel / printableBeds): the batch is of the
 * model's product, face and sales product, and fits on one bed (the named one, else the first big enough).
 */
async function linkExistingBatch(model: PrintModelRow, version: VersionRow, bedLabel: string | undefined, input: PrintJobCreateInput, organizationId: number, userId: string | null, source: JourneySource) {
  const batchId = await resolveBatchId(input.existingBatch!);
  const batch = (await getBatchProduction(batchId))?.batch;
  if (!batch || batch.organizationId !== organizationId) throw new TagError("Batch not found", 404, "batch_not_found");
  if (batch.status === "cancelled") throw new TagError("A cancelled batch cannot be linked", 409);
  if (batch.productType !== model.productType) {
    throw new TagError(`Batch ${batch.batchCode} is a ${batch.productType}, this model prints ${model.productType}`, 409, "print_batch_product_mismatch");
  }
  if (batch.face && batch.face !== model.face) {
    throw new TagError(`Batch ${batch.batchCode} carries the ${batch.face} face, this model prints ${model.face ?? "no face"}`, 409, "print_batch_face_mismatch");
  }
  if (batch.salesProductId && batch.salesProductId !== model.salesProductId) {
    throw new TagError(`Batch ${batch.batchCode} is another sales product than this model's`, 409, "print_batch_sales_product_mismatch");
  }
  if (!batch.tagCount) throw new TagError("This batch has no pieces", 409);
  const beds = version.beds ?? [];
  const bed = bedLabel ? pickBed(version, bedLabel) : beds.find((b) => b.copies >= batch.tagCount);
  if (!bed || bed.copies < batch.tagCount) {
    throw new TagError(`Batch ${batch.batchCode} has ${batch.tagCount} pieces: no bed of the current version holds them on one plate`, 409,
      "print_batch_bed_too_small", { pieces: batch.tagCount });
  }
  const printed = ["printed", "receiving", "received"].includes(batch.stage);
  const [printedEntry] = printed
    ? await rows<{ occurred_at: Date | string }>(sql`
        SELECT occurred_at FROM tag_journey_entries WHERE batch_id = ${batchId} AND action = 'printed' AND status = 'active'
        ORDER BY occurred_at DESC LIMIT 1`)
    : [];
  const notes = input.notes ?? `Linked to ${batch.batchCode}, made before the catalog`;
  return db.transaction(async (tx) => {
    // Checked again under the batch's lock: two links at once must not give the batch two orders.
    const [locked] = await tx.select({ printJobId: tagBatches.printJobId }).from(tagBatches).where(eq(tagBatches.id, batchId)).for("update");
    if (locked?.printJobId) {
      const [linked] = await tx.select({ status: printJobs.status }).from(printJobs).where(eq(printJobs.id, locked.printJobId)).limit(1);
      if (linked && !["failed", "cancelled"].includes(linked.status)) throw new TagError(`Batch ${batch.batchCode} already has a print order`, 409, "print_batch_linked");
    }
    const [request] = await tx.insert(printRequests).values({
      organizationId, modelId: model.id, versionId: version.id, bedLabel: bed.label, quantity: batch.tagCount, notes, source, requestedByUserId: userId,
    }).returning({ id: printRequests.id });
    const [job] = await tx.insert(printJobs).values({
      organizationId,
      requestId: request.id,
      plateNumber: 1,
      modelId: model.id,
      versionId: version.id,
      bedLabel: bed.label,
      plates: 1,
      quantity: batch.tagCount,
      batchId,
      status: printed ? "printed" : "requested",
      notes,
      requestedByUserId: userId,
      printedAt: printed ? new Date(printedEntry?.occurred_at ?? Date.now()) : null,
    }).returning();
    await tx.update(tagBatches).set({ printJobId: job.id, updatedAt: new Date() }).where(eq(tagBatches.id, batchId));
    return job;
  });
}

interface PlateContext {
  organizationId: number;
  requestId: string | null;
  plateNumber: number;
  plateCount: number;
  notes: string | null;
  userId: string | null;
  source: JourneySource;
  /** The transaction the plate is written in (every plate of a request in one), and what runs after its commit. */
  within: BatchInTransaction;
}

/** A part's plate: its fixed file, ready at once when the bed has one. Returns the order id. */
async function createPartPlate(model: PrintModelRow, version: Pick<VersionRow, "id">, picked: PrintBed, ctx: PlateContext): Promise<string> {
  const { tx } = ctx.within;
  // The bed's file as it is now, under a share lock on the version: a file being replaced at this moment
  // (attachBedFile, which locks it for update) is either copied before the swap or the new one is taken after it.
  const [locked] = await rows<{ beds: PrintBed[] | null }>(sql`SELECT beds FROM print_model_versions WHERE id = ${version.id} FOR SHARE`, tx);
  const bed = (locked?.beds ?? []).find((b) => b.label === picked.label) ?? picked;
  const ready = Boolean(bed.fileRef);
  const [job] = await tx.insert(printJobs).values({
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    plateNumber: ctx.plateNumber,
    modelId: model.id,
    versionId: version.id,
    bedLabel: bed.label,
    plates: 1,
    quantity: bed.copies,
    status: ready ? "ready" : "requested",
    notes: ctx.notes,
    requestedByUserId: ctx.userId,
    builtAt: ready ? new Date() : null,
  }).returning({ id: printJobs.id });
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
  return job.id;
}

/** A serialized plate of `quantity` pieces: its batch (fresh codes) and its order, in the request's transaction. Returns the order id. */
async function createSerializedPlate(model: PrintModelRow, version: Pick<VersionRow, "id" | "version">, bed: PrintBed, quantity: number, ctx: PlateContext): Promise<string> {
  if (!model.batchPrefix || !model.productType || !model.salesProductId) {
    throw new TagError("This model needs a product, a sales product and a batch prefix before printing", 409, "print_model_incomplete");
  }
  const year = new Date().getUTCFullYear();
  const plate = ctx.plateCount > 1 ? ` · print job ${ctx.plateNumber}/${ctx.plateCount}` : "";
  // The maker named on the batch is whoever prints it: a branch's batch never reads as the company's.
  const [maker] = await ctx.within.tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
  for (let attempt = 1; ; attempt++) {
    // Read in the transaction: the batches of the request's earlier plates are not committed yet.
    const batchCode = nextPrintBatchCode(model.batchPrefix, year, await existingCodes(model.batchPrefix, year, ctx.within.tx));
    let jobId: string | null = null;
    try {
      await createBatch({
        name: `${model.title}${plate}`,
        batchCode,
        productType: model.productType,
        salesProductId: model.salesProductId,
        face: model.face,
        vendor: maker?.name ?? "Skale Club",
        notes: ctx.notes,
        quantity,
        organizationId: ctx.organizationId,
      }, ctx.userId, ctx.source, async (tx: Tx, batch) => {
        const [job] = await tx.insert(printJobs).values({
          organizationId: ctx.organizationId,
          requestId: ctx.requestId,
          plateNumber: ctx.plateNumber,
          modelId: model.id,
          versionId: version.id,
          bedLabel: bed.label,
          plates: 1,
          quantity,
          batchId: batch.id,
          status: "requested",
          notes: ctx.notes,
          requestedByUserId: ctx.userId,
        }).returning({ id: printJobs.id });
        await tx.update(tagBatches).set({ printJobId: job.id }).where(eq(tagBatches.id, batch.id));
        jobId = job.id;
      }, ctx.within);
    } catch (err) {
      if (err instanceof TagError && err.code === "batch_code_taken" && attempt < 3) continue;
      throw err;
    }
    return jobId!;
  }
}

/**
 * Whose pieces a new request makes: `ref` (slug or id), else the company for an admin, else the branch itself for a
 * branch's Rep Admin. Only the company or an active branch that prints its own pieces, and only within the scope.
 */
async function targetOrganization(ref: string | number | undefined, scope: ProductionScope): Promise<{ id: number; company: boolean }> {
  const companyId = await companyOrganizationId();
  if (ref === undefined) {
    if (scope === null) return { id: companyId, company: true };
    if (scope.length === 1) return { id: scope[0], company: scope[0] === companyId };
    throw new TagError("Choose which organization these pieces are for", 400, "print_organization_required");
  }
  const byId = typeof ref === "number" || /^\d+$/.test(ref);
  const [organization] = await db.select({ id: organizations.id, isActive: organizations.isActive, printsOwnPieces: organizations.printsOwnPieces })
    .from(organizations)
    .where(byId ? eq(organizations.id, Number(ref)) : eq(organizations.slug, String(ref).toLowerCase()))
    .limit(1);
  if (!organization || !inScope(organization.id, scope)) throw new TagError("Organization not found", 404, "organization_not_found");
  const company = organization.id === companyId;
  if (!company && (!organization.isActive || !organization.printsOwnPieces)) {
    throw new TagError("This organization does not print its own pieces", 409, "print_organization_not_printing");
  }
  return { id: organization.id, company };
}

/**
 * A print request: `quantity` pieces (or whole `plates`) of a model's current version, split into plates of at most
 * one bed each, the last one partial (10 on a 4-up bed: 4 + 4 + 2). Each serialized plate issues its own batch; a
 * part's plates are its fixed file, so its count rounds up to whole beds. The request and all its plates are written
 * in one transaction: either all of them exist or none. `existingBatch` links a batch made before the catalog
 * instead, as a request of one plate, for the batch's own organization unless another is named. `replaces` (set by
 * reprintDamaged only) is the printed plate this request makes again: it is locked and checked inside the transaction.
 */
export async function createJob(input: PrintJobCreateInput, userId: string | null, source: JourneySource, scope: ProductionScope, replaces: PrintJobRow | null = null): Promise<PrintRequestItem> {
  const model = await resolveModel(input.model);
  let organizationRef = input.organization;
  if (input.existingBatch && organizationRef === undefined && model.kind === "serialized") {
    const [owner] = await db.select({ organizationId: tagBatches.organizationId }).from(tagBatches)
      .where(eq(tagBatches.id, await resolveBatchId(input.existingBatch))).limit(1);
    if (owner && inScope(owner.organizationId, scope)) organizationRef = owner.organizationId;
  }
  const organization = await targetOrganization(organizationRef, scope);
  await assertReleased(organization.id, model, scope);
  // A part's plates feed the company's part counts (bases, tokens): a branch prints serialized pieces only.
  if (model.kind === "part" && !organization.company) {
    if (scope !== null) throw new TagError("No print model with that id or slug", 404, "print_model_not_found");
    throw new TagError("Parts are printed for the company only", 409, "print_part_company_only");
  }
  const version = await currentVersionOf(model);

  if (input.existingBatch) {
    if (model.kind === "part") throw new TagError("A part has no batch", 400);
    const job = await linkExistingBatch(model, version, input.bed, input, organization.id, userId, source);
    return getRequest(job.requestId!, scope);
  }
  const bed = pickBed(version, input.bed);
  if (model.kind === "serialized" && (!model.batchPrefix || !model.productType || !model.salesProductId)) {
    throw new TagError("This model needs a product, a sales product and a batch prefix before printing", 409, "print_model_incomplete");
  }
  const quantity = input.quantity ?? bed.copies * (input.plates ?? 1);
  const plates = splitIntoPlates(quantity, bed.copies, model.kind === "serialized");
  if (plates.length > PRINT_MAX_PLATES) {
    throw new TagError(`At most ${PRINT_MAX_PLATES} plates in one request: up to ${PRINT_MAX_PLATES * bed.copies} pieces on ${bed.label}`, 400,
      "print_too_many_plates", { max: PRINT_MAX_PLATES * bed.copies });
  }
  const notes = input.notes ?? null;
  const afterCommit: Array<() => Promise<void>> = [];
  const requestId = await db.transaction(async (tx) => {
    if (replaces) {
      // Two clicks at once both wait on this lock; the second finds the first one's request and is refused.
      await tx.select({ id: printJobs.id }).from(printJobs).where(eq(printJobs.id, replaces.id)).for("update");
      const [alive] = await rows<{ id: string }>(sql`
        SELECT j4.id FROM print_requests r4 JOIN print_jobs j4 ON j4.request_id = r4.id
        WHERE r4.replaces_job_id = ${replaces.id} AND j4.status <> 'cancelled' LIMIT 1`, tx);
      if (alive) throw new TagError("The damaged pieces of this print were already printed again", 409, "print_job_reprinted", { reprintedBy: alive.id });
    }
    const [request] = await tx.insert(printRequests).values({
      organizationId: organization.id, modelId: model.id, versionId: version.id, bedLabel: bed.label, quantity, notes, source, requestedByUserId: userId,
      replacesJobId: replaces?.id ?? null,
    }).returning({ id: printRequests.id });
    for (let index = 0; index < plates.length; index++) {
      const ctx: PlateContext = {
        organizationId: organization.id, requestId: request.id, plateNumber: index + 1, plateCount: plates.length, notes, userId, source,
        within: { tx, afterCommit },
      };
      if (model.kind === "part") await createPartPlate(model, version, bed, ctx);
      else await createSerializedPlate(model, version, bed, plates[index], ctx);
    }
    return request.id;
  });
  await runAfterCommit(afterCommit);
  console.log(`[production] request ${requestId} for ${model.slug} v${version.version}: ${quantity} pieces on ${plates.length} plate(s) [${plates.join(", ")}] for organization ${organization.id} (user ${userId ?? "?"})`);
  return getRequest(requestId, scope);
}

/**
 * "Generate N pieces" from the Production page's questions (product → colour → face → quantity): the stocked model
 * for that choice, then the same request as createJob (each plate its own batch with fresh serials, pending until the
 * plate is marked printed). A combination the house does not make is refused, whatever the client sent.
 */
export async function generatePieces(input: PrintGenerateInput, userId: string | null, source: JourneySource, scope: ProductionScope): Promise<PrintRequestItem> {
  // The scope's whole catalog: a model not released to the organization is refused by createJob, with its own reason.
  const choice = pickGenerateFace(printGenerateOptions(await catalogOf(scope)), input);
  if (!choice) {
    throw new TagError(`No ${input.theme} ${input.face} ${input.productType} can be generated: it is not in the catalog with a generator`, 409,
      "print_choice_unavailable");
  }
  return createJob({
    model: choice.modelId, bed: choice.bedLabel, quantity: input.quantity, notes: input.notes ?? null, organization: input.organization,
  }, userId, source, scope);
}

/**
 * "Print the damaged again": the pieces a printed plate marked damaged are asked for as a new request of the same
 * model, organization and bed. The count comes from the plate's batch, not from the client, and a plate's damaged
 * pieces are asked for once while that request lives (createJob refuses the second with `print_job_reprinted`).
 */
export async function reprintDamaged(id: string, userId: string | null, scope: ProductionScope, source: JourneySource = "admin"): Promise<PrintRequestItem> {
  const job = await loadJob(id, scope);
  if (job.status !== "printed" || !job.batchId) throw new TagError("Only a printed plate with pieces can have its damaged pieces printed again", 409, "print_job_state");
  const [{ n }] = await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM tags WHERE batch_id = ${job.batchId} AND stock_status = 'damaged'`);
  if (!n) throw new TagError("No piece of this print is damaged", 409, "print_job_no_damaged");
  return createJob({ model: job.modelId, bed: job.bedLabel, quantity: n, organization: job.organizationId }, userId, source, scope, job);
}

/**
 * Print a failed or cancelled plate again, in the same request and place (planRedoCodes): the same batch while none of
 * its pieces was received (the same version and bed), else a fresh batch from the current version. With fresh codes
 * the old batch's pending codes are retired, since the new plate prints every piece again; a plate that failed its QR
 * check also has its batch cancelled (the same codes would only fail again). A plate is printed again once: the attempt
 * is locked and refused when another attempt already took its place, so a double click makes one plate, not two.
 */
export async function redoJob(id: string, userId: string | null, scope: ProductionScope, source: JourneySource = "admin"): Promise<PrintJobDetail> {
  const job = await loadJob(id, scope);
  if (job.status !== "failed" && job.status !== "cancelled") throw new TagError("Only a failed or cancelled order can be printed again", 409, "print_job_state");
  const [model] = await db.select().from(printModels).where(eq(printModels.id, job.modelId)).limit(1);
  if (model.status === "retired") throw new TagError("This model is retired", 409, "print_model_retired");
  await assertReleased(job.organizationId, model, scope);
  const codes = job.batchId
    ? planRedoCodes({
      errorCode: job.errorCode,
      anyReceived: Number((await rows<{ n: number }>(sql`SELECT count(*)::int AS n FROM tags WHERE batch_id = ${job.batchId} AND stock_status <> 'pending'`))[0]?.n ?? 0) > 0,
    })
    : "fresh";
  const freshCodes = model.kind === "serialized" && codes !== "same";
  // Everything read from outside the transaction is read before it opens.
  const version = freshCodes ? await currentVersionOf(model) : (await rows<VersionRow>(sql`${VERSION_SELECT} WHERE v.id = ${job.versionId}`))[0];
  const bed = freshCodes ? pickBed(version, job.bedLabel) : version?.beds?.find((b) => b.label === job.bedLabel) ?? null;
  if (model.kind === "part" && !bed) throw new TagError("The order's bed is missing from its version", 409);
  const [{ plate_count: plateCount }] = job.requestId
    ? await rows<{ plate_count: number }>(sql`
        SELECT count(DISTINCT COALESCE(plate_number, 1))::int AS plate_count FROM print_jobs WHERE request_id = ${job.requestId}`)
    : [{ plate_count: 1 }];
  const afterCommit: Array<() => Promise<void>> = [];
  const nextId = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ status: printJobs.status }).from(printJobs).where(eq(printJobs.id, job.id)).for("update");
    if (!locked || (locked.status !== "failed" && locked.status !== "cancelled")) {
      throw new TagError("The order changed meanwhile; reload it", 409, "print_job_state");
    }
    if (job.requestId) {
      const [newer] = await rows<{ id: string }>(sql`
        SELECT j3.id FROM print_jobs j3
        WHERE j3.request_id = ${job.requestId} AND COALESCE(j3.plate_number, 1) = ${job.plateNumber ?? 1}
          AND j3.id <> ${job.id} AND j3.created_at > ${job.createdAt}
        LIMIT 1`, tx);
      if (newer) throw new TagError("This plate was already printed again", 409, "print_job_redone", { redoneBy: newer.id });
    }
    const ctx: PlateContext = {
      organizationId: job.organizationId, requestId: job.requestId, plateNumber: job.plateNumber ?? 1, plateCount: Number(plateCount) || 1,
      notes: job.notes, userId, source, within: { tx, afterCommit },
    };
    if (freshCodes) {
      const next = await createSerializedPlate(model, version, bed!, job.quantity, ctx);
      if (job.batchId) afterCommit.push(await retirePendingCodes(tx, job, next, codes === "replace", userId, source));
      return next;
    }
    // A part's plate: the bed's file on the version it printed (a file a plate took is never replaced).
    if (model.kind === "part") return createPartPlate(model, { id: job.versionId }, bed!, ctx);
    const [next] = await tx.insert(printJobs).values({
      organizationId: job.organizationId,
      requestId: job.requestId,
      plateNumber: job.plateNumber,
      modelId: job.modelId,
      versionId: job.versionId,
      bedLabel: job.bedLabel,
      plates: job.plates,
      quantity: job.quantity,
      batchId: job.batchId,
      status: "requested",
      notes: job.notes,
      requestedByUserId: userId,
    }).returning({ id: printJobs.id });
    if (job.batchId) await tx.update(tagBatches).set({ printJobId: next.id, updatedAt: new Date() }).where(eq(tagBatches.id, job.batchId));
    return next.id;
  });
  await runAfterCommit(afterCommit);
  return getJob(nextId, scope);
}

/**
 * A plate printed again with fresh codes (`nextJobId`): its old batch's pending codes never become pieces, so each is
 * retired (one `retire` movement) and can never be printed, stocked or sold. When the plate failed its QR check
 * (`cancelBatch`) nothing of the batch was received and the batch is cancelled too; otherwise it keeps the pieces that
 * were received. A piece that is not pending any more is left alone. Runs in the caller's transaction; returns the
 * journey entry to record after the commit.
 */
async function retirePendingCodes(tx: Tx, job: PrintJobRow, nextJobId: string, cancelBatch: boolean, userId: string | null, source: JourneySource): Promise<() => Promise<void>> {
  const batchId = job.batchId!;
  const reason = cancelBatch
    ? "Never printed: the plate failed its QR check and was printed again with fresh codes"
    : "Never printed: the plate was printed again with fresh codes";
  const [batch] = await tx.select().from(tagBatches).where(eq(tagBatches.id, batchId)).for("update");
  if (!batch || batch.status === "cancelled") return async () => {};
  const pending = await tx.select().from(tags).where(sql`${tags.batchId} = ${batchId} AND ${tags.stockStatus} = 'pending'`).for("update");
  const now = new Date();
  if (pending.length) {
    await tx.update(tags).set({ status: "retired", stockStatus: "retired", disabledAt: now, stockUpdatedAt: now, updatedAt: now })
      .where(inArray(tags.id, pending.map((t) => t.id)));
    await tx.insert(tagStockMovements).values(pending.map((t) => ({
      tagId: t.id,
      movementType: "retire",
      fromStockStatus: "pending",
      toStockStatus: "retired",
      fromOwnershipType: t.ownershipType,
      toOwnershipType: t.ownershipType,
      fromCustodianRepId: t.custodianRepId,
      toCustodianRepId: t.custodianRepId,
      actorUserId: userId,
      referenceType: "batch",
      referenceId: batchId,
      reason,
    })));
  }
  if (cancelBatch) await tx.update(tagBatches).set({ status: "cancelled", updatedAt: now }).where(eq(tagBatches.id, batchId));
  else await tx.update(tagBatches).set({ updatedAt: now }).where(eq(tagBatches.id, batchId));
  if (!cancelBatch && !pending.length) return async () => {};
  const failed = Array.isArray(job.report?.qr_failed_codes) ? (job.report.qr_failed_codes as unknown[]).map(String) : [];
  return () => recordJourney({
    kind: "execution",
    action: "batch_status_changed",
    title: cancelBatch
      ? `Batch ${batch.batchCode} cancelled: ${pending.length} codes retired, printed again with fresh codes`
      : `Batch ${batch.batchCode}: ${pending.length} codes never printed retired, printed again with fresh codes`,
    content: failed.length ? `${reason}. Failed the QR check: ${failed.join(", ")}.` : `${reason}.`,
    batchId,
    beforeValue: batch.status,
    afterValue: cancelBatch ? "cancelled" : batch.status,
    metadata: { printJobId: job.id, replacedBy: nextJobId, retired: pending.length, qrFailedCodes: failed },
  }, journeyContext(userId, source));
}

export interface TransitionInput {
  action: PrintJobAction;
  reason?: string | null;
  /** `printed`: public codes of the pieces that came out bad (they become damaged; the rest go into stock). */
  badPieces?: readonly string[];
  userId: string | null;
  source?: JourneySource;
}

const BAD_PIECE_REASON = "Came out bad on the printer plate";

interface StockedPieces { stocked: Array<{ id: string; publicCode: string }>; damaged: Array<{ id: string; publicCode: string }> }

/**
 * Puts a printed plate's pending pieces in house stock: the same end state as a successful intake scan (available,
 * company-owned, registered, one `intake` movement each), without the scan. The pieces listed in `badPieces` become
 * damaged instead (the same state and `damage` movement as markTagDamaged). A piece that is not pending any more is
 * left alone, so repeating it is harmless. Runs inside the caller's transaction.
 */
async function stockPrintedPieces(tx: Tx, batchId: string, badPieces: readonly string[], userId: string | null): Promise<StockedPieces> {
  const [batch] = await tx.select().from(tagBatches).where(eq(tagBatches.id, batchId)).for("update");
  if (!batch) throw new TagError("Batch not found", 404, "batch_not_found");
  const list = await tx.select().from(tags).where(eq(tags.batchId, batchId)).for("update");
  const split = splitPrintedPieces(list, badPieces);
  if (split.unknown.length) {
    throw new TagError(`Piece ${split.unknown[0]} is not in this plate's batch`, 400, "piece_not_in_batch", { code: split.unknown[0] });
  }
  const none: StockedPieces = { stocked: [], damaged: [] };
  if (batch.status === "cancelled") return none;
  const good = new Set(split.good);
  const bad = new Set(split.bad);
  const goodTags = list.filter((t) => good.has(t.publicCode));
  const badTags = list.filter((t) => bad.has(t.publicCode));
  if (!goodTags.length && !badTags.length) return none;
  const now = new Date();
  if (goodTags.length) {
    await tx.update(tags).set({
      stockStatus: "available",
      ownershipType: "company",
      registeredAt: now,
      registeredByUserId: userId,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(inArray(tags.id, goodTags.map((t) => t.id)));
    await tx.insert(tagStockMovements).values(goodTags.map((t) => ({
      tagId: t.id,
      movementType: "intake",
      fromStockStatus: "pending",
      toStockStatus: "available",
      fromOwnershipType: t.ownershipType,
      toOwnershipType: "company",
      actorUserId: userId,
      referenceType: "batch",
      referenceId: batch.id,
    })));
  }
  if (badTags.length) {
    await tx.update(tags).set({ stockStatus: "damaged", internalUseNote: null, stockUpdatedAt: now, updatedAt: now })
      .where(inArray(tags.id, badTags.map((t) => t.id)));
    await tx.insert(tagStockMovements).values(badTags.map((t) => ({
      tagId: t.id,
      movementType: "damage",
      fromStockStatus: "pending",
      toStockStatus: "damaged",
      fromOwnershipType: t.ownershipType,
      toOwnershipType: t.ownershipType,
      fromCustodianRepId: t.custodianRepId,
      toCustodianRepId: t.custodianRepId,
      actorUserId: userId,
      referenceType: "batch",
      referenceId: batch.id,
      reason: BAD_PIECE_REASON,
    })));
  }
  await tx.update(tagBatches).set({ updatedAt: now }).where(eq(tagBatches.id, batch.id));
  return {
    stocked: goodTags.map((t) => ({ id: t.id, publicCode: t.publicCode })),
    damaged: badTags.map((t) => ({ id: t.id, publicCode: t.publicCode })),
  };
}

/** The journey after the stock moved: one entry for the batch, one per damaged piece (like markTagDamaged). */
async function recordStocked(batchId: string, result: StockedPieces, userId: string | null, source: JourneySource) {
  if (!result.stocked.length && !result.damaged.length) return;
  const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, batchId)).limit(1);
  const ctx = journeyContext(userId, source);
  await recordJourney({
    kind: "execution",
    action: "pieces_stocked",
    title: `Batch ${batch?.batchCode ?? ""}: ${result.stocked.length} printed piece${result.stocked.length === 1 ? "" : "s"} put in stock`,
    batchId,
    afterValue: "available",
    metadata: { stocked: result.stocked.length, damaged: result.damaged.length, method: "printed" },
  }, ctx);
  for (const piece of result.damaged) {
    await recordJourney({
      kind: "execution",
      action: "piece_damaged",
      title: `Piece ${piece.publicCode} marked damaged`,
      content: BAD_PIECE_REASON,
      tagId: piece.id,
      batchId,
      beforeValue: "pending",
      afterValue: "damaged",
    }, ctx);
  }
}

/**
 * Moves an order through its state machine (shared/printProduction.ts) with the side effects of each step:
 * `printed` records the batch's `printed` journey step and puts the batch's pending pieces in house stock, in the
 * same transaction (the `badPieces` come out damaged instead), or adds a part's pieces to its count; `complete`
 * needs a print file, `fail` keeps the reason.
 */
export async function transitionJob(id: string, input: TransitionInput, scope: ProductionScope): Promise<PrintJobDetail> {
  const job = await loadJob(id, scope);
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
  const stocked = await db.transaction(async (tx) => {
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
    // Printed by hand and checked by eye: the good pieces are stock now, without scanning each QR.
    return input.action === "printed" && job.batchId ? stockPrintedPieces(tx, job.batchId, input.badPieces ?? [], input.userId) : null;
  });
  if (job.batchId && input.action === "printed") {
    const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
    await recordJourney({
      kind: "execution",
      action: "printed",
      title: `Batch ${batch?.batchCode ?? ""} printed`.trim(),
      batchId: job.batchId,
      metadata: { printJobId: job.id, bed: job.bedLabel, plate: job.plateNumber ?? 1, pieces: job.quantity },
    }, journeyContext(input.userId, input.source));
  }
  if (input.action === "fail") await recordPrintFailed(job, input.reason ?? null, "failed", input.userId, input.source ?? "admin");
  if (stocked && job.batchId) await recordStocked(job.batchId, stocked, input.userId, input.source ?? "admin");
  return getJob(job.id, scope);
}

/** A plate failed (marked by hand or reported by the bench): an observation on its batch's journey, the same either way. */
async function recordPrintFailed(job: PrintJobRow, reason: string | null, errorCode: string, userId: string | null, source: JourneySource) {
  if (!job.batchId) return;
  const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
  await recordJourney({
    kind: "observation",
    action: "print_failed",
    title: `Print order for ${batch?.batchCode ?? "the batch"} failed`,
    content: reason,
    batchId: job.batchId,
    metadata: { printJobId: job.id, errorCode },
  }, journeyContext(userId, source));
}

/**
 * Plates printed before marking printed stocked the pieces: their batch still shows its pieces pending. This puts
 * them in stock the same way (and `badPieces` come out damaged). Only a printed plate with a batch; repeating it
 * when nothing is pending changes nothing.
 */
export async function stockJob(id: string, input: { badPieces?: readonly string[]; userId: string | null; source?: JourneySource }, scope: ProductionScope): Promise<PrintJobDetail> {
  const job = await loadJob(id, scope);
  if (job.status !== "printed" || !job.batchId) {
    throw new TagError("Only a printed plate with codes can put its pieces in stock", 409, "print_job_state");
  }
  const batchId = job.batchId;
  const stocked = await db.transaction((tx) => stockPrintedPieces(tx, batchId, input.badPieces ?? [], input.userId));
  await recordStocked(batchId, stocked, input.userId, input.source ?? "admin");
  return getJob(job.id, scope);
}

export async function attachJobFile(id: string, kind: PrintFileKind, filename: string, body: Uint8Array, scope: ProductionScope, opts: { deviceId?: string | null } = {}): Promise<PrintJobFileItem> {
  const job = await loadJob(id, scope);
  if (opts.deviceId !== undefined && (job.deviceId !== opts.deviceId || job.status !== "building")) {
    throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
  }
  if (["printed", "cancelled"].includes(job.status)) throw new TagError(`A ${job.status} order takes no more files`, 409, "print_job_state");
  const stored = await storeFile(job.id, filename, body, PRINT_FILE_CONTENT_TYPES[kind]);
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

/** The paired bench calling: its id and the organization it works for (a bench sees that organization's plates only). */
export interface BenchDevice { id: string; organizationId: number }

const benchScope = (device: BenchDevice): ProductionScope => [device.organizationId];

/** What `bench.py build` needs for one order. */
export async function jobTicket(id: string, scope: ProductionScope): Promise<PrintJobTicket> {
  const job = await loadJob(id, scope);
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
export async function claimJob(device: BenchDevice, jobId?: string | null): Promise<PrintJobTicket | null> {
  const now = new Date();
  const deviceId = device.id;
  const scope = benchScope(device);
  if (jobId) {
    const job = await loadJob(jobId, scope);
    if (job.status === "building" && job.deviceId === deviceId) return jobTicket(job.id, scope);
    const plan = planPrintJobTransition(job.status, "claim");
    if (!plan.ok) throw new TagError(plan.error, 409, plan.code);
    const claimed = await db.update(printJobs).set({ status: "building", deviceId, claimedAt: now, lastEventAt: now, updatedAt: now })
      .where(sql`${printJobs.id} = ${job.id} AND ${printJobs.status} = 'requested'`).returning({ id: printJobs.id });
    if (!claimed.length) throw new TagError("Another bench took this order", 409, "print_job_state");
    return jobTicket(job.id, scope);
  }
  const [claimed] = await rows<{ id: string }>(sql`
    UPDATE print_jobs SET status = 'building', device_id = ${deviceId}, claimed_at = ${now}, last_event_at = ${now}, updated_at = ${now}
    WHERE id = (
      SELECT j.id FROM print_jobs j JOIN print_model_versions v ON v.id = j.version_id
      WHERE j.status = 'requested' AND v.builder IS NOT NULL AND j.organization_id = ${device.organizationId}
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    ) AND status = 'requested'
    RETURNING id`);
  return claimed ? jobTicket(claimed.id, scope) : null;
}

/** The bench reports progress: keeps the order from looking stuck, and the last messages for the queue. */
export async function recordBenchEvent(device: BenchDevice, jobId: string, type: string, detail: Record<string, unknown> | null) {
  const job = await loadJob(jobId, benchScope(device));
  if (job.deviceId !== device.id || job.status !== "building") throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
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
export async function completeFromBench(device: BenchDevice, jobId: string, input: BenchCompleteInput): Promise<PrintJobDetail> {
  const scope = benchScope(device);
  const job = await loadJob(jobId, scope);
  if (job.deviceId !== device.id || job.status !== "building") throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
  const report = { ...(job.report ?? {}), ...(input.report ?? {}) };
  if (input.outcome === "failed") {
    // Only while this bench still holds it: an admin may have released or cancelled it meanwhile.
    const errorCode = input.errorCode ?? "build_failed";
    const updated = await db.update(printJobs).set({
      status: "failed",
      report,
      errorCode,
      errorMessage: input.errorMessage ?? null,
      lastEventAt: new Date(),
      updatedAt: new Date(),
    }).where(sql`${printJobs.id} = ${job.id} AND ${printJobs.status} = 'building' AND ${printJobs.deviceId} = ${device.id}`)
      .returning({ id: printJobs.id });
    if (!updated.length) throw new TagError("This bench is not building that order", 409, "print_job_not_claimed");
    await recordPrintFailed(job, input.errorMessage ?? null, errorCode, null, "system");
    return getJob(job.id, scope);
  }
  await db.update(printJobs).set({ report }).where(eq(printJobs.id, job.id));
  const detail = await transitionJob(job.id, { action: "complete", userId: null, source: "system" }, scope);
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


// ─── The bench's Print Now folder ─────────────────────────────────────────────

/**
 * The plates the bench mirrors into its Print Now folder: every plate ready to print (or printing), and the ones
 * printed in the last PRINT_NOW_PRINTED_DAYS days, each with its project and sliced file (latest of each kind) behind
 * a short-lived signed link. Anything else leaves the folder.
 */
export async function printNowPlates(device: BenchDevice): Promise<PrintNowPlate[]> {
  const since = new Date(Date.now() - PRINT_NOW_PRINTED_DAYS * 24 * 60 * 60_000);
  const list = await rows<JobRow>(sql`${JOB_SELECT}
    WHERE j.organization_id = ${device.organizationId}
      AND (j.status IN ('ready', 'printing') OR (j.status = 'printed' AND j.printed_at >= ${since}))
    ORDER BY COALESCE(r.created_at, j.created_at), j.plate_number`);
  if (!list.length) return [];
  const ids = sql.join(list.map((j) => sql`${j.id}`), sql`, `);
  const files = await rows<{ id: string; job_id: string; kind: string; file_ref: string; filename: string; bytes: number; sha256: string }>(sql`
    SELECT DISTINCT ON (job_id, kind) id, job_id, kind, file_ref, filename, bytes, sha256
    FROM print_job_files WHERE job_id IN (${ids}) AND kind IN ('3mf', 'gcode_3mf')
    ORDER BY job_id, kind, created_at DESC`);
  const out: PrintNowPlate[] = [];
  for (const j of list) {
    const own = files.filter((f) => f.job_id === j.id);
    if (!own.length) continue;
    out.push({
      id: j.id,
      status: j.status as PrintJobStatus,
      requestId: j.request_id,
      requestCreatedAt: iso(j.request_created_at)!,
      requestQuantity: Number(j.request_quantity),
      plateNumber: Number(j.plate_number),
      plateCount: Number(j.plate_count),
      quantity: Number(j.quantity),
      batchCode: j.batch_code,
      modelTitle: j.model_title,
      files: await Promise.all(own.map(async (f) => ({
        id: f.id, kind: f.kind as PrintFileKind, filename: f.filename, sha256: f.sha256, bytes: Number(f.bytes), url: await signedFileUrl(f.file_ref),
      }))),
    });
  }
  return out;
}

// ─── Feedback and assembly (phase 4, docs/PRINT_EXECUTION_PLAN.md §5.4-5.5) ───

/**
 * "This print came out wrong": an observation on the batch's (or the model's) journey, with the order and version, so
 * the next version can say what it fixes. Making that version is a separate step (the model page opens it prefilled).
 */
export async function recordProblem(id: string, text: string, userId: string | null, scope: ProductionScope, source: JourneySource = "admin") {
  const job = await getJob(id, scope);
  return createJourneyEntry({
    kind: "observation",
    action: "print_problem",
    title: `Problem on ${job.batchCode ?? job.modelTitle} (v${job.version})`.slice(0, 200),
    content: text,
    batchId: job.batchId,
    metadata: { printJobId: job.id, model: job.modelSlug, version: job.version, versionId: job.versionId },
  }, journeyContext(userId, source));
}

/** The batch is assembled: the journey says so, and the parts its version consumes come off their counts. */
export async function markAssembled(id: string, userId: string | null, scope: ProductionScope, source: JourneySource = "admin"): Promise<PrintJobDetail> {
  const job = await loadJob(id, scope);
  if (!job.batchId) throw new TagError("Only a print order of pieces with codes is assembled", 400, "print_assemble_part");
  if (job.status !== "printed") throw new TagError("Mark the order printed before assembling it", 409, "print_assemble_not_printed");
  if ((job.report as { assembledAt?: string } | null)?.assembledAt) throw new TagError("This order is already assembled", 409, "print_assemble_done");
  const [batch] = await db.select({ batchCode: tagBatches.batchCode }).from(tagBatches).where(eq(tagBatches.id, job.batchId)).limit(1);
  await createJourneyEntry({
    kind: "execution",
    action: "assembled",
    title: `Batch ${batch?.batchCode ?? ""} assembled`.trim(),
    batchId: job.batchId,
    metadata: { printJobId: job.id },
  }, journeyContext(userId, source));
  await db.update(printJobs).set({ report: { ...(job.report ?? {}), assembledAt: new Date().toISOString() }, updatedAt: new Date() })
    .where(eq(printJobs.id, job.id));
  return getJob(job.id, scope);
}

/**
 * Called whenever an `assembled` step is written for a batch (from the order, the journey panel or MCP): its order's
 * version says which parts one piece takes; each comes off its count once per batch. A count may go below zero —
 * that is a recount to do, shown in the catalog, not a reason to refuse the step. The counts are the company's: a
 * branch's batch takes nothing off them.
 */
export async function consumeForAssembly(batchId: string, userId: string | null): Promise<number> {
  const [owner] = await db.select({ organizationId: tagBatches.organizationId }).from(tagBatches).where(eq(tagBatches.id, batchId)).limit(1);
  if (!owner || owner.organizationId !== await companyOrganizationId()) return 0;
  const [done] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM print_part_movements WHERE batch_id = ${batchId} AND reason = 'assembled'`);
  if (Number(done?.n ?? 0) > 0) return 0;
  const [job] = await rows<{ id: string; consumes: Array<{ part: string; perPiece: number }> | null }>(sql`
    SELECT j.id, v.consumes FROM print_jobs j JOIN print_model_versions v ON v.id = j.version_id
    WHERE j.batch_id = ${batchId} AND j.status NOT IN ('failed', 'cancelled')
    ORDER BY j.created_at DESC LIMIT 1`);
  const consumes = job?.consumes ?? [];
  if (!job || !consumes.length) return 0;
  const [{ pieces }] = await rows<{ pieces: number }>(sql`
    SELECT count(*)::int AS pieces FROM tags WHERE batch_id = ${batchId} AND stock_status NOT IN ('pending', 'damaged')`);
  if (!Number(pieces)) return 0;
  let moved = 0;
  await db.transaction(async (tx) => {
    for (const use of consumes) {
      const [part] = await tx.select().from(printModels).where(eq(printModels.slug, use.part)).limit(1);
      if (!part || part.kind !== "part") continue;
      const delta = -use.perPiece * Number(pieces);
      await tx.insert(printPartMovements).values({ modelId: part.id, delta, reason: "assembled", jobId: job.id, batchId, actorUserId: userId });
      await tx.update(printModels).set({ partOnHand: sql`${printModels.partOnHand} + ${delta}`, updatedAt: new Date() }).where(eq(printModels.id, part.id));
      moved++;
    }
  });
  return moved;
}
