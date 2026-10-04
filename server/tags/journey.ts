import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { tagBatches, tagJourneyEntries, tagPlans, tags, type TagPlan } from "#shared/schema.js";
import { normalizeTagCode } from "#shared/tags.js";
import {
  OPEN_PLAN_STATUSES,
  PLAN_KIND_LABELS,
  actorForSource,
  isClosedPlanStatus,
  planStatusEntry,
  type JourneyEntryKind,
  type JourneyEntryStatus,
  type JourneySource,
  type PlanKind,
  type PlanStatus,
} from "#shared/tagJourney.js";
import type { TagJourney, TagJourneyEntryItem, TagPlanItem } from "#shared/tagsApi.js";
import { TagError, pgError } from "./errors.js";

// Tags Journey: the timeline of what happened to the pieces and the plans
// around them. The repository writes an execution for every mutation it makes
// (recordJourney, non-blocking, after the transaction commits); admins and MCP
// clients add the rest (production steps, decisions, insights) with
// createJourneyEntry. Admin-only: nothing here is reachable by a reseller.

/** Who is acting: an admin in the panel, a reseller in the field app, an MCP client, or the system. */
export interface JourneyContext {
  source: JourneySource;
  userId: string | null;
  /** The acting reseller (sales_reps.id), for entries written from the field app. */
  repId?: number | null;
}

export function journeyContext(userId: string | null, source?: JourneySource, repId?: number | null): JourneyContext {
  return { source: source ?? (userId ? "admin" : "system"), userId, repId: repId ?? null };
}

export interface JourneyEntryInput {
  kind: JourneyEntryKind;
  action?: string | null;
  title: string;
  content?: string | null;
  batchId?: string | null;
  tagId?: string | null;
  kitId?: string | null;
  /** The reseller the entry is about. */
  repId?: number | null;
  leadId?: number | null;
  planId?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
  status?: JourneyEntryStatus;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date | null;
}

const iso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}

const clip = (value: string | null | undefined, max: number) =>
  value == null ? null : value.length > max ? `${value.slice(0, max - 1)}…` : value;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An entry about a tag also belongs to that tag's batch, kit, reseller and
 * lead, so their stories include it.
 */
async function withTagScope(input: JourneyEntryInput): Promise<JourneyEntryInput> {
  if (!input.tagId) return input;
  const [tag] = await db
    .select({ batchId: tags.batchId, kitId: tags.kitId, repId: tags.repId, leadId: tags.leadId })
    .from(tags)
    .where(eq(tags.id, input.tagId))
    .limit(1);
  if (!tag) throw new TagError("Tag not found", 404);
  return {
    ...input,
    batchId: input.batchId ?? tag.batchId,
    kitId: input.kitId ?? tag.kitId,
    repId: input.repId ?? tag.repId,
    leadId: input.leadId ?? tag.leadId,
  };
}

async function insertEntry(input: JourneyEntryInput, ctx: JourneyContext): Promise<string> {
  const scoped = await withTagScope(input);
  try {
    const [row] = await db
      .insert(tagJourneyEntries)
      .values({
        kind: scoped.kind,
        action: scoped.action ?? null,
        title: clip(scoped.title, 200)!,
        content: clip(scoped.content, 4000),
        batchId: scoped.batchId ?? null,
        tagId: scoped.tagId ?? null,
        kitId: scoped.kitId ?? null,
        repId: scoped.repId ?? null,
        leadId: scoped.leadId ?? null,
        planId: scoped.planId ?? null,
        beforeValue: clip(scoped.beforeValue, 500),
        afterValue: clip(scoped.afterValue, 500),
        source: ctx.source,
        actor: actorForSource(ctx.source),
        actorUserId: ctx.userId,
        actorRepId: ctx.repId ?? null,
        status: scoped.status ?? "active",
        metadata: scoped.metadata ?? {},
        ...(scoped.occurredAt ? { occurredAt: scoped.occurredAt } : {}),
      })
      .returning({ id: tagJourneyEntries.id });
    return row.id;
  } catch (err) {
    if (pgError(err).code === "23503") {
      throw new TagError("The batch, tag, kit, reseller, customer or plan referenced does not exist", 404);
    }
    throw err;
  }
}

