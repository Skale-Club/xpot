import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import {
  salesLeads,
  salesReps,
  tagBatches,
  tagDestinationHistory,
  tagEvents,
  tagKits,
  tags,
  type InsertTagEvent,
  type Tag,
} from "#shared/schema.js";
import { buildTagUrls, planTransition, type TagAction, type TagStatus } from "#shared/tags.js";
import { canUseLead, saleCredit, type TagActor } from "#shared/tagAccess.js";
import type {
  LeadTagSummary,
  TagAnalytics,
  TagBatchItem,
  TagDetail,
  TagHistoryEntry,
  TagKitItem,
  TagListItem,
  TagOverview,
  TagRepSummary,
} from "#shared/tagsApi.js";
import { JOURNEY_PRODUCT_LABELS, tagActionEntry, type JourneySource } from "#shared/tagJourney.js";
import { generateUniqueCodes } from "./codes.js";
import { TagError, pgError } from "./errors.js";
import { journeyContext, recordJourney } from "./journey.js";
import type { PublicTag } from "./publicHandler.js";

// TagError and pgError live in ./errors.ts (journey.ts needs them too, and
// the repository imports journey.ts); re-exported so existing imports work.
export { TagError, pgError };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function rows<T>(query: SQL, executor: typeof db | Tx = db): Promise<T[]> {
  const result = await executor.execute(query);
  return result.rows as T[];
}

export const iso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

/** A real interaction: a redirect that was not a bot. */
export const COUNTABLE = sql`e.event_type = 'redirect' AND NOT e.is_bot`;

// ─── Public lookups ───────────────────────────────────────────────────────────

export async function findPublicTagByCode(code: string): Promise<PublicTag | null> {
  const [tag] = await db
    .select({
      id: tags.id,
      publicCode: tags.publicCode,
      leadId: tags.leadId,
      repId: tags.repId,
      status: tags.status,
      destinationUrl: tags.destinationUrl,
      utmEnabled: tags.utmEnabled,
      utmCampaign: tags.utmCampaign,
    })
    .from(tags)
    .where(eq(tags.publicCode, code))
    .limit(1);
  return tag ?? null;
}