/** Adds an entry and returns it; errors reach the caller (admin API, MCP). */
export async function createJourneyEntry(input: JourneyEntryInput, ctx: JourneyContext): Promise<TagJourneyEntryItem> {
  const id = await insertEntry(input, ctx);
  const [entry] = await listEntriesWhere(sql`j.id = ${id}`, 1);
  return entry;
}

/**
 * The automatic trail of a mutation that already succeeded. Never throws: a
 * failure to write history must not fail the action it describes, but it is
 * logged, because a silently missing trail is exactly what goes unnoticed.
 */
export async function recordJourney(input: JourneyEntryInput, ctx: JourneyContext): Promise<void> {
  try {
    await insertEntry(input, ctx);
  } catch (err) {
    console.error("[tags/journey] failed to record entry:", input.action ?? input.title, err instanceof Error ? err.message : err);
  }
}

export async function setJourneyEntryStatus(id: string, status: JourneyEntryStatus): Promise<TagJourneyEntryItem> {
  const [row] = await db
    .update(tagJourneyEntries)
    .set({ status })
    .where(eq(tagJourneyEntries.id, id))
    .returning({ id: tagJourneyEntries.id });
  if (!row) throw new TagError("Journey entry not found", 404);
  const [entry] = await listEntriesWhere(sql`j.id = ${id}`, 1);
  return entry;
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export interface JourneyFilters {
  batchId?: string;
  tagId?: string;
  kitId?: string;
  repId?: number;
  leadId?: number;
  planId?: string;
  kind?: string;
  /** Archived and superseded entries are hidden unless asked for. */
  includeArchived?: boolean;
  /** Only entries that happened before this instant (paging back in time). */
  before?: Date;
  limit?: number;
}

type EntryRow = {
  id: string; kind: string; action: string | null; title: string; content: string | null;
  batch_id: string | null; batch_code: string | null; tag_id: string | null; public_code: string | null;
  serial_number: number | null; kit_id: string | null; rep_id: number | null; rep_name: string | null;
  lead_id: number | null; lead_name: string | null; plan_id: string | null; plan_title: string | null;
  before_value: string | null; after_value: string | null; source: string; actor: string;
  actor_user_id: string | null; actor_email: string | null; actor_rep_id: number | null; actor_name: string | null;
  status: string; metadata: Record<string, unknown> | null; occurred_at: Date; created_at: Date;
};

async function listEntriesWhere(where: SQL, limit: number): Promise<TagJourneyEntryItem[]> {
  const list = await rows<EntryRow>(sql`
    SELECT j.id, j.kind, j.action, j.title, j.content, j.batch_id, b.batch_code, j.tag_id, t.public_code,
           t.serial_number, j.kit_id, j.rep_id, r.display_name AS rep_name, j.lead_id, l.name AS lead_name,
           j.plan_id, p.title AS plan_title, j.before_value, j.after_value, j.source, j.actor, j.actor_user_id,
           u.email AS actor_email, j.actor_rep_id, ar.display_name AS actor_name, j.status,
           j.metadata, j.occurred_at, j.created_at
    FROM tag_journey_entries j
    LEFT JOIN tag_batches b ON b.id = j.batch_id
    LEFT JOIN tags t ON t.id = j.tag_id
    LEFT JOIN sales_reps r ON r.id = j.rep_id
    LEFT JOIN sales_reps ar ON ar.id = j.actor_rep_id
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    LEFT JOIN tag_plans p ON p.id = j.plan_id
    LEFT JOIN users u ON u.id = j.actor_user_id
    WHERE ${where}
    ORDER BY j.occurred_at DESC, j.created_at DESC
    LIMIT ${limit}
  `);
  return list.map((r) => ({
    id: r.id,
    kind: r.kind,
    action: r.action,
    title: r.title,
    content: r.content,
    batchId: r.batch_id,
    batchCode: r.batch_code,
    tagId: r.tag_id,
    publicCode: r.public_code,
    serialNumber: r.serial_number,
    kitId: r.kit_id,
    repId: r.rep_id,
    repName: r.rep_name,
    leadId: r.lead_id,
    leadName: r.lead_name,
    planId: r.plan_id,
    planTitle: r.plan_title,
    beforeValue: r.before_value,
    afterValue: r.after_value,
    source: r.source,
    actor: r.actor,
    actorUserId: r.actor_user_id,
    actorEmail: r.actor_email,
    actorRepId: r.actor_rep_id,
    actorName: r.actor_name,
    status: r.status,
    metadata: r.metadata ?? {},
    occurredAt: iso(r.occurred_at)!,
    createdAt: iso(r.created_at)!,
  }));
}

/**
 * A tag's story is its own entries, plus the batch-wide ones of its batch
 * (the batch was created, sliced, printed: that happened to this piece too),
 * plus the kit deliveries and returns that listed its code (a piece keeps that
 * history even after it leaves the kit). `withCodes` is only for the timeline;
 * plans carry no codes.
 */
async function tagScope(alias: string, tagId: string, withCodes: boolean): Promise<SQL> {
  const [tag] = await db
    .select({ batchId: tags.batchId, publicCode: tags.publicCode })
    .from(tags)
    .where(eq(tags.id, tagId))
    .limit(1);
  if (!tag) throw new TagError("Tag not found", 404);
  const col = (name: string) => sql.raw(`${alias}.${name}`);
  const parts: SQL[] = [sql`${col("tag_id")} = ${tagId}`];
  if (tag.batchId) {
    parts.push(sql`(${col("tag_id")} IS NULL AND ${col("batch_id")} = ${tag.batchId} AND ${col("kit_id")} IS NULL)`);
  }
  if (withCodes) {
    parts.push(sql`(${col("tag_id")} IS NULL AND jsonb_exists(${col("metadata")}->'codes', ${tag.publicCode}))`);
  }
  return sql`(${sql.join(parts, sql` OR `)})`;
}

export async function listJourneyEntries(filters: JourneyFilters): Promise<TagJourneyEntryItem[]> {
  const where: SQL[] = [];
  if (filters.tagId) where.push(await tagScope("j", filters.tagId, true));
  if (filters.batchId) where.push(sql`j.batch_id = ${filters.batchId}`);
  if (filters.kitId) where.push(sql`j.kit_id = ${filters.kitId}`);
  if (filters.repId !== undefined) where.push(sql`j.rep_id = ${filters.repId}`);
  if (filters.leadId !== undefined) where.push(sql`j.lead_id = ${filters.leadId}`);
  if (filters.planId) where.push(sql`j.plan_id = ${filters.planId}`);
  if (filters.kind) where.push(sql`j.kind = ${filters.kind}`);
  if (!filters.includeArchived) where.push(sql`j.status IN ('active', 'needs_review')`);
  if (filters.before) where.push(sql`j.occurred_at < ${filters.before}`);
  const clause = where.length ? sql.join(where, sql` AND `) : sql`TRUE`;
  return listEntriesWhere(clause, Math.min(Math.max(filters.limit ?? 100, 1), 500));
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export interface PlanInput {
  kind: PlanKind;
  title: string;
  description?: string | null;
  batchId?: string | null;
  tagId?: string | null;
  kitId?: string | null;
  leadId?: number | null;
  status?: PlanStatus;
  dueDate?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PlanPatch {
  title?: string;
  description?: string | null;
  status?: PlanStatus;
  outcome?: string | null;
  dueDate?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PlanFilters {
  /** open = draft/active/paused, closed = the rest, or one exact status. */
  status?: "open" | "closed" | "all" | PlanStatus;
  batchId?: string;
  tagId?: string;
  kitId?: string;
  leadId?: number;
  /** One plan by id (used to show a plan's own story). */
  planId?: string;
  limit?: number;
}

type PlanRow = {
  id: string; kind: string; title: string; description: string | null; batch_id: string | null;
  batch_code: string | null; tag_id: string | null; public_code: string | null; kit_id: string | null;
  lead_id: number | null; lead_name: string | null; status: string; outcome: string | null;
  due_date: string | Date | null; metadata: Record<string, unknown> | null;
  created_at: Date; updated_at: Date; closed_at: Date | null;
};

async function listPlansWhere(where: SQL, limit: number): Promise<TagPlanItem[]> {
  const list = await rows<PlanRow>(sql`
    SELECT p.id, p.kind, p.title, p.description, p.batch_id, b.batch_code, p.tag_id, t.public_code, p.kit_id,
           p.lead_id, l.name AS lead_name, p.status, p.outcome, p.due_date::text AS due_date,
           p.metadata, p.created_at, p.updated_at, p.closed_at
    FROM tag_plans p
    LEFT JOIN tag_batches b ON b.id = p.batch_id
    LEFT JOIN tags t ON t.id = p.tag_id
    LEFT JOIN sales_leads l ON l.id = p.lead_id
    WHERE ${where}
    ORDER BY (p.status IN ('draft', 'active', 'paused')) DESC, p.due_date ASC NULLS LAST, p.created_at DESC
    LIMIT ${limit}
  `);
  return list.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    batchId: r.batch_id,
    batchCode: r.batch_code,
    tagId: r.tag_id,
    publicCode: r.public_code,
    kitId: r.kit_id,
    leadId: r.lead_id,
    leadName: r.lead_name,
    status: r.status,
    outcome: r.outcome,
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    closedAt: iso(r.closed_at),
  }));
}

export async function listPlans(filters: PlanFilters): Promise<TagPlanItem[]> {
  const where: SQL[] = [];
  const status = filters.status ?? "open";
  const open = sql.join(OPEN_PLAN_STATUSES.map((s) => sql`${s}`), sql`, `);
  if (status === "open") where.push(sql`p.status IN (${open})`);
  else if (status === "closed") where.push(sql`p.status NOT IN (${open})`);
  else if (status !== "all") where.push(sql`p.status = ${status}`);
  if (filters.tagId) where.push(await tagScope("p", filters.tagId, false));
  if (filters.batchId) where.push(sql`p.batch_id = ${filters.batchId}`);
  if (filters.kitId) where.push(sql`p.kit_id = ${filters.kitId}`);
  if (filters.leadId !== undefined) where.push(sql`p.lead_id = ${filters.leadId}`);
  if (filters.planId) where.push(sql`p.id = ${filters.planId}`);
  const clause = where.length ? sql.join(where, sql` AND `) : sql`TRUE`;
  return listPlansWhere(clause, Math.min(Math.max(filters.limit ?? 100, 1), 500));
}

async function planItem(id: string): Promise<TagPlanItem> {
  const [plan] = await listPlansWhere(sql`p.id = ${id}`, 1);
  if (!plan) throw new TagError("Plan not found", 404);
  return plan;
}

const planLabel = (kind: string) => PLAN_KIND_LABELS[kind as PlanKind] ?? "Plan";

export async function createPlan(input: PlanInput, ctx: JourneyContext): Promise<TagPlanItem> {
  let batchId = input.batchId ?? null;
  if (input.tagId && !batchId) {
    const [tag] = await db.select({ batchId: tags.batchId }).from(tags).where(eq(tags.id, input.tagId)).limit(1);
    if (!tag) throw new TagError("Tag not found", 404);
    batchId = tag.batchId;
  }
  const status = input.status ?? "active";
  let plan: TagPlan;
  try {
    [plan] = await db
      .insert(tagPlans)
      .values({
        kind: input.kind,
        title: input.title,
        description: input.description ?? null,
        batchId,
        tagId: input.tagId ?? null,
        kitId: input.kitId ?? null,
        leadId: input.leadId ?? null,
        status,
        dueDate: input.dueDate ?? null,
        metadata: input.metadata ?? {},
        createdByUserId: ctx.userId,
        closedAt: isClosedPlanStatus(status) ? new Date() : null,
      })
      .returning();
  } catch (err) {
    if (pgError(err).code === "23503") {
      throw new TagError("The batch, tag, kit or customer referenced does not exist", 404);
    }
    throw err;
  }
  await recordJourney({
    kind: "decision",
    action: "plan_created",
    title: `${planLabel(plan.kind)} planned: ${plan.title}`,
    content: plan.description,
    batchId: plan.batchId,
    tagId: plan.tagId,
    kitId: plan.kitId,
    leadId: plan.leadId,
    planId: plan.id,
  }, ctx);
  return planItem(plan.id);
}

/** Edits a plan; a status change is written to the journey (with the outcome, when closing). */
export async function updatePlan(id: string, patch: PlanPatch, ctx: JourneyContext): Promise<TagPlanItem> {
  const result = await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(tagPlans).where(eq(tagPlans.id, id)).for("update");
    if (!plan) throw new TagError("Plan not found", 404);
    const statusChanged = patch.status !== undefined && patch.status !== plan.status;
    const closing = statusChanged && isClosedPlanStatus(patch.status!);
    const [updated] = await tx
      .update(tagPlans)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata ?? {} } : {}),
        ...(statusChanged ? { status: patch.status, closedAt: closing ? new Date() : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tagPlans.id, id))
      .returning();
    return { before: plan, after: updated, statusChanged };
  });
  if (result.statusChanged) {
    const entry = planStatusEntry(result.after, result.after.status);
    await recordJourney({
      ...entry,
      content: result.after.outcome,
      beforeValue: result.before.status,
      afterValue: result.after.status,
      batchId: result.after.batchId,
      tagId: result.after.tagId,
      kitId: result.after.kitId,
      leadId: result.after.leadId,
      planId: result.after.id,
    }, ctx);
  }
  return planItem(id);
}