export async function recordTagEvent(event: InsertTagEvent): Promise<void> {
  await db.insert(tagEvents).values(event);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export interface TagListFilters {
  status?: string;
  productType?: string;
  leadId?: number;
  batchId?: string;
  /** Only this reseller's pieces (always set for a reseller). */
  repId?: number;
  kitId?: string;
  /** Pieces in house stock (no reseller). */
  house?: boolean;
  method?: "qr" | "nfc";
  search?: string;
  limit?: number;
}

type TagRow = {
  id: string;
  public_code: string;
  serial_number: number | null;
  product_type: string;
  status: string;
  nfc_provisioning_status: string;
  label: string | null;
  destination_type: string | null;
  destination_url: string | null;
  lead_id: number | null;
  lead_name: string | null;
  rep_id: number | null;
  rep_name: string | null;
  kit_id: string | null;
  batch_id: string | null;
  batch_code: string | null;
  qr: number;
  nfc: number;
  last_interaction_at: Date | null;
  activated_at: Date | null;
  sold_at: Date | null;
  created_at: Date;
};

function toListItem(r: TagRow): TagListItem {
  return {
    id: r.id,
    publicCode: r.public_code,
    serialNumber: r.serial_number,
    productType: r.product_type,
    status: r.status,
    nfcStatus: r.nfc_provisioning_status,
    label: r.label,
    destinationType: r.destination_type,
    destinationUrl: r.destination_url,
    leadId: r.lead_id,
    leadName: r.lead_name,
    repId: r.rep_id,
    repName: r.rep_name,
    kitId: r.kit_id,
    batchId: r.batch_id,
    batchCode: r.batch_code,
    qrInteractions: Number(r.qr ?? 0),
    nfcInteractions: Number(r.nfc ?? 0),
    lastInteractionAt: iso(r.last_interaction_at),
    activatedAt: iso(r.activated_at),
    soldAt: iso(r.sold_at),
    createdAt: iso(r.created_at)!,
  };
}

function tagListQuery(where: SQL, limit: number): SQL {
  return sql`
    SELECT t.id, t.public_code, t.serial_number, t.product_type, t.status, t.nfc_provisioning_status, t.label,
           t.destination_type, t.destination_url, t.lead_id, l.name AS lead_name, t.rep_id, r.display_name AS rep_name,
           t.kit_id, t.batch_id, b.batch_code, t.activated_at, t.sold_at, t.created_at,
           COALESCE(s.qr, 0)::int AS qr, COALESCE(s.nfc, 0)::int AS nfc, s.last_interaction_at
    FROM tags t
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.access_method = 'qr') AS qr,
             count(*) FILTER (WHERE e.access_method = 'nfc') AS nfc,
             max(e.occurred_at) AS last_interaction_at
      FROM tag_events e
      WHERE e.tag_id = t.id AND ${COUNTABLE}
    ) s ON true
    WHERE ${where}
    ORDER BY t.batch_id NULLS LAST, t.serial_number NULLS LAST, t.created_at DESC
    LIMIT ${limit}
  `;
}

export async function listTags(filters: TagListFilters): Promise<TagListItem[]> {
  const conds: SQL[] = [sql`true`];
  if (filters.status) conds.push(sql`t.status = ${filters.status}`);
  if (filters.productType) conds.push(sql`t.product_type = ${filters.productType}`);
  if (filters.leadId !== undefined) conds.push(sql`t.lead_id = ${filters.leadId}`);
  if (filters.batchId) conds.push(sql`t.batch_id = ${filters.batchId}`);
  if (filters.repId !== undefined) conds.push(sql`t.rep_id = ${filters.repId}`);
  if (filters.kitId) conds.push(sql`t.kit_id = ${filters.kitId}`);
  if (filters.house) conds.push(sql`t.rep_id IS NULL`);
  if (filters.method === "qr") conds.push(sql`COALESCE(s.qr, 0) > 0`);
  if (filters.method === "nfc") conds.push(sql`COALESCE(s.nfc, 0) > 0`);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(t.public_code ILIKE ${term} OR l.name ILIKE ${term} OR t.label ILIKE ${term} OR b.batch_code ILIKE ${term})`);
  }
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);
  return (await rows<TagRow>(tagListQuery(sql.join(conds, sql` AND `), limit))).map(toListItem);
}

export async function getTagRow(id: string): Promise<Tag | null> {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  return tag ?? null;
}

export async function getTagByCode(code: string): Promise<Tag | null> {
  const [tag] = await db.select().from(tags).where(eq(tags.publicCode, code)).limit(1);
  return tag ?? null;
}

async function historyFor(where: SQL, limit: number): Promise<Array<TagHistoryEntry & { tagId: string; publicCode: string }>> {
  const list = await rows<{
    id: string; tag_id: string; public_code: string; previous_url: string | null; new_url: string | null;
    previous_destination_type: string | null; new_destination_type: string | null;
    changed_by_user_id: string | null; changed_by_email: string | null; reason: string | null; created_at: Date;
  }>(sql`
    SELECT h.id, h.tag_id, t.public_code, h.previous_url, h.new_url, h.previous_destination_type,
           h.new_destination_type, h.changed_by_user_id, u.email AS changed_by_email, h.reason, h.created_at
    FROM tag_destination_history h
    JOIN tags t ON t.id = h.tag_id
    LEFT JOIN users u ON u.id = h.changed_by_user_id
    WHERE ${where}
    ORDER BY h.created_at DESC
    LIMIT ${limit}
  `);
  return list.map((h) => ({
    id: h.id,
    tagId: h.tag_id,
    publicCode: h.public_code,
    previousUrl: h.previous_url,
    newUrl: h.new_url,
    previousDestinationType: h.previous_destination_type,
    newDestinationType: h.new_destination_type,
    changedByUserId: h.changed_by_user_id,
    changedByEmail: h.changed_by_email,
    reason: h.reason,
    createdAt: iso(h.created_at)!,
  }));
}

export async function getTagDetail(id: string, baseUrl: string): Promise<TagDetail | null> {
  const tag = await getTagRow(id);
  if (!tag) return null;
  const [item] = (await rows<TagRow>(tagListQuery(sql`t.id = ${id}`, 1))).map(toListItem);
  const history = await historyFor(sql`h.tag_id = ${id}`, 100);
  return {
    ...item,
    utmEnabled: tag.utmEnabled,
    utmCampaign: tag.utmCampaign,
    metadata: tag.metadata ?? null,
    assignedAt: iso(tag.assignedAt),
    disabledAt: iso(tag.disabledAt),
    updatedAt: iso(tag.updatedAt)!,
    ...buildTagUrls(baseUrl, tag.publicCode),
    history: history.map(({ tagId: _t, publicCode: _p, ...h }) => h),
  };
}

export async function lockTag(tx: Tx, id: string): Promise<Tag> {
  const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
  if (!tag) throw new TagError("Tag not found", 404);
  return tag;
}

export async function writeHistory(
  tx: Tx,
  before: Pick<Tag, "id" | "destinationUrl" | "destinationType">,
  after: { destinationUrl: string | null; destinationType: string | null },
  userId: string | null,
  reason: string | null,
) {
  if (before.destinationUrl === after.destinationUrl && before.destinationType === after.destinationType) return;
  await tx.insert(tagDestinationHistory).values({
    tagId: before.id,
    previousUrl: before.destinationUrl,
    newUrl: after.destinationUrl,
    previousDestinationType: before.destinationType,
    newDestinationType: after.destinationType,
    changedByUserId: userId,
    reason,
  });
}

export interface TagUpdate {
  label?: string | null;
  productType?: string;
  destinationType?: string | null;
  destinationUrl?: string | null;
  utmEnabled?: boolean;
  utmCampaign?: string | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Edits a tag (admin); any destination change is written to the immutable history. */
export async function updateTag(id: string, patch: TagUpdate, userId: string | null, source: JourneySource = "admin"): Promise<Tag> {
  let before: Tag | null = null;
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    before = tag;
    if (tag.status === "retired") throw new TagError("A retired tag cannot be edited");
    const next = {
      destinationUrl: patch.destinationUrl !== undefined ? patch.destinationUrl : tag.destinationUrl,
      destinationType: patch.destinationType !== undefined ? patch.destinationType : tag.destinationType,
    };
    if (tag.status === "active" && (!next.destinationUrl || !next.destinationType)) {
      throw new TagError("An active tag must keep a destination; disable it first");
    }
    if (patch.productType && patch.productType !== tag.productType && tag.status !== "inventory") {
      throw new TagError("Product type can only change while the tag is in inventory");
    }
    await writeHistory(tx, tag, next, userId, patch.reason ?? null);
    const [updated] = await tx
      .update(tags)
      .set({
        ...next,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.productType ? { productType: patch.productType } : {}),
        ...(patch.utmEnabled !== undefined ? { utmEnabled: patch.utmEnabled } : {}),
        ...(patch.utmCampaign !== undefined ? { utmCampaign: patch.utmCampaign } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning();
    return updated;
  });
  const old = before as Tag | null;
  if (old && (old.destinationUrl !== updated.destinationUrl || old.destinationType !== updated.destinationType)) {
    await recordJourney({
      kind: "execution",
      action: "destination_changed",
      title: `Destination of ${updated.publicCode} changed`,
      content: patch.reason ?? null,
      tagId: id,
      beforeValue: old.destinationUrl,
      afterValue: updated.destinationUrl,
      metadata: { previousType: old.destinationType, newType: updated.destinationType },
    }, journeyContext(userId, source));
  }
  return updated;
}

/**
 * Runs one lifecycle action under a row lock. The state machine lives in
 * shared/tags.ts (planTransition) so the app and server agree on it.
 */
export async function transitionTag(
  id: string,
  action: Exclude<TagAction, "assign">,
  actor: Pick<TagActor, "userId" | "repId">,
  reason?: string | null,
  source: JourneySource = "admin",
): Promise<Tag> {
  let fromStatus = "";
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    fromStatus = tag.status;
    const plan = planTransition(tag, action);
    if (!plan.ok) throw new TagError(plan.error, 409);
    const now = new Date();
    const set: Partial<Tag> = { status: plan.status, updatedAt: now };
    if (action === "activate") {
      Object.assign(set, { activatedAt: now, activatedByRepId: actor.repId, disabledAt: null, ...saleCredit(tag, actor.repId, now) });
    }
    if (action === "disable") set.disabledAt = now;
    if (action === "retire") set.disabledAt = tag.disabledAt ?? now;
    if (action === "unassign") {
      // Back to unsold stock in the same hands: the previous customer's
      // destination must not follow the piece, and the sale is undone.
      Object.assign(set, {
        leadId: null, destinationUrl: null, destinationType: null, utmEnabled: false, utmCampaign: null,
        assignedAt: null, activatedAt: null, disabledAt: null, soldAt: null, activatedByRepId: null,
      });
      await writeHistory(tx, tag, { destinationUrl: null, destinationType: null }, actor.userId, reason ?? "Unassigned");
    }
    const [updated] = await tx.update(tags).set(set).where(eq(tags.id, id)).returning();
    console.log(`[tags] ${action} ${tag.publicCode}: ${tag.status} → ${plan.status} (user ${actor.userId})`);
    return updated;
  });
  const entry = tagActionEntry(action, updated.publicCode, fromStatus, updated.status);
  await recordJourney({
    kind: "execution",
    action: entry.action,
    title: entry.title,
    content: reason ?? null,
    tagId: id,
    beforeValue: entry.before,
    afterValue: entry.after,
  }, journeyContext(actor.userId, source, actor.repId));
  return updated;
}

/** Admin: link a piece to a customer (lead) without activating it. */
/**
 * Admin: give a piece to a customer, an existing lead or a new business by
 * name. A new lead belongs to the reseller holding the piece (else the admin).
 */
export async function assignTag(
  id: string,
  target: { leadId?: number; leadName?: string },
  userId: string | null,
  actorRepId: number,
  source: JourneySource = "admin",
): Promise<Tag> {
  let fromStatus = "";
  let leadLabel = "";
  let newLead = false;
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    fromStatus = tag.status;
    const plan = planTransition(tag, "assign");
    if (!plan.ok) throw new TagError(plan.error, 409);
    let leadId: number;
    if (target.leadId) {
      const [lead] = await tx.select({ id: salesLeads.id, name: salesLeads.name }).from(salesLeads).where(eq(salesLeads.id, target.leadId));
      if (!lead) throw new TagError("Customer not found", 404);
      leadId = lead.id;
      leadLabel = lead.name;
    } else if (target.leadName?.trim()) {
      // Checked before creating anything, so a refused move leaves no orphan lead.
      if (tag.leadId && tag.status === "active") throw new TagError("Disable the tag before moving it to another customer", 409);
      leadId = await createLeadForSale(tx, target.leadName.trim(), tag.repId ?? actorRepId);
      leadLabel = target.leadName.trim();
      newLead = true;
    } else {
      throw new TagError("Choose the customer", 400);
    }
    const changingOwner = tag.leadId !== leadId;
    const set: Partial<Tag> = {
      leadId,
      status: plan.status,
      assignedAt: changingOwner || !tag.assignedAt ? new Date() : tag.assignedAt,
      updatedAt: new Date(),
    };
    // A new owner never inherits the old owner's destination.
    if (changingOwner && tag.leadId && (tag.destinationUrl || tag.destinationType)) {
      if (tag.status === "active") throw new TagError("Disable the tag before moving it to another customer", 409);
      Object.assign(set, { destinationUrl: null, destinationType: null, utmEnabled: false, utmCampaign: null });
      await writeHistory(tx, tag, { destinationUrl: null, destinationType: null }, userId, "Re-assigned to another customer");
    }
    const [updated] = await tx.update(tags).set(set).where(eq(tags.id, id)).returning();
    console.log(`[tags] assign ${tag.publicCode} → lead ${leadId} (user ${userId ?? "?"})`);
    return updated;
  });
  const entry = tagActionEntry("assign", updated.publicCode, fromStatus, updated.status, `to ${leadLabel}`);
  await recordJourney({
    kind: "execution",
    action: entry.action,
    title: entry.title,
    tagId: id,
    leadId: updated.leadId,
    beforeValue: entry.before,
    afterValue: entry.after,
    metadata: newLead ? { newLead: true } : {},
  }, journeyContext(userId, source, actorRepId));
  return updated;
}

/** Admin: one standalone piece (not part of a manufacturing batch), in house stock. */
export async function createSingleTag(
  input: { productType: string; label?: string | null },
  userId: string | null = null,
  source: JourneySource = "admin",
): Promise<Tag> {
  const [code] = await generateUniqueCodes(1, findExistingCodes);
  const [tag] = await db
    .insert(tags)
    .values({ publicCode: code, productType: input.productType, label: input.label ?? null, status: "inventory" })
    .returning();
  console.log(`[tags] created standalone tag ${code}`);
  await recordJourney({
    kind: "execution",
    action: "tag_created",
    title: `Tag ${code} created (${JOURNEY_PRODUCT_LABELS[input.productType] ?? input.productType})`,
    content: input.label ?? null,
    tagId: tag.id,
    afterValue: tag.status,
    metadata: { productType: input.productType },
  }, journeyContext(userId, source));
  return tag;
}

async function findExistingCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const found = await db.select({ code: tags.publicCode }).from(tags).where(inArray(tags.publicCode, codes));
  return new Set(found.map((r) => r.code));
}

/** Admin: move a piece (and, if sold, its sale credit) to another reseller or back to the house. */
export async function setTagRep(id: string, repId: number | null, userId: string | null, source: JourneySource = "admin"): Promise<Tag> {
  let previous: { repId: number | null; name: string } = { repId: null, name: "house" };
  let next = "house";
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    const names = async (rid: number | null) =>
      rid === null ? "house" : (await tx.select({ n: salesReps.displayName }).from(salesReps).where(eq(salesReps.id, rid)))[0]?.n ?? `rep ${rid}`;
    previous = { repId: tag.repId, name: await names(tag.repId) };
    next = await names(repId);
    const [updated] = await tx
      .update(tags)
      .set({ repId, kitId: repId === tag.repId ? tag.kitId : null, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    console.log(`[tags] ${tag.publicCode} reseller ${tag.repId ?? "house"} → ${repId ?? "house"} (user ${userId ?? "?"})`);
    return updated;
  });
  if (previous.repId !== repId) {
    await recordJourney({
      kind: "execution",
      action: "reseller_changed",
      title: `Tag ${updated.publicCode} moved from ${previous.name} to ${next}`,
      tagId: id,
      repId,
      beforeValue: previous.name,
      afterValue: next,
    }, journeyContext(userId, source));
  }
  return updated;
}

// ─── Leads (the businesses pieces are sold to) ────────────────────────────────

/** True when the actor may sell pieces to this lead (see canUseLead). */
export async function leadUsableBy(actor: TagActor, leadId: number, executor: typeof db | Tx = db): Promise<boolean> {
  const [lead] = await executor.select({ ownerRepId: salesLeads.ownerRepId }).from(salesLeads).where(eq(salesLeads.id, leadId));
  return !!lead && canUseLead(actor, lead);
}

/** A business met in the field, created while selling it a piece. */
export async function createLeadForSale(tx: Tx, name: string, ownerRepId: number): Promise<number> {
  const [lead] = await tx
    .insert(salesLeads)
    .values({ name, ownerRepId, source: "tag_sale", status: "customer" })
    .returning({ id: salesLeads.id });
  return lead.id;
}

/** Keep the business's Google Place on the lead the first time a review link reveals it. */
export async function rememberLeadPlace(tx: Tx, leadId: number, placeId: string | null) {
  if (!placeId) return;
  await tx
    .update(salesLeads)
    .set({ googlePlaceId: placeId, updatedAt: new Date() })
    .where(and(eq(salesLeads.id, leadId), isNull(salesLeads.googlePlaceId)));
}

/** A lead that bought a piece is a customer. */
export async function markLeadCustomer(tx: Tx, leadId: number) {
  await tx
    .update(salesLeads)
    .set({ status: "customer", updatedAt: new Date() })
    .where(and(eq(salesLeads.id, leadId), sql`${salesLeads.status} <> 'customer'`));
}

// ─── Kits (pieces handed to a reseller) ───────────────────────────────────────

export interface KitInput {
  repId: number;
  /** Exact pieces, by printed code. */
  codes?: string[];
  /** Or: the next `quantity` house pieces of this batch, by serial. */
  batchId?: string;
  quantity?: number;
  note?: string | null;
}

/**
 * Hands pieces from house stock to a reseller. Only unsold house pieces
 * (inventory, no reseller) can go into a kit; anything else is refused with
 * the offending codes, and nothing is moved.
 */
export async function deliverKit(input: KitInput, userId: string | null, source: JourneySource = "admin"): Promise<TagKitItem> {
  let delivered: Array<{ publicCode: string; batchId: string | null }> = [];
  const kitId = await db.transaction(async (tx) => {
    let picked: Array<{ id: string; publicCode: string; status: string; repId: number | null; batchId: string | null }>;
    if (input.codes?.length) {
      const codes = Array.from(new Set(input.codes));
      picked = await tx
        .select({ id: tags.id, publicCode: tags.publicCode, status: tags.status, repId: tags.repId, batchId: tags.batchId })
        .from(tags)
        .where(inArray(tags.publicCode, codes))
        .for("update");
      const found = new Set(picked.map((t) => t.publicCode));
      const missing = codes.filter((c) => !found.has(c));
      if (missing.length) throw new TagError(`Unknown codes: ${missing.join(", ")}`, 404);
      const unavailable = picked.filter((t) => t.status !== "inventory" || t.repId !== null).map((t) => t.publicCode);
      if (unavailable.length) throw new TagError(`Not in house stock: ${unavailable.join(", ")}`, 409);
    } else if (input.batchId && input.quantity) {
      picked = await tx
        .select({ id: tags.id, publicCode: tags.publicCode, status: tags.status, repId: tags.repId, batchId: tags.batchId })
        .from(tags)
        .where(and(eq(tags.batchId, input.batchId), eq(tags.status, "inventory"), isNull(tags.repId)))
        .orderBy(tags.serialNumber, tags.publicCode)
        .limit(input.quantity)
        .for("update");
      if (picked.length < input.quantity) {
        throw new TagError(`Only ${picked.length} unsold pieces left in house stock for that batch`, 409);
      }
    } else {
      throw new TagError("Choose the pieces: codes, or a batch and a quantity");
    }

    const [kit] = await tx
      .insert(tagKits)
      .values({ repId: input.repId, note: input.note ?? null, createdByUserId: userId })
      .returning({ id: tagKits.id });
    await tx
      .update(tags)
      .set({ repId: input.repId, kitId: kit.id, updatedAt: new Date() })
      .where(inArray(tags.id, picked.map((t) => t.id)));
    console.log(`[tags] kit ${kit.id}: ${picked.length} pieces → rep ${input.repId} (user ${userId ?? "?"})`);
    delivered = picked.map((t) => ({ publicCode: t.publicCode, batchId: t.batchId }));
    return kit.id;
  });
  const [kit] = await listKits({ kitId });
  // One entry for the whole hand-over. It carries the codes it moved, so each
  // piece's own story includes it even after the piece leaves the kit.
  const batchIds = new Set(delivered.map((t) => t.batchId));
  const count = delivered.length;
  await recordJourney({
    kind: "execution",
    action: "kit_delivered",
    title: `Kit of ${count} ${count === 1 ? "piece" : "pieces"} delivered to ${kit.repName ?? `rep ${input.repId}`}`,
    content: input.note ?? null,
    kitId,
    repId: input.repId,
    batchId: batchIds.size === 1 ? Array.from(batchIds)[0] : null,
    metadata: { codes: delivered.map((t) => t.publicCode), count },
  }, journeyContext(userId, source));
  return kit;
}

export async function listKits(filter: { repId?: number; kitId?: string } = {}): Promise<TagKitItem[]> {
  const conds: SQL[] = [sql`true`];
  if (filter.repId !== undefined) conds.push(sql`k.rep_id = ${filter.repId}`);
  if (filter.kitId) conds.push(sql`k.id = ${filter.kitId}`);
  const list = await rows<{
    id: string; rep_id: number; rep_name: string | null; note: string | null; created_at: Date; piece_count: number; unsold_count: number;
  }>(sql`
    SELECT k.id, k.rep_id, r.display_name AS rep_name, k.note, k.created_at,
      count(t.id)::int AS piece_count,
      count(t.id) FILTER (WHERE t.status = 'inventory' AND t.rep_id = k.rep_id)::int AS unsold_count
    FROM tag_kits k
    LEFT JOIN sales_reps r ON r.id = k.rep_id
    LEFT JOIN tags t ON t.kit_id = k.id
    WHERE ${sql.join(conds, sql` AND `)}
    GROUP BY k.id, r.display_name
    ORDER BY k.created_at DESC
  `);
  return list.map((k) => ({
    id: k.id,
    repId: k.rep_id,
    repName: k.rep_name,
    note: k.note,
    createdAt: iso(k.created_at)!,
    pieceCount: Number(k.piece_count),
    unsoldCount: Number(k.unsold_count),
  }));
}

/** Admin: unsold pieces back from a reseller to house stock (kit returned, reseller left). */
/**
 * Unsold pieces a reseller hands back go to house stock. A typo must not pass
 * silently: unknown codes are refused, and pieces already in house stock are
 * reported instead of counted.
 */
export async function returnToHouse(
  codes: string[],
  userId: string | null,
  source: JourneySource = "admin",
): Promise<{ returned: number; alreadyInHouse: string[] }> {
  let moved: Array<{ publicCode: string; repId: number | null; kitId: string | null }> = [];
  const result = await db.transaction(async (tx) => {
    const picked = await tx
      .select({ id: tags.id, publicCode: tags.publicCode, status: tags.status, repId: tags.repId, kitId: tags.kitId })
      .from(tags)
      .where(inArray(tags.publicCode, codes))
      .for("update");
    const found = new Set(picked.map((t) => t.publicCode));
    const missing = codes.filter((c) => !found.has(c));
    if (missing.length) throw new TagError(`Unknown codes: ${missing.join(", ")}`, 404);
    const sold = picked.filter((t) => t.status !== "inventory").map((t) => t.publicCode);
    if (sold.length) throw new TagError(`Already sold, cannot return: ${sold.join(", ")}`, 409);
    const alreadyInHouse = picked.filter((t) => t.repId === null).map((t) => t.publicCode);
    const moving = picked.filter((t) => t.repId !== null);
    if (moving.length) {
      await tx
        .update(tags)
        .set({ repId: null, kitId: null, updatedAt: new Date() })
        .where(inArray(tags.id, moving.map((t) => t.id)));
      console.log(`[tags] ${moving.length} pieces returned to house stock (user ${userId ?? "?"})`);
      moved = moving.map((t) => ({ publicCode: t.publicCode, repId: t.repId, kitId: t.kitId }));
    }
    return { returned: moving.length, alreadyInHouse };
  });
  if (moved.length) {
    const reps = new Set(moved.map((t) => t.repId));
    const kits = new Set(moved.map((t) => t.kitId));
    const repId = reps.size === 1 ? Array.from(reps)[0] : null;
    const [rep] = repId === null ? [] : await db.select({ name: salesReps.displayName }).from(salesReps).where(eq(salesReps.id, repId));
    await recordJourney({
      kind: "execution",
      action: "returned_to_house",
      title: `${moved.length} ${moved.length === 1 ? "piece" : "pieces"} returned to house stock${rep ? ` by ${rep.name}` : ""}`,
      repId,
      // Only a single kit: a batch id here would also make the entry
      // batch-wide for every piece of the batch.
      kitId: kits.size === 1 ? Array.from(kits)[0] : null,
      metadata: { codes: moved.map((t) => t.publicCode), count: moved.length },
    }, journeyContext(userId, source));
  }
  return result;
}

// ─── Batches ──────────────────────────────────────────────────────────────────

const BATCH_PREFIX: Record<string, string> = {
  google_review_sign: "REV",
  business_card: "CARD",
  keychain: "KEY",
  safety_tag: "SAFE",
  menu_tag: "MENU",
  booking_tag: "BOOK",
  custom: "TAG",
};

async function nextBatchCode(productType: string): Promise<string> {
  const prefix = `${BATCH_PREFIX[productType] ?? "TAG"}-${new Date().getUTCFullYear()}-`;
  const [row] = await rows<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM tag_batches WHERE batch_code LIKE ${`${prefix}%`}
  `);
  return `${prefix}${String(Number(row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export interface BatchInput {
  name: string;
  batchCode?: string | null;
  productType: string;
  vendor?: string | null;
  quantity: number;
  notes?: string | null;
  /** Exact codes from already-printed legacy pieces; admin API validates them. */
  publicCodes?: string[];
}

/**
 * Creates the batch and its N house-stock tags in one transaction. Codes are
 * checked against the database before insert; a race that still collides on
 * the unique index rolls the whole batch back and is retried.
 */
export async function createBatch(input: BatchInput, userId: string | null, source: JourneySource = "admin") {
  const batchCode = input.batchCode?.trim() || (await nextBatchCode(input.productType));
  for (let attempt = 1; ; attempt++) {
    const codes = input.publicCodes ?? (await generateUniqueCodes(input.quantity, findExistingCodes));
    if (input.publicCodes) {
      const existing = await findExistingCodes(codes);
      if (existing.size > 0) {
        throw new TagError(`Public codes already exist: ${Array.from(existing).sort().join(", ")}`, 409);
      }
    }
    try {
      const batch = await db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(tagBatches)
          .values({
            batchCode,
            name: input.name,
            productType: input.productType,
            vendor: input.vendor ?? null,
            quantity: input.quantity,
            status: "generated",
            notes: input.notes ?? null,
            createdByUserId: userId,
          })
          .returning();
        await tx.insert(tags).values(
          codes.map((publicCode, index) => ({
            publicCode,
            serialNumber: index + 1,
            batchId: batch.id,
            productType: input.productType,
            status: "inventory",
          })),
        );
        return batch;
      });
      console.log(`[tags] batch ${batch.batchCode} created with ${input.quantity} tags (user ${userId ?? "?"})`);
      await recordJourney({
        kind: "execution",
        action: "batch_created",
        title: `Batch ${batch.batchCode} created: ${input.quantity} × ${JOURNEY_PRODUCT_LABELS[input.productType] ?? input.productType}`,
        content: batch.name,
        batchId: batch.id,
        afterValue: batch.status,
        metadata: { quantity: input.quantity, productType: input.productType, vendor: batch.vendor },
      }, journeyContext(userId, source));
      return batch;
    } catch (err) {
      const pg = pgError(err);
      if (pg.code === "23505" && pg.constraint === "tags_public_code_unique" && attempt < 3) continue;
      if (pg.code === "23505") throw new TagError(`Batch code ${batchCode} already exists`, 409);
      throw err;
    }
  }
}

export async function updateBatch(
  id: string,
  input: Partial<Pick<BatchInput, "name" | "vendor" | "notes">> & { status?: string },
  userId: string | null = null,
  source: JourneySource = "admin",
) {
  const [previous] = await db.select({ status: tagBatches.status }).from(tagBatches).where(eq(tagBatches.id, id)).limit(1);
  if (!previous) throw new TagError("Batch not found", 404);
  const [batch] = await db
    .update(tagBatches)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(tagBatches.id, id))
    .returning();
  if (!batch) throw new TagError("Batch not found", 404);
  if (input.status && input.status !== previous.status) {
    await recordJourney({
      kind: "execution",
      action: "batch_status_changed",
      title: `Batch ${batch.batchCode} ${input.status}`,
      batchId: id,
      beforeValue: previous.status,
      afterValue: batch.status,
    }, journeyContext(userId, source));
  }
  return batch;
}

export async function listBatches(): Promise<TagBatchItem[]> {
  const list = await rows<{
    id: string; batch_code: string; name: string; product_type: string; vendor: string | null; quantity: number;
    status: string; notes: string | null; created_at: Date; tag_count: number; house_count: number;
    with_resellers_count: number; active_count: number; nfc_verified_count: number;
  }>(sql`
    SELECT b.id, b.batch_code, b.name, b.product_type, b.vendor, b.quantity, b.status, b.notes, b.created_at,
      count(t.id)::int AS tag_count,
      count(t.id) FILTER (WHERE t.status = 'inventory' AND t.rep_id IS NULL)::int AS house_count,
      count(t.id) FILTER (WHERE t.rep_id IS NOT NULL)::int AS with_resellers_count,
      count(t.id) FILTER (WHERE t.status = 'active')::int AS active_count,
      count(t.id) FILTER (WHERE t.nfc_provisioning_status IN ('verified', 'locked'))::int AS nfc_verified_count
    FROM tag_batches b
    LEFT JOIN tags t ON t.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `);
  return list.map((b) => ({
    id: b.id,
    batchCode: b.batch_code,
    name: b.name,
    productType: b.product_type,
    vendor: b.vendor,
    quantity: b.quantity,
    status: b.status,
    notes: b.notes,
    createdAt: iso(b.created_at)!,
    tagCount: Number(b.tag_count),
    houseCount: Number(b.house_count),
    withResellersCount: Number(b.with_resellers_count),
    activeCount: Number(b.active_count),
    nfcVerifiedCount: Number(b.nfc_verified_count),
  }));
}

export async function getBatch(id: string) {
  const [batch] = await db.select().from(tagBatches).where(eq(tagBatches.id, id)).limit(1);
  return batch ?? null;
}

export async function getBatchTagsForExport(batchId: string) {
  return db
    .select({ publicCode: tags.publicCode, serialNumber: tags.serialNumber })
    .from(tags)
    .where(eq(tags.batchId, batchId))
    .orderBy(tags.serialNumber, tags.publicCode);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsScope {
  tagId?: string;
  leadId?: number;
  batchId?: string;
  productType?: string;
  /** Pieces this reseller held when scanned (a reseller only ever sees their own). */
  repId?: number;
}

function scopeSql(scope: AnalyticsScope): SQL {
  const conds: SQL[] = [sql`true`];
  if (scope.tagId) conds.push(sql`e.tag_id = ${scope.tagId}`);
  // Customer/reseller analytics follow who owned the piece at event time.
  if (scope.leadId !== undefined) conds.push(sql`e.lead_id = ${scope.leadId}`);
  if (scope.repId !== undefined) conds.push(sql`e.rep_id = ${scope.repId}`);
  if (scope.batchId) conds.push(sql`t.batch_id = ${scope.batchId}`);
  if (scope.productType) conds.push(sql`t.product_type = ${scope.productType}`);
  return sql.join(conds, sql` AND `);
}

export async function getAnalytics(scope: AnalyticsScope, from: Date, to: Date): Promise<TagAnalytics> {
  const where = sql`${scopeSql(scope)} AND e.occurred_at >= ${from} AND e.occurred_at < ${to}`;
  const base = sql`FROM tag_events e JOIN tags t ON t.id = e.tag_id WHERE ${where}`;

  const [totals] = await rows<{
    interactions: number; qr: number; nfc: number; approx_unique: number; last_at: Date | null;
    bot_hits: number; inactive_scans: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE ${COUNTABLE})::int AS interactions,
      count(*) FILTER (WHERE ${COUNTABLE} AND e.access_method = 'qr')::int AS qr,
      count(*) FILTER (WHERE ${COUNTABLE} AND e.access_method = 'nfc')::int AS nfc,
      count(DISTINCT (e.tag_id, e.visitor_day_key)) FILTER (WHERE ${COUNTABLE})::int AS approx_unique,
      max(e.occurred_at) FILTER (WHERE ${COUNTABLE}) AS last_at,
      count(*) FILTER (WHERE e.is_bot)::int AS bot_hits,
      count(*) FILTER (WHERE e.event_type <> 'redirect' AND NOT e.is_bot)::int AS inactive_scans
    ${base}
  `);

  const daily = await rows<{ day: string; qr: number; nfc: number; approx_unique: number }>(sql`
    SELECT to_char(date_trunc('day', e.occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
      count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc,
      count(DISTINCT (e.tag_id, e.visitor_day_key))::int AS approx_unique
    ${base} AND ${COUNTABLE}
    GROUP BY 1 ORDER BY 1
  `);

  const devices = await rows<{ device_type: string | null; count: number }>(sql`
    SELECT e.device_type, count(*)::int AS count ${base} AND ${COUNTABLE}
    GROUP BY 1 ORDER BY 2 DESC
  `);

  const topTags = scope.tagId ? [] : await rows<{
    id: string; public_code: string; lead_name: string | null; rep_name: string | null; qr: number; nfc: number;
  }>(sql`
    SELECT t.id, t.public_code, l.name AS lead_name, r.display_name AS rep_name,
      count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
      count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
    FROM tag_events e
    JOIN tags t ON t.id = e.tag_id
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    WHERE ${where} AND ${COUNTABLE}
    GROUP BY t.id, t.public_code, l.name, r.display_name
    ORDER BY count(*) DESC
    LIMIT 10
  `);

  // Fill missing days so charts show gaps as zero.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const points: TagAnalytics["daily"] = [];
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let d = start; d < to && points.length < 400; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    points.push({ day: key, qr: Number(hit?.qr ?? 0), nfc: Number(hit?.nfc ?? 0), approxUnique: Number(hit?.approx_unique ?? 0) });
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      interactions: Number(totals?.interactions ?? 0),
      qr: Number(totals?.qr ?? 0),
      nfc: Number(totals?.nfc ?? 0),
      approxUnique: Number(totals?.approx_unique ?? 0),
      lastInteractionAt: iso(totals?.last_at),
      botHits: Number(totals?.bot_hits ?? 0),
      inactiveScans: Number(totals?.inactive_scans ?? 0),
    },
    daily: points,
    devices: devices.map((d) => ({ deviceType: d.device_type ?? "unknown", count: Number(d.count) })),
    topTags: topTags.map((t) => ({
      id: t.id, publicCode: t.public_code, leadName: t.lead_name, repName: t.rep_name, qr: Number(t.qr), nfc: Number(t.nfc),
    })),
  };
}

export async function getOverview(now: Date = new Date()): Promise<TagOverview> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  const statusRows = await rows<{ status: string; count: number; house: number }>(sql`
    SELECT status, count(*)::int AS count, count(*) FILTER (WHERE rep_id IS NULL)::int AS house
    FROM tags GROUP BY status
  `);
  const counts: TagOverview["counts"] = { total: 0, inventory: 0, assigned: 0, active: 0, disabled: 0, retired: 0 };
  const stock = { house: 0, withResellers: 0 };
  for (const r of statusRows) {
    counts.total += Number(r.count);
    if (r.status in counts) counts[r.status as TagStatus] = Number(r.count);
    if (r.status === "inventory") {
      stock.house = Number(r.house);
      stock.withResellers = Number(r.count) - Number(r.house);
    }
  }

  const [m] = await rows<{ today: number; last7: number; last30: number; qr30: number; nfc30: number; unique30: number }>(sql`
    SELECT
      count(*) FILTER (WHERE e.occurred_at >= ${dayStart})::int AS today,
      count(*) FILTER (WHERE e.occurred_at >= ${since7})::int AS last7,
      count(*)::int AS last30,
      count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr30,
      count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc30,
      count(DISTINCT (e.tag_id, e.visitor_day_key))::int AS unique30
    FROM tag_events e
    WHERE e.occurred_at >= ${since30} AND ${COUNTABLE}
  `);

  const recentEvents = await rows<{
    id: number; tag_id: string; public_code: string; lead_name: string | null; access_method: string;
    event_type: string; device_type: string | null; occurred_at: Date;
  }>(sql`
    SELECT e.id, e.tag_id, t.public_code, l.name AS lead_name, e.access_method, e.event_type,
           e.device_type, e.occurred_at
    FROM tag_events e
    JOIN tags t ON t.id = e.tag_id
    LEFT JOIN sales_leads l ON l.id = e.lead_id
    WHERE NOT e.is_bot
    ORDER BY e.occurred_at DESC
    LIMIT 15
  `);

  const recentActivations = await rows<{ id: string; public_code: string; lead_name: string | null; rep_name: string | null; activated_at: Date }>(sql`
    SELECT t.id, t.public_code, l.name AS lead_name, r.display_name AS rep_name, t.activated_at
    FROM tags t
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    WHERE t.status = 'active' AND t.activated_at IS NOT NULL
    ORDER BY t.activated_at DESC
    LIMIT 5
  `);

  return {
    counts,
    stock,
    interactions: { today: Number(m?.today ?? 0), last7: Number(m?.last7 ?? 0), last30: Number(m?.last30 ?? 0) },
    split30: { qr: Number(m?.qr30 ?? 0), nfc: Number(m?.nfc30 ?? 0) },
    approxUnique30: Number(m?.unique30 ?? 0),
    recentEvents: recentEvents.map((e) => ({
      id: Number(e.id),
      tagId: e.tag_id,
      publicCode: e.public_code,
      leadName: e.lead_name,
      accessMethod: e.access_method,
      eventType: e.event_type,
      deviceType: e.device_type,
      occurredAt: iso(e.occurred_at)!,
    })),
    recentActivations: recentActivations.map((a) => ({
      id: a.id, publicCode: a.public_code, leadName: a.lead_name, repName: a.rep_name, activatedAt: iso(a.activated_at)!,
    })),
    recentChanges: await historyFor(sql`true`, 10),
  };
}