// ─── One scope's story ────────────────────────────────────────────────────────

export async function getJourney(filters: JourneyFilters & { planStatus?: PlanFilters["status"] }): Promise<TagJourney> {
  // Plans belong to a batch, tag, kit or lead; they have no reseller, so a
  // reseller-scoped story shows entries only.
  const [entries, plans] = await Promise.all([
    listJourneyEntries(filters),
    filters.repId !== undefined
      ? Promise.resolve([] as TagPlanItem[])
      : listPlans({
          status: filters.planStatus ?? "all",
          batchId: filters.batchId,
          tagId: filters.tagId,
          kitId: filters.kitId,
          leadId: filters.leadId,
          planId: filters.planId,
        }),
  ]);
  return { entries, plans };
}

// ─── References ───────────────────────────────────────────────────────────────

/** A batch by uuid or by its batch code (REV-2026-001), case-insensitive. */
export async function resolveBatchId(ref: string): Promise<string> {
  const value = ref.trim();
  const [batch] = await db
    .select({ id: tagBatches.id })
    .from(tagBatches)
    .where(UUID.test(value) ? eq(tagBatches.id, value) : sql`upper(${tagBatches.batchCode}) = ${value.toUpperCase()}`)
    .limit(1);
  if (!batch) throw new TagError("No batch with that id or code", 404);
  return batch.id;
}

/** A tag by uuid or by its printed public code (typo-tolerant: O/0, I/L/1). */
export async function resolveTagId(ref: string): Promise<string> {
  const value = ref.trim();
  const isUuid = UUID.test(value);
  const code = isUuid ? null : normalizeTagCode(value);
  if (!isUuid && !code) throw new TagError("Not a tag id or code", 404);
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(code ? eq(tags.publicCode, code) : eq(tags.id, value))
    .limit(1);
  if (!tag) throw new TagError("No tag with that id or code", 404);
  return tag.id;
}