/** The field app's home numbers for one reseller. */
/**
 * Pieces per customer, for the Visits side's customer cards. A reseller counts
 * only the pieces they hold; managers count every piece.
 */
export async function getLeadTagSummaries(actor: TagActor, now: Date = new Date()): Promise<LeadTagSummary[]> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const scope = actor.isManager ? sql`true` : sql`t.rep_id = ${actor.repId}`;
  const list = await rows<{ lead_id: number; pieces: number; live: number; scans30: number }>(sql`
    SELECT t.lead_id,
           count(*)::int AS pieces,
           count(*) FILTER (WHERE t.status = 'active')::int AS live,
           COALESCE(sum(s.n), 0)::int AS scans30
    FROM tags t
    LEFT JOIN LATERAL (
      SELECT count(*) AS n FROM tag_events e
      WHERE e.tag_id = t.id AND e.occurred_at >= ${since30} AND ${COUNTABLE}
    ) s ON true
    WHERE t.lead_id IS NOT NULL AND ${scope}
    GROUP BY t.lead_id
  `);
  return list.map((r) => ({ leadId: r.lead_id, pieces: r.pieces, live: r.live, scansLast30: r.scans30 }));
}

export async function getRepSummary(repId: number, now: Date = new Date()): Promise<TagRepSummary> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [t] = await rows<{ in_stock: number; active: number; sold30: number }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'inventory')::int AS in_stock,
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE sold_at >= ${since30})::int AS sold30
    FROM tags WHERE rep_id = ${repId}
  `);
  const [e] = await rows<{ qr: number; nfc: number }>(sql`
    SELECT count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
           count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
    FROM tag_events e
    WHERE e.rep_id = ${repId} AND e.occurred_at >= ${since30} AND ${COUNTABLE}
  `);
  return {
    inStock: Number(t?.in_stock ?? 0),
    active: Number(t?.active ?? 0),
    soldLast30: Number(t?.sold30 ?? 0),
    scansLast30: { qr: Number(e?.qr ?? 0), nfc: Number(e?.nfc ?? 0) },
  };
}

