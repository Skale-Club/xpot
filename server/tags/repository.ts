import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import {
  salesLeads,
  salesProducts,
  salesReps,
  salesSaleTags,
  tagAcquisitionLines,
  tagAcquisitionUnits,
  tagAcquisitions,
  tagBatches,
  tagDestinationHistory,
  tagEvents,
  tagKitItems,
  tagKits,
  tagStockMovements,
  tags,
  type InsertTagEvent,
  type Tag,
} from "#shared/schema.js";
import { batchStage, buildTagUrls, planTransition, type TagAction, type TagStatus } from "#shared/tags.js";
import { activationCredit, canUseLead, type TagActor } from "#shared/tagAccess.js";
import { custodyActions, type PieceCustodyActions } from "#shared/tagCustody.js";
import { companyOrganizationId, organizationIdForRep } from "../organizations/service.js";
import type {
  LeadTagSummary,
  TagAnalytics,
  TagBatchItem,
  TagBatchOption,
  TagDetail,
  TagHistoryEntry,
  TagKitItem,
  TagKitPiece,
  TagLimitedView,
  TagListItem,
  TagOverview,
  TagDashboard,
} from "#shared/tagsApi.js";
import { JOURNEY_PRODUCT_LABELS, tagActionEntry, type JourneySource } from "#shared/tagJourney.js";
import { resolveTagFace } from "#shared/tagFace.js";
import type { TagStockMetric } from "#shared/tagMetrics.js";
import { kitCode } from "#shared/tagKits.js";
import { tagSystemReason } from "#shared/tagReasons.js";
import { checkCodes, handOutBlocker, takeBackBlocker, type DistributionCheck, type DistributionPiece } from "#shared/tagDistribution.js";
import type { TagPieceQueue } from "#shared/tagQueues.js";
import { parseTagIntakeScan } from "#shared/tagIntake.js";
import { generateUniqueCodes } from "./codes.js";
import { TagError, pgError, tagErrorBody } from "./errors.js";
import { journeyContext, recordJourney } from "./journey.js";
import { countMetricSql, stockMetricSql } from "./metrics.js";
import { countQueueSql, pieceQueueSql } from "./queues.js";
import type { PublicTag } from "./publicHandler.js";

// TagError and pgError live in ./errors.ts (journey.ts needs them too, and
// the repository imports journey.ts); re-exported so existing imports work.
export { TagError, pgError, tagErrorBody };

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
  stockStatus?: string;
  productType?: string;
  leadId?: number;
  batchId?: string;
  /** Only this reseller's pieces (always set for a reseller). */
  repId?: number;
  kitId?: string;
  /** Only this organization's pieces (tags.organization_id). */
  organizationId?: number;
  /** Only pieces of these organizations; empty means none (a reseller's active memberships). */
  organizationIds?: readonly number[];
  /** Pieces in house stock (no reseller). */
  house?: boolean;
  /** Only pieces counted by this stock number (shared/tagMetrics.ts), e.g. `house` for the company stock card. */
  metric?: TagStockMetric;
  /** Only pieces in this Overview "Needs action" queue (shared/tagQueues.ts). */
  queue?: TagPieceQueue;
  method?: "qr" | "nfc";
  search?: string;
  limit?: number;
  /** Rows to skip, for "load more"; the order ends on t.id so pages never overlap. */
  offset?: number;
}

type TagRow = {
  id: string;
  public_code: string;
  serial_number: number | null;
  product_type: string;
  sales_product_id: number | null;
  acquisition_cost_cents: number | null;
  face: string | null;
  batch_face: string | null;
  status: string;
  stock_status: string;
  ownership_type: string;
  custodian_rep_id: number | null;
  internal_use_note: string | null;
  nfc_provisioning_status: string;
  label: string | null;
  destination_type: string | null;
  destination_url: string | null;
  lead_id: number | null;
  lead_name: string | null;
  rep_id: number | null;
  rep_name: string | null;
  kit_id: string | null;
  kit_number: number | null;
  batch_id: string | null;
  batch_code: string | null;
  qr: number;
  nfc: number;
  last_interaction_at: Date | null;
  activated_at: Date | null;
  sold_at: Date | null;
  sale_id: number | null;
  sold_price_cents: number | null;
  created_at: Date;
};

/** A piece's printed face from a row carrying face / batch_face / product_type. */
const faceOf = (r: { face: string | null; batch_face: string | null; product_type: string }) =>
  resolveTagFace({ face: r.face, batchFace: r.batch_face, productType: r.product_type });

function toListItem(r: TagRow): TagListItem {
  return {
    id: r.id,
    publicCode: r.public_code,
    serialNumber: r.serial_number,
    productType: r.product_type,
    salesProductId: r.sales_product_id,
    acquisitionCostCents: r.acquisition_cost_cents === null ? null : Number(r.acquisition_cost_cents),
    face: faceOf(r),
    ownFace: r.face,
    status: r.status,
    stockStatus: r.stock_status,
    ownershipType: r.ownership_type,
    custodianRepId: r.custodian_rep_id,
    internalUseNote: r.internal_use_note,
    nfcStatus: r.nfc_provisioning_status,
    label: r.label,
    destinationType: r.destination_type,
    destinationUrl: r.destination_url,
    leadId: r.lead_id,
    leadName: r.lead_name,
    repId: r.rep_id,
    repName: r.rep_name,
    kitId: r.kit_id,
    kitCode: r.kit_number == null ? null : kitCode(Number(r.kit_number)),
    batchId: r.batch_id,
    batchCode: r.batch_code,
    qrInteractions: Number(r.qr ?? 0),
    nfcInteractions: Number(r.nfc ?? 0),
    lastInteractionAt: iso(r.last_interaction_at),
    activatedAt: iso(r.activated_at),
    soldAt: iso(r.sold_at),
    saleId: r.sale_id,
    soldPriceCents: r.sold_price_cents === null ? null : Number(r.sold_price_cents),
    createdAt: iso(r.created_at)!,
  };
}

function tagListQuery(where: SQL, limit: number, offset = 0): SQL {
  return sql`
    SELECT t.id, t.public_code, t.serial_number, t.product_type, COALESCE(t.sales_product_id, b.sales_product_id) AS sales_product_id,
           t.face, b.face AS batch_face, t.status, t.stock_status, t.ownership_type, t.custodian_rep_id,
           t.internal_use_note, t.nfc_provisioning_status, t.label,
           t.destination_type, t.destination_url, t.lead_id, l.name AS lead_name, t.rep_id, r.display_name AS rep_name,
           t.kit_id, k.kit_number, t.batch_id, b.batch_code, t.activated_at, t.sold_at, t.created_at,
           sold.sale_id, sold.net_total_cents AS sold_price_cents, acquired.acquisition_cost_cents,
           COALESCE(s.qr, 0)::int AS qr, COALESCE(s.nfc, 0)::int AS nfc, s.last_interaction_at
    FROM tags t
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN tag_kits k ON k.id = t.kit_id
    LEFT JOIN LATERAL (
      -- A Visits line can carry several pieces: each one is its share.
      SELECT st.sale_id, round(si.net_total_cents::numeric / GREATEST(si.quantity, 1))::int AS net_total_cents
      FROM sales_sale_tags st
      JOIN sales_sale_items si ON si.id = st.sale_item_id
      WHERE st.tag_id = t.id AND st.status = 'active'
      ORDER BY st.sold_at DESC
      LIMIT 1
    ) sold ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(u.override_cost_cents, u.unit_cost_cents)::int AS acquisition_cost_cents
      FROM tag_acquisition_units u
      WHERE u.tag_id = t.id AND u.returned_at IS NULL
      ORDER BY u.assigned_at DESC
      LIMIT 1
    ) acquired ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.access_method = 'qr') AS qr,
             count(*) FILTER (WHERE e.access_method = 'nfc') AS nfc,
             max(e.occurred_at) AS last_interaction_at
      FROM tag_events e
      WHERE e.tag_id = t.id AND ${COUNTABLE}
    ) s ON true
    WHERE ${where}
    ORDER BY t.batch_id NULLS LAST, t.serial_number NULLS LAST, t.created_at DESC, t.id
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function listTags(filters: TagListFilters): Promise<TagListItem[]> {
  const conds: SQL[] = [sql`true`];
  if (filters.status) conds.push(sql`t.status = ${filters.status}`);
  if (filters.stockStatus) conds.push(sql`t.stock_status = ${filters.stockStatus}`);
  if (filters.productType) conds.push(sql`t.product_type = ${filters.productType}`);
  if (filters.leadId !== undefined) conds.push(sql`t.lead_id = ${filters.leadId}`);
  if (filters.batchId) conds.push(sql`t.batch_id = ${filters.batchId}`);
  if (filters.repId !== undefined) conds.push(sql`t.rep_id = ${filters.repId}`);
  if (filters.kitId) conds.push(sql`t.kit_id = ${filters.kitId}`);
  if (filters.organizationId !== undefined) conds.push(sql`t.organization_id = ${filters.organizationId}`);
  if (filters.organizationIds !== undefined) {
    if (!filters.organizationIds.length) return [];
    conds.push(sql`t.organization_id IN (${sql.join(filters.organizationIds.map((id) => sql`${id}`), sql`, `)})`);
  }
  if (filters.house) conds.push(sql`t.rep_id IS NULL`);
  if (filters.metric) conds.push(stockMetricSql(filters.metric));
  if (filters.queue) conds.push(pieceQueueSql(filters.queue));
  if (filters.method === "qr") conds.push(sql`COALESCE(s.qr, 0) > 0`);
  if (filters.method === "nfc") conds.push(sql`COALESCE(s.nfc, 0) > 0`);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(t.public_code ILIKE ${term} OR l.name ILIKE ${term} OR t.label ILIKE ${term} OR b.batch_code ILIKE ${term})`);
  }
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 2000);
  const offset = Math.max(filters.offset ?? 0, 0);
  return (await rows<TagRow>(tagListQuery(sql.join(conds, sql` AND `), limit, offset))).map(toListItem);
}

export async function getTagRow(id: string): Promise<Tag | null> {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  return tag ?? null;
}

export async function getTagByCode(code: string): Promise<Tag | null> {
  const [tag] = await db.select().from(tags).where(eq(tags.publicCode, code)).limit(1);
  return tag ?? null;
}

async function historyFor(where: SQL, limit: number): Promise<Array<TagHistoryEntry & {
  tagId: string;
  publicCode: string;
  productType: string;
  face: string | null;
  batchCode: string | null;
}>> {
  const list = await rows<{
    id: string; tag_id: string; public_code: string; product_type: string; face: string | null;
    batch_face: string | null; batch_code: string | null; previous_url: string | null; new_url: string | null;
    previous_destination_type: string | null; new_destination_type: string | null;
    changed_by_user_id: string | null; changed_by_email: string | null; reason: string | null; created_at: Date;
  }>(sql`
    SELECT h.id, h.tag_id, t.public_code, t.product_type, t.face, b.face AS batch_face, b.batch_code,
           h.previous_url, h.new_url, h.previous_destination_type,
           h.new_destination_type, h.changed_by_user_id, u.email AS changed_by_email, h.reason, h.created_at
    FROM tag_destination_history h
    JOIN tags t ON t.id = h.tag_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN users u ON u.id = h.changed_by_user_id
    WHERE ${where}
    ORDER BY h.created_at DESC
    LIMIT ${limit}
  `);
  return list.map((h) => ({
    id: h.id,
    tagId: h.tag_id,
    publicCode: h.public_code,
    productType: h.product_type,
    face: faceOf(h),
    batchCode: h.batch_code,
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

/** What `actor` may do about who holds the piece (shared/tagCustody.ts), from the piece as stored. */
export async function custodyFor(actor: TagActor, tag: Tag, sold: boolean): Promise<PieceCustodyActions | null> {
  const [batch] = tag.batchId
    ? await db.select({ status: tagBatches.status }).from(tagBatches).where(eq(tagBatches.id, tag.batchId)).limit(1)
    : [];
  return custodyActions(actor, { ...tag, sold }, batch?.status ?? null);
}

/** The piece screen's record. Given the viewer, it also says what they may do about its custody. */
export async function getTagDetail(id: string, baseUrl: string, actor?: TagActor): Promise<TagDetail | null> {
  const tag = await getTagRow(id);
  if (!tag) return null;
  const [item] = (await rows<TagRow>(tagListQuery(sql`t.id = ${id}`, 1))).map(toListItem);
  const history = await historyFor(sql`h.tag_id = ${id}`, 100);
  const custody = actor ? await custodyFor(actor, tag, item.saleId !== null) : undefined;
  return {
    ...item,
    utmEnabled: tag.utmEnabled,
    utmCampaign: tag.utmCampaign,
    metadata: tag.metadata ?? null,
    assignedAt: iso(tag.assignedAt),
    disabledAt: iso(tag.disabledAt),
    updatedAt: iso(tag.updatedAt)!,
    ...buildTagUrls(baseUrl, tag.publicCode),
    history: history.map(({ tagId: _t, publicCode: _p, productType: _pt, face: _f, batchCode: _b, ...h }) => h),
    ...(custody !== undefined ? { custody } : {}),
  };
}

/** The piece as a viewer with limited access sees it (TagLimitedView); null when they have none. */
export async function getTagLimitedView(id: string, actor: TagActor): Promise<TagLimitedView | null> {
  const tag = await getTagRow(id);
  if (!tag) return null;
  const [item] = (await rows<TagRow>(tagListQuery(sql`t.id = ${id}`, 1))).map(toListItem);
  const custody = await custodyFor(actor, tag, item.saleId !== null);
  if (!custody) return null;
  return {
    limited: true,
    id: item.id,
    publicCode: item.publicCode,
    productType: item.productType,
    face: item.face,
    batchCode: item.batchCode,
    stockStatus: item.stockStatus,
    repId: item.repId,
    repName: item.repName,
    custody,
  };
}

export async function lockTag(tx: Tx, id: string): Promise<Tag> {
  const [tag] = await tx.select().from(tags).where(eq(tags.id, id)).for("update");
  if (!tag) throw new TagError("Tag not found", 404, "tag_not_found");
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

/** A piece can be sold only as a physical catalog product (server/tags/sales.ts maps each piece to one). */
async function assertPhysicalProduct(executor: typeof db | Tx, productId: number) {
  const [product] = await executor.select({ kind: salesProducts.kind }).from(salesProducts).where(eq(salesProducts.id, productId));
  if (!product || product.kind !== "physical") throw new TagError("Choose a physical product from the sales catalog", 400);
}

export interface TagUpdate {
  label?: string | null;
  productType?: string;
  salesProductId?: number | null;
  /** What is printed on this piece; null falls back to the batch's face. */
  face?: string | null;
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
    if (tag.status === "retired") throw new TagError("A retired tag cannot be edited", 409, "tag_retired_locked");
    const next = {
      destinationUrl: patch.destinationUrl !== undefined ? patch.destinationUrl : tag.destinationUrl,
      destinationType: patch.destinationType !== undefined ? patch.destinationType : tag.destinationType,
    };
    if (tag.status === "active" && (!next.destinationUrl || !next.destinationType)) {
      throw new TagError("An active tag must keep a destination; disable it first", 400, "tag_active_needs_destination");
    }
    if (patch.productType && patch.productType !== tag.productType && tag.status !== "inventory") {
      throw new TagError("Product type can only change while the tag is in inventory");
    }
    if (patch.salesProductId !== undefined && patch.salesProductId !== tag.salesProductId) {
      if (patch.salesProductId !== null) await assertPhysicalProduct(tx, patch.salesProductId);
      const [activeSale] = await tx.select({ id: salesSaleTags.id }).from(salesSaleTags)
        .where(and(eq(salesSaleTags.tagId, tag.id), eq(salesSaleTags.status, "active")))
        .limit(1);
      if (activeSale) throw new TagError("A sold piece keeps the catalog product it was sold as", 409, "tag_sold_keeps_product");
    }
    await writeHistory(tx, tag, next, userId, patch.reason ?? null);
    const [updated] = await tx
      .update(tags)
      .set({
        ...next,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.productType ? { productType: patch.productType } : {}),
        ...(patch.salesProductId !== undefined ? { salesProductId: patch.salesProductId } : {}),
        ...(patch.face !== undefined ? { face: patch.face } : {}),
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
  actor: Pick<TagActor, "userId" | "repId" | "inManagement">,
  reason?: string | null,
  source: JourneySource = "admin",
): Promise<Tag> {
  let fromStatus = "";
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    fromStatus = tag.status;
    const plan = planTransition(tag, action);
    if (!plan.ok) throw new TagError(plan.error, 409, plan.code);
    const now = new Date();
    const set: Partial<Tag> = { status: plan.status, updatedAt: now };
    if (action === "activate") {
      Object.assign(set, { activatedAt: now, activatedByRepId: actor.repId, disabledAt: null, ...activationCredit(tag, actor) });
    }
    if (action === "disable") set.disabledAt = now;
    if (action === "retire") set.disabledAt = tag.disabledAt ?? now;
    if (action === "unassign") {
      const [activeSale] = await tx.select({ id: salesSaleTags.id }).from(salesSaleTags)
        .where(and(eq(salesSaleTags.tagId, tag.id), eq(salesSaleTags.status, "active")))
        .limit(1);
      if (activeSale) throw new TagError("Cancel the financial sale before clearing this piece's customer", 409, "tag_sale_blocks_clear");
      // Back to unconfigured stock in the same hands. The previous customer's
      // destination must not follow the piece.
      Object.assign(set, {
        leadId: null, destinationUrl: null, destinationType: null, utmEnabled: false, utmCampaign: null,
        assignedAt: null, activatedAt: null, disabledAt: null, soldAt: null, activatedByRepId: null,
      });
      await writeHistory(tx, tag, { destinationUrl: null, destinationType: null }, actor.userId, reason ?? tagSystemReason("unlinked"));
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
    if (!plan.ok) throw new TagError(plan.error, 409, plan.code);
    let leadId: number;
    if (target.leadId) {
      const [lead] = await tx.select({ id: salesLeads.id, name: salesLeads.name }).from(salesLeads).where(eq(salesLeads.id, target.leadId));
      if (!lead) throw new TagError("Customer not found", 404, "lead_not_found");
      leadId = lead.id;
      leadLabel = lead.name;
    } else if (target.leadName?.trim()) {
      // Checked before creating anything, so a refused move leaves no orphan lead.
      if (tag.leadId && tag.status === "active") throw new TagError("Disable the tag before moving it to another customer", 409, "tag_pause_before_move");
      leadId = await createLeadForSale(tx, target.leadName.trim(), tag.repId ?? actorRepId);
      leadLabel = target.leadName.trim();
      newLead = true;
    } else {
      throw new TagError("Choose the customer", 400, "tag_customer_required");
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
      if (tag.status === "active") throw new TagError("Disable the tag before moving it to another customer", 409, "tag_pause_before_move");
      Object.assign(set, { destinationUrl: null, destinationType: null, utmEnabled: false, utmCampaign: null });
      await writeHistory(tx, tag, { destinationUrl: null, destinationType: null }, userId, tagSystemReason("reassigned"));
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

/** Admin: one standalone piece (not part of a manufacturing batch), in house stock. It needs a catalog product to be sellable. */
export async function createSingleTag(
  input: { productType: string; salesProductId: number; face?: string | null; label?: string | null },
  userId: string | null = null,
  source: JourneySource = "admin",
): Promise<Tag> {
  await assertPhysicalProduct(db, input.salesProductId);
  const [code] = await generateUniqueCodes(1, findExistingCodes);
  const organizationId = await companyOrganizationId();
  const [tag] = await db
    .insert(tags)
    .values({ organizationId, publicCode: code, productType: input.productType, salesProductId: input.salesProductId, face: input.face ?? null, label: input.label ?? null, status: "inventory" })
    .returning();
  console.log(`[tags] created standalone tag ${code}`);
  await recordJourney({
    kind: "execution",
    action: "tag_created",
    title: `Tag ${code} created (${JOURNEY_PRODUCT_LABELS[input.productType] ?? input.productType})`,
    content: input.label ?? null,
    tagId: tag.id,
    afterValue: tag.status,
    metadata: { productType: input.productType, face: input.face ?? null },
  }, journeyContext(userId, source));
  return tag;
}

async function findExistingCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const found = await db.select({ code: tags.publicCode }).from(tags).where(inArray(tags.publicCode, codes));
  return new Set(found.map((r) => r.code));
}

/**
 * Admin "Move": hand one piece to another rep, or take it back to house stock, through the same stock rules as kits
 * and returns. Back to the house is a `return` movement, as returnToHouse writes it (company stock, no custodian).
 * To a rep it is a `transfer`: the new rep becomes the custodian of company stock (no cost is captured here, so
 * nothing is bought). Either way an open acquisition of the previous rep is closed and the piece leaves its kit.
 * Sold pieces stay with their seller, and a piece set up for a customer must have the customer cleared first, as
 * for a return.
 */
export async function setTagRep(
  id: string,
  repId: number | null,
  userId: string | null,
  source: JourneySource = "admin",
  /** Stored on the stock movement (a system reason code, tagSystemReason). */
  reason: string | null = null,
): Promise<Tag> {
  let previous: { repId: number | null; name: string } = { repId: null, name: "house" };
  let next = "house";
  const organizationId = repId === null ? await companyOrganizationId() : await organizationIdForRep(repId);
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    if (tag.repId === repId) return null;
    const names = async (rid: number | null) =>
      rid === null ? "house" : (await tx.select({ n: salesReps.displayName }).from(salesReps).where(eq(salesReps.id, rid)))[0]?.n ?? `rep ${rid}`;
    const [activeSale] = await tx.select({ id: salesSaleTags.id }).from(salesSaleTags)
      .where(and(eq(salesSaleTags.tagId, tag.id), eq(salesSaleTags.status, "active")))
      .limit(1);
    if (activeSale) throw new TagError("A sold piece stays with its seller; cancel the sale before moving it", 409, "tag_sold_stays");
    if (tag.stockStatus !== "available") throw new TagError(`A piece in ${tag.stockStatus} stock cannot be moved`, 409, "tag_stock_cannot_move");
    if (tag.status !== "inventory") throw new TagError("Clear the customer before moving this piece", 409, "tag_clear_customer_first");
    previous = { repId: tag.repId, name: await names(tag.repId) };
    next = await names(repId);
    const now = new Date();
    await tx
      .update(tagAcquisitionUnits)
      .set({ returnedAt: now })
      .where(and(eq(tagAcquisitionUnits.tagId, tag.id), isNull(tagAcquisitionUnits.returnedAt)));
    const [updated] = await tx
      .update(tags)
      .set({
        organizationId,
        repId,
        kitId: null,
        custodianRepId: repId,
        ownershipType: "company",
        stockUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(tags.id, id))
      .returning();
    if (tag.kitId) await markKitItemsLeft(tx, [{ kitId: tag.kitId, tagId: tag.id }], repId === null ? "returned" : "moved", now);
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: repId === null ? "return" : "transfer",
      fromStockStatus: tag.stockStatus,
      toStockStatus: updated.stockStatus,
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: updated.ownershipType,
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: repId,
      referenceType: tag.kitId ? "kit" : null,
      referenceId: tag.kitId,
      actorUserId: userId,
      reason,
    });
    console.log(`[tags] ${tag.publicCode} reseller ${tag.repId ?? "house"} → ${repId ?? "house"} (user ${userId ?? "?"})`);
    return updated;
  });
  if (!updated) return (await getTagRow(id))!;
  await recordJourney({
    kind: "execution",
    action: "reseller_changed",
    title: `Tag ${updated.publicCode} moved from ${previous.name} to ${next}`,
    tagId: id,
    repId,
    beforeValue: previous.name,
    afterValue: next,
  }, journeyContext(userId, source));
  return updated;
}

// ─── Leads (the businesses pieces are sold to) ────────────────────────────────

/**
 * True when the actor may sell pieces to this lead (see canUseLead), or when the
 * company already holds one of the actor's pieces: a lead a manager created and
 * linked a reseller's piece to is that reseller's customer too.
 */
export async function leadUsableBy(actor: TagActor, leadId: number, executor: typeof db | Tx = db): Promise<boolean> {
  const [lead] = await executor.select({ organizationId: salesLeads.organizationId, ownerRepId: salesLeads.ownerRepId }).from(salesLeads).where(eq(salesLeads.id, leadId));
  if (!lead) return false;
  if (canUseLead(actor, lead)) return true;
  const [held] = await executor.select({ id: tags.id }).from(tags).where(and(eq(tags.leadId, leadId), eq(tags.repId, actor.repId))).limit(1);
  return !!held;
}

/** A business met while configuring a piece. It becomes a customer only after a financial sale. */
export async function createLeadForSale(tx: Tx, name: string, ownerRepId: number): Promise<number> {
  const organizationId = await organizationIdForRep(ownerRepId);
  const [lead] = await tx
    .insert(salesLeads)
    .values({ organizationId, name, ownerRepId, source: "tags", status: "lead" })
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

// ─── Kits (pieces handed to a reseller) ───────────────────────────────────────

/** The kit's packing list, written once at the hand-over (tag_kit_items). */
export async function recordKitItems(
  tx: Tx,
  kitId: string,
  pieces: ReadonlyArray<{ id: string; publicCode: string; batchId: string | null }>,
  at: Date,
): Promise<void> {
  if (!pieces.length) return;
  await tx.insert(tagKitItems)
    .values(pieces.map((p) => ({ kitId, tagId: p.id, publicCode: p.publicCode, batchId: p.batchId, handedOutAt: at })))
    .onConflictDoNothing();
}

/** Pieces leaving the kit they were handed out in: back to house stock, or to another reseller. */
export async function markKitItemsLeft(
  tx: Tx,
  pieces: ReadonlyArray<{ kitId: string | null; tagId: string }>,
  reason: "returned" | "moved",
  at: Date,
): Promise<void> {
  for (const p of pieces) {
    if (!p.kitId) continue;
    await tx.update(tagKitItems)
      .set({ leftAt: at, leftReason: reason })
      .where(and(eq(tagKitItems.kitId, p.kitId), eq(tagKitItems.tagId, p.tagId), isNull(tagKitItems.leftAt)));
  }
}

export interface KitInput {
  repId: number;
  /** Target Organization. API callers must derive this from membership, never trust the browser. */
  organizationId?: number;
  /** When set, only pieces already owned by this Organization may be distributed. */
  sourceOrganizationId?: number;
  /** Exact pieces, by printed code. */
  codes?: string[];
  /** Or: the next `quantity` house pieces of this batch, by serial. */
  batchId?: string;
  quantity?: number;
  note?: string | null;
  /** Partner's cost per physical piece. Zero is valid for house/owner stock. */
  unitCostCents?: number;
  /**
   * Who owns the pieces once handed over. Without a cost they always stay the company's (consignment: the rep is
   * only the custodian). With a cost they become the rep's (a wholesale purchase) unless the caller says `company`:
   * a rep on the zero-cost rule holds company stock even when a reference cost is recorded.
   */
  ownershipType?: "company" | "rep";
}

/**
 * Hands pieces from house stock to a reseller. Only unsold house pieces
 * (inventory, no reseller) can go into a kit; anything else is refused with
 * the offending codes, and nothing is moved.
 */
export async function deliverKit(input: KitInput, userId: string | null, source: JourneySource = "admin"): Promise<TagKitItem> {
  let delivered: Array<{ publicCode: string; batchId: string | null }> = [];
  const organizationId = input.organizationId ?? await organizationIdForRep(input.repId);
  const kitId = await db.transaction(async (tx) => {
    let picked: Array<{
      id: string; organizationId: number; publicCode: string; status: string; stockStatus: string;
      ownershipType: string; custodianRepId: number | null; repId: number | null; batchId: string | null;
    }>;
    if (input.codes?.length) {
      const codes = Array.from(new Set(input.codes));
      picked = await tx
        .select({
          id: tags.id, organizationId: tags.organizationId, publicCode: tags.publicCode, status: tags.status,
          stockStatus: tags.stockStatus, ownershipType: tags.ownershipType, custodianRepId: tags.custodianRepId,
          repId: tags.repId, batchId: tags.batchId,
        })
        .from(tags)
        .where(inArray(tags.publicCode, codes))
        .for("update");
      const found = new Set(picked.map((t) => t.publicCode));
      const missing = codes.filter((c) => !found.has(c));
      if (missing.length) throw new TagError(`Unknown codes: ${missing.join(", ")}`, 404, "tag_codes_unknown", { codes: missing.join(", ") });
      const unavailable = picked.filter((t) => t.status !== "inventory" || t.stockStatus !== "available" || t.repId !== null ||
        (input.sourceOrganizationId !== undefined && t.organizationId !== input.sourceOrganizationId)).map((t) => t.publicCode);
      if (unavailable.length) throw new TagError(`Not in house stock: ${unavailable.join(", ")}`, 409, "tag_not_house_stock", { codes: unavailable.join(", ") });
      // Same rule as the dry run (shared/tagDistribution.ts handOutBlocker): a sold piece never goes into a kit.
      const sold = picked.length ? await tx.select({ tagId: salesSaleTags.tagId }).from(salesSaleTags)
        .where(and(inArray(salesSaleTags.tagId, picked.map((t) => t.id)), eq(salesSaleTags.status, "active"))) : [];
      if (sold.length) {
        const soldIds = new Set(sold.map((s) => s.tagId));
        const soldCodes = picked.filter((t) => soldIds.has(t.id)).map((t) => t.publicCode);
        throw new TagError(`Not in house stock: ${soldCodes.join(", ")}`, 409, "tag_not_house_stock", { codes: soldCodes.join(", ") });
      }
    } else if (input.batchId && input.quantity) {
      picked = await tx
        .select({
          id: tags.id, organizationId: tags.organizationId, publicCode: tags.publicCode, status: tags.status,
          stockStatus: tags.stockStatus, ownershipType: tags.ownershipType, custodianRepId: tags.custodianRepId,
          repId: tags.repId, batchId: tags.batchId,
        })
        .from(tags)
        .where(and(
          eq(tags.batchId, input.batchId),
          eq(tags.status, "inventory"),
          eq(tags.stockStatus, "available"),
          isNull(tags.repId),
          sql`NOT EXISTS (SELECT 1 FROM sales_sale_tags st WHERE st.tag_id = ${tags.id} AND st.status = 'active')`,
          ...(input.sourceOrganizationId !== undefined ? [eq(tags.organizationId, input.sourceOrganizationId)] : []),
        ))
        .orderBy(tags.serialNumber, tags.publicCode)
        .limit(input.quantity)
        .for("update");
      if (picked.length < input.quantity) {
        throw new TagError(`Only ${picked.length} unsold pieces left in house stock for that batch`, 409, "kit_batch_short", { count: picked.length });
      }
    } else {
      throw new TagError("Choose the pieces: codes, or a batch and a quantity", 400, "kit_pieces_required");
    }

    const [kit] = await tx
      .insert(tagKits)
      .values({ organizationId, repId: input.repId, note: input.note ?? null, createdByUserId: userId })
      .returning({ id: tagKits.id });
    const now = new Date();
    const ownershipType = input.unitCostCents === undefined ? "company" : input.ownershipType ?? "rep";
    await tx
      .update(tags)
      .set({
        organizationId,
        repId: input.repId,
        kitId: kit.id,
        custodianRepId: input.repId,
        ownershipType,
        stockUpdatedAt: now,
        updatedAt: now,
      })
      .where(inArray(tags.id, picked.map((t) => t.id)));
    await recordKitItems(tx, kit.id, picked, now);
    await tx.insert(tagStockMovements).values(picked.map((tag) => ({
      tagId: tag.id,
      movementType: "transfer",
      fromStockStatus: tag.stockStatus,
      toStockStatus: "available",
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: ownershipType,
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: input.repId,
      referenceType: "kit",
      referenceId: kit.id,
      actorUserId: userId,
      reason: input.note ?? null,
    })));

    if (input.unitCostCents !== undefined) {
      const [acquisition] = await tx.insert(tagAcquisitions).values({
        repId: input.repId,
        kitId: kit.id,
        source: "manual",
        status: "fulfilled",
        createdByUserId: userId,
      }).returning();
      const productRows = await tx
        .select({ id: tags.id, ownProductId: tags.salesProductId, batchProductId: tagBatches.salesProductId })
        .from(tags)
        .leftJoin(tagBatches, eq(tags.batchId, tagBatches.id))
        .where(inArray(tags.id, picked.map((tag) => tag.id)));
      const byProduct = new Map<number | null, typeof productRows>();
      for (const row of productRows) {
        const productId = row.ownProductId ?? row.batchProductId ?? null;
        const group = byProduct.get(productId) ?? [];
        group.push(row);
        byProduct.set(productId, group);
      }
      for (const [salesProductId, units] of Array.from(byProduct.entries())) {
        const [line] = await tx.insert(tagAcquisitionLines).values({
          acquisitionId: acquisition.id,
          salesProductId,
          quantity: units.length,
          subtotalCents: input.unitCostCents * units.length,
          unitCostCents: input.unitCostCents,
        }).returning();
        await tx.insert(tagAcquisitionUnits).values(units.map((unit) => ({
          acquisitionLineId: line.id,
          tagId: unit.id,
          unitCostCents: input.unitCostCents!,
        })));
      }
    }
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

export async function listKits(filter: { repId?: number; kitId?: string; organizationId?: number } = {}): Promise<TagKitItem[]> {
  const conds: SQL[] = [sql`true`];
  if (filter.repId !== undefined) conds.push(sql`k.rep_id = ${filter.repId}`);
  if (filter.organizationId !== undefined) conds.push(sql`k.organization_id = ${filter.organizationId}`);
  if (filter.kitId) conds.push(sql`k.id = ${filter.kitId}`);
  const list = await rows<{
    id: string; kit_number: number; rep_id: number; rep_name: string | null; note: string | null; created_at: Date; piece_count: number;
    unsold_count: number; returnable_count: number; sold_count: number; acquisition_source: string | null; unit_cost_cents: number | null;
    handed_out: number; returned: number; moved: number; ownership_type: string | null;
  }>(sql`
    SELECT k.id, k.kit_number, k.rep_id, r.display_name AS rep_name, k.note, k.created_at,
      count(t.id)::int AS piece_count,
      count(t.id) FILTER (WHERE t.rep_id = k.rep_id AND ${stockMetricSql("withResellers")})::int AS unsold_count,
      count(t.id) FILTER (WHERE t.rep_id = k.rep_id AND ${stockMetricSql("returnable")})::int AS returnable_count,
      ${countMetricSql("sold")} AS sold_count,
      acq.source AS acquisition_source, acq.unit_cost_cents,
      items.handed_out, items.returned, items.moved,
      COALESCE(own.to_ownership_type, CASE WHEN acq.source = 'stuscle' THEN 'rep' END) AS ownership_type
    FROM tag_kits k
    LEFT JOIN sales_reps r ON r.id = k.rep_id
    LEFT JOIN tags t ON t.kit_id = k.id
    LEFT JOIN LATERAL (
      SELECT a.source, min(l.unit_cost_cents)::int AS unit_cost_cents
      FROM tag_acquisitions a
      LEFT JOIN tag_acquisition_lines l ON l.acquisition_id = a.id
      WHERE a.kit_id = k.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) acq ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS handed_out,
        count(*) FILTER (WHERE i.left_reason = 'returned')::int AS returned,
        count(*) FILTER (WHERE i.left_at IS NOT NULL AND i.left_reason IS DISTINCT FROM 'returned')::int AS moved
      FROM tag_kit_items i WHERE i.kit_id = k.id
    ) items ON true
    LEFT JOIN LATERAL (
      SELECT m.to_ownership_type FROM tag_stock_movements m
      WHERE m.reference_type = 'kit' AND m.reference_id = k.id::text AND m.movement_type = 'transfer' AND m.to_custodian_rep_id = k.rep_id
      ORDER BY m.created_at LIMIT 1
    ) own ON true
    WHERE ${sql.join(conds, sql` AND `)}
    GROUP BY k.id, r.display_name, acq.source, acq.unit_cost_cents, items.handed_out, items.returned, items.moved, own.to_ownership_type
    ORDER BY k.created_at DESC
  `);
  return list.map((k) => {
    const pieceCount = Number(k.piece_count);
    const soldCount = Number(k.sold_count);
    return {
      id: k.id,
      kitNumber: Number(k.kit_number),
      kitCode: kitCode(Number(k.kit_number)),
      repId: k.rep_id,
      repName: k.rep_name,
      note: k.note,
      createdAt: iso(k.created_at)!,
      ownershipType: k.ownership_type,
      // A kit older than its packing list still counts the pieces it holds.
      handedOutCount: Math.max(Number(k.handed_out ?? 0), pieceCount),
      returnedCount: Number(k.returned ?? 0),
      movedCount: Number(k.moved ?? 0),
      stillWithCount: pieceCount - soldCount,
      pieceCount,
      unsoldCount: Number(k.unsold_count),
      returnableCount: Number(k.returnable_count),
      soldCount,
      acquisitionSource: k.acquisition_source,
      unitCostCents: k.unit_cost_cents === null ? null : Number(k.unit_cost_cents),
    };
  });
}

/** What a kit handed out (its packing list), each piece with where it is now. */
export async function getKitItems(kitId: string): Promise<TagKitPiece[] | null> {
  const [kit] = await db.select({ id: tagKits.id, repId: tagKits.repId }).from(tagKits).where(eq(tagKits.id, kitId)).limit(1);
  if (!kit) return null;
  const list = await rows<{
    public_code: string; tag_id: string | null; serial_number: number | null; batch_code: string | null; product_type: string | null;
    face: string | null; batch_face: string | null; handed_out_at: Date; left_at: Date | null; left_reason: string | null; sold: boolean;
  }>(sql`
    SELECT i.public_code, i.tag_id, t.serial_number, b.batch_code, t.product_type, t.face, b.face AS batch_face,
           i.handed_out_at, i.left_at, i.left_reason,
           EXISTS (SELECT 1 FROM sales_sale_tags st WHERE st.tag_id = t.id AND st.status = 'active') AS sold
    FROM tag_kit_items i
    LEFT JOIN tags t ON t.id = i.tag_id
    LEFT JOIN tag_batches b ON b.id = COALESCE(t.batch_id, i.batch_id)
    WHERE i.kit_id = ${kitId}
    ORDER BY b.batch_code NULLS LAST, t.serial_number NULLS LAST, i.public_code
  `);
  return list.map((r) => ({
    code: r.public_code,
    tagId: r.tag_id,
    serialNumber: r.serial_number,
    batchCode: r.batch_code,
    productType: r.product_type,
    face: r.product_type ? faceOf({ face: r.face, batch_face: r.batch_face, product_type: r.product_type }) : null,
    handedOutAt: iso(r.handed_out_at)!,
    state: r.left_at ? (r.left_reason === "returned" ? "returned" : "moved") : r.sold ? "sold" : "in_kit",
    leftAt: iso(r.left_at),
  }));
}

// ─── Distribution dry runs (Hand out, Take back) ──────────────────────────────

type CheckRow = {
  id: string; public_code: string; status: string; stock_status: string; rep_id: number | null; rep_name: string | null;
  serial_number: number | null; batch_code: string | null; product_type: string; kit_number: number | null; sold: boolean;
};

async function piecesForCheck(where: SQL, limit?: number): Promise<CheckRow[]> {
  return rows<CheckRow>(sql`
    SELECT t.id, t.public_code, t.status, t.stock_status, t.rep_id, r.display_name AS rep_name, t.serial_number, b.batch_code,
           t.product_type, k.kit_number,
           EXISTS (SELECT 1 FROM sales_sale_tags st WHERE st.tag_id = t.id AND st.status = 'active') AS sold
    FROM tags t
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN tag_kits k ON k.id = t.kit_id
    WHERE ${where}
    ORDER BY t.serial_number NULLS LAST, t.public_code
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `);
}

const checkPiece = (r: CheckRow): DistributionPiece => ({ status: r.status, stockStatus: r.stock_status, repId: r.rep_id, sold: !!r.sold });
const describeCheck = (_code: string, r: CheckRow | undefined) => ({
  tagId: r?.id ?? null,
  batchCode: r?.batch_code ?? null,
  serialNumber: r?.serial_number ?? null,
  productType: r?.product_type ?? null,
  repId: r?.rep_id ?? null,
  repName: r?.rep_name ?? null,
  kitCode: r?.kit_number ? kitCode(Number(r.kit_number)) : null,
});

/**
 * Hand out, dry run: per code, can it go into a kit now and why not. With a batch and a quantity instead, the next
 * pieces "next N from batch" would take, in the same order deliverKit picks them. Nothing moves.
 */
export async function checkHandOut(input: { codes?: string[]; batchId?: string; quantity?: number }): Promise<DistributionCheck> {
  if (input.batchId && input.quantity) {
    const picked = await piecesForCheck(sql`t.batch_id = ${input.batchId} AND ${stockMetricSql("handOut")}`, input.quantity);
    return checkCodes(picked.map((r) => r.public_code), new Map(picked.map((r) => [r.public_code, r])), (r) => handOutBlocker(checkPiece(r)), describeCheck);
  }
  const codes = input.codes ?? [];
  const found = codes.length ? await piecesForCheck(sql`t.public_code IN ${sqlList(Array.from(new Set(codes)))}`) : [];
  return checkCodes(codes, new Map(found.map((r) => [r.public_code, r])), (r) => handOutBlocker(checkPiece(r)), describeCheck);
}

/** Take back, dry run: per code, can it come back to house stock now and why not. Nothing moves. */
export async function checkTakeBack(codes: string[]): Promise<DistributionCheck> {
  const found = codes.length ? await piecesForCheck(sql`t.public_code IN ${sqlList(Array.from(new Set(codes)))}`) : [];
  return checkCodes(codes, new Map(found.map((r) => [r.public_code, r])), (r) => takeBackBlocker(checkPiece(r)), describeCheck);
}

/** `(a, b, c)` for an IN list (never empty: callers check). */
function sqlList(values: readonly string[]): SQL {
  return sql`(${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
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
  let moved: Array<{
    id: string; publicCode: string; repId: number | null; kitId: string | null; stockStatus: string;
    ownershipType: string; custodianRepId: number | null;
  }> = [];
  const result = await db.transaction(async (tx) => {
    const picked = await tx
      .select({
        id: tags.id, publicCode: tags.publicCode, status: tags.status, stockStatus: tags.stockStatus,
        ownershipType: tags.ownershipType, custodianRepId: tags.custodianRepId, repId: tags.repId, kitId: tags.kitId,
      })
      .from(tags)
      .where(inArray(tags.publicCode, codes))
      .for("update");
    const found = new Set(picked.map((t) => t.publicCode));
    const missing = codes.filter((c) => !found.has(c));
    if (missing.length) throw new TagError(`Unknown codes: ${missing.join(", ")}`, 404, "tag_codes_unknown", { codes: missing.join(", ") });
    const activeSales = picked.length ? await tx.select({ tagId: salesSaleTags.tagId }).from(salesSaleTags)
      .where(and(inArray(salesSaleTags.tagId, picked.map((tag) => tag.id)), eq(salesSaleTags.status, "active"))) : [];
    if (activeSales.length) {
      const soldIds = new Set(activeSales.map((sale) => sale.tagId));
      const soldCodes = picked.filter((tag) => soldIds.has(tag.id)).map((tag) => tag.publicCode);
      throw new TagError(`Already sold, cannot return: ${soldCodes.join(", ")}`, 409, "return_already_sold", { codes: soldCodes.join(", ") });
    }
    const configured = picked.filter((t) => t.status !== "inventory" || t.stockStatus !== "available").map((t) => t.publicCode);
    if (configured.length) throw new TagError(`Clear the customer of these set-up pieces before returning them: ${configured.join(", ")}`, 409, "return_configured", { codes: configured.join(", ") });
    const alreadyInHouse = picked.filter((t) => t.repId === null).map((t) => t.publicCode);
    const moving = picked.filter((t) => t.repId !== null);
    if (moving.length) {
      const now = new Date();
      await tx
        .update(tagAcquisitionUnits)
        .set({ returnedAt: now })
        .where(and(inArray(tagAcquisitionUnits.tagId, moving.map((t) => t.id)), isNull(tagAcquisitionUnits.returnedAt)));
      await tx
        .update(tags)
        .set({
          repId: null,
          kitId: null,
          custodianRepId: null,
          ownershipType: "company",
          stockStatus: "available",
          stockUpdatedAt: now,
          updatedAt: now,
        })
        .where(inArray(tags.id, moving.map((t) => t.id)));
      await markKitItemsLeft(tx, moving.map((t) => ({ kitId: t.kitId, tagId: t.id })), "returned", now);
      await tx.insert(tagStockMovements).values(moving.map((tag) => ({
        tagId: tag.id,
        movementType: "return",
        fromStockStatus: tag.stockStatus,
        toStockStatus: "available",
        fromOwnershipType: tag.ownershipType,
        toOwnershipType: "company",
        fromCustodianRepId: tag.custodianRepId,
        toCustodianRepId: null,
        referenceType: "kit",
        referenceId: tag.kitId,
        actorUserId: userId,
      })));
      console.log(`[tags] ${moving.length} pieces returned to house stock (user ${userId ?? "?"})`);
      moved = moving;
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
  large_stand: "LSTAND",
  small_stand: "SSTAND",
  large_sign: "LSIGN",
  small_sign: "SSIGN",
  large_plate: "LPLATE",
  small_plate: "SPLATE",
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
  salesProductId: number;
  /** What is printed on every piece of the run (shared/tagFace.ts). */
  face?: string | null;
  vendor?: string | null;
  notes?: string | null;
  /** Issue this many fresh codes now (pieces to print or to order); the pieces start `pending`. */
  quantity?: number;
  /** Admin-only: pieces already made with these printed codes; they enter stock at once. */
  publicCodes?: string[];
}

/**
 * Two kinds of batch. With `quantity` (or `publicCodes`) Xpot issues the codes now: they go into a print file or to a
 * supplier, and each piece enters stock when it is scanned into the batch. Without, the batch starts empty and every
 * scan of an already-coded piece creates it (docs/TAG_INVENTORY_EXECUTION_PLAN.md).
 */
/** Runs inside the transaction that issues the codes, with the new batch (Tags › Production links its print order). */
export type BatchCreatedHook = (tx: Tx, batch: typeof tagBatches.$inferSelect) => Promise<void>;

export async function createBatch(input: BatchInput, userId: string | null, source: JourneySource = "admin", onIssued?: BatchCreatedHook) {
  if (input.quantity || input.publicCodes?.length) return createIssuedBatch(input, userId, source, onIssued);
  const batchCode = input.batchCode?.trim() || (await nextBatchCode(input.productType));
  try {
    const [batch] = await db.insert(tagBatches).values({
      batchCode,
      name: input.name,
      productType: input.productType,
      salesProductId: input.salesProductId,
      face: input.face ?? null,
      vendor: input.vendor ?? null,
      quantity: 0,
      status: "open",
      notes: input.notes ?? null,
      createdByUserId: userId,
    }).returning();
    await recordJourney({
      kind: "execution",
      action: "batch_created",
      title: `Empty intake batch ${batch.batchCode} opened`,
      content: batch.name,
      batchId: batch.id,
      afterValue: batch.status,
      metadata: { productType: input.productType, face: batch.face, vendor: batch.vendor },
    }, journeyContext(userId, source));
    return batch;
  } catch (err) {
    if (pgError(err).code === "23505") throw new TagError(`Batch code ${batchCode} already exists`, 409, "batch_code_taken", { code: batchCode });
    throw err;
  }
}

async function createIssuedBatch(input: BatchInput, userId: string | null, source: JourneySource, onIssued?: BatchCreatedHook) {
  const batchCode = input.batchCode?.trim() || (await nextBatchCode(input.productType));
  const organizationId = await companyOrganizationId();
  const pinned = Boolean(input.publicCodes?.length);
  const quantity = input.publicCodes?.length ?? input.quantity!;
  for (let attempt = 1; ; attempt++) {
    const codes = input.publicCodes ?? (await generateUniqueCodes(quantity, findExistingCodes));
    if (pinned) {
      const existing = await findExistingCodes(codes);
      if (existing.size > 0) throw new TagError(`Public codes already exist: ${Array.from(existing).sort().join(", ")}`, 409);
    }
    try {
      const batch = await db.transaction(async (tx) => {
        const now = new Date();
        const [batch] = await tx.insert(tagBatches).values({
          batchCode,
          name: input.name,
          productType: input.productType,
          salesProductId: input.salesProductId,
          face: input.face ?? null,
          vendor: input.vendor ?? null,
          quantity,
          status: pinned ? "closed" : "open",
          codeSource: "issued",
          closedAt: pinned ? now : null,
          closedByUserId: pinned ? userId : null,
          notes: input.notes ?? null,
          createdByUserId: userId,
        }).returning();
        // Pinned codes are pieces already in hand: stock at once. Fresh codes are pieces still to be made.
        const stockStatus = pinned ? "available" : "pending";
        const created = await tx.insert(tags).values(codes.map((publicCode, index) => ({
          organizationId,
          publicCode,
          serialNumber: index + 1,
          batchId: batch.id,
          productType: input.productType,
          salesProductId: input.salesProductId,
          status: "inventory",
          stockStatus,
          ownershipType: "company",
          registeredAt: pinned ? now : null,
          registeredByUserId: pinned ? userId : null,
          stockUpdatedAt: now,
        }))).returning({ id: tags.id });
        await tx.insert(tagStockMovements).values(created.map((tag) => ({
          tagId: tag.id,
          movementType: pinned ? "intake" : "issue",
          fromStockStatus: null,
          toStockStatus: stockStatus,
          fromOwnershipType: null,
          toOwnershipType: "company",
          actorUserId: userId,
          referenceType: "batch",
          referenceId: batch.id,
        })));
        if (onIssued) await onIssued(tx, batch);
        return batch;
      });
      console.log(`[tags] batch ${batch.batchCode} created with ${quantity} ${pinned ? "pinned" : "issued"} codes (user ${userId ?? "?"})`);
      await recordJourney({
        kind: "execution",
        action: "batch_created",
        title: `Batch ${batch.batchCode} created: ${quantity} × ${JOURNEY_PRODUCT_LABELS[input.productType] ?? input.productType}`,
        content: batch.name,
        batchId: batch.id,
        afterValue: batch.status,
        metadata: { quantity, codeSource: "issued", pinned, productType: input.productType, face: batch.face, vendor: batch.vendor },
      }, journeyContext(userId, source));
      return batch;
    } catch (err) {
      const pg = pgError(err);
      if (pg.code === "23505" && pg.constraint === "tags_public_code_unique" && attempt < 3 && !pinned) continue;
      if (pg.code === "23505" && pg.constraint === "tags_public_code_unique") throw new TagError("Public codes already exist", 409);
      if (pg.code === "23505") throw new TagError(`Batch code ${batchCode} already exists`, 409, "batch_code_taken", { code: batchCode });
      throw err;
    }
  }
}

export interface BatchScanResult {
  tag: Tag;
  /** Pieces registered in the batch: every code of an issued batch, every scanned piece of an empty one. */
  batchCount: number;
  /** Pieces of the batch physically in stock (not `pending`). */
  receivedCount: number;
  alreadyRegistered: boolean;
}

export async function receivedCountOf(tx: Tx | typeof db, batchId: string): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(tags)
    .where(and(eq(tags.batchId, batchId), sql`${tags.stockStatus} <> 'pending'`));
  return Number(row?.n ?? 0);
}

/** Registers one physical piece into an open batch. One accepted scan = one stock row. */
export async function scanTagIntoBatch(
  batchId: string,
  rawValue: string,
  idempotencyKey: string | null,
  userId: string | null,
  source: JourneySource = "admin",
): Promise<BatchScanResult> {
  const parsed = parseTagIntakeScan(rawValue);
  if (!parsed.ok) throw new TagError(parsed.error, 400);
  const organizationId = await companyOrganizationId();

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(tagBatches).where(eq(tagBatches.id, batchId)).for("update");
    if (!batch) throw new TagError("Batch not found", 404, "batch_not_found");
    if (batch.status !== "open") throw new TagError("This batch is closed and no longer accepts scans", 409, "batch_closed");

    if (idempotencyKey && userId) {
      const [sameRequest] = await tx.select().from(tags).where(and(
        eq(tags.registeredByUserId, userId),
        eq(tags.intakeIdempotencyKey, idempotencyKey),
      )).limit(1);
      if (sameRequest) {
        if (sameRequest.batchId !== batchId || sameRequest.publicCode !== parsed.publicCode) {
          throw new TagError("This scan request was already used for another piece", 409, "scan_reused");
        }
        return { tag: sameRequest, batchCount: batch.quantity, receivedCount: await receivedCountOf(tx, batchId), alreadyRegistered: true };
      }
    }

    const [existing] = await tx.select().from(tags).where(eq(tags.publicCode, parsed.publicCode)).for("update");
    if (existing) {
      if (existing.batchId !== batchId) throw new TagError(`Piece ${parsed.publicCode} already belongs to another batch`, 409, "piece_other_batch", { code: parsed.publicCode });
      if (existing.stockStatus !== "pending") {
        return { tag: existing, batchCount: batch.quantity, receivedCount: await receivedCountOf(tx, batchId), alreadyRegistered: true };
      }
      // An issued code: the printed (or delivered) piece now exists. This scan is also the proof its QR reads.
      const now = new Date();
      const [received] = await tx.update(tags).set({
        stockStatus: "available",
        ownershipType: "company",
        registeredAt: now,
        registeredByUserId: userId,
        scannedPayload: rawValue,
        intakeIdempotencyKey: idempotencyKey,
        stockUpdatedAt: now,
        updatedAt: now,
      }).where(eq(tags.id, existing.id)).returning();
      // A read undone at the station and made again keeps the station's key for this code; the first intake row
      // (append-only) still holds it, so the second one goes without (the piece's own key guards the retry).
      const [keyTaken] = idempotencyKey && userId
        ? await tx.select({ id: tagStockMovements.id }).from(tagStockMovements)
          .where(and(eq(tagStockMovements.actorUserId, userId), eq(tagStockMovements.idempotencyKey, idempotencyKey))).limit(1)
        : [];
      await tx.insert(tagStockMovements).values({
        tagId: existing.id,
        movementType: "intake",
        fromStockStatus: "pending",
        toStockStatus: "available",
        fromOwnershipType: existing.ownershipType,
        toOwnershipType: "company",
        actorUserId: userId,
        referenceType: "batch",
        referenceId: batch.id,
        idempotencyKey: keyTaken ? null : idempotencyKey,
      });
      await tx.update(tagBatches).set({ updatedAt: now }).where(eq(tagBatches.id, batch.id));
      return { tag: received, batchCount: batch.quantity, receivedCount: await receivedCountOf(tx, batchId), alreadyRegistered: false };
    }
    if (batch.codeSource === "issued") {
      throw new TagError(`Piece ${parsed.publicCode} was not issued to this batch`, 409, "piece_not_in_batch", { code: parsed.publicCode });
    }

    const now = new Date();
    const nextSerial = batch.quantity + 1;
    const [tag] = await tx.insert(tags).values({
      organizationId,
      publicCode: parsed.publicCode,
      serialNumber: nextSerial,
      batchId: batch.id,
      productType: batch.productType,
      salesProductId: batch.salesProductId,
      status: "inventory",
      registeredAt: now,
      registeredByUserId: userId,
      scannedPayload: rawValue,
      intakeIdempotencyKey: idempotencyKey,
      stockStatus: "available",
      ownershipType: "company",
      stockUpdatedAt: now,
    }).returning();
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "intake",
      fromStockStatus: null,
      toStockStatus: "available",
      fromOwnershipType: null,
      toOwnershipType: "company",
      actorUserId: userId,
      referenceType: "batch",
      referenceId: batch.id,
      idempotencyKey,
    });
    const [updatedBatch] = await tx.update(tagBatches).set({
      quantity: nextSerial,
      updatedAt: now,
    }).where(eq(tagBatches.id, batch.id)).returning({ quantity: tagBatches.quantity });
    return { tag, batchCount: updatedBatch.quantity, receivedCount: await receivedCountOf(tx, batch.id), alreadyRegistered: false };
  });

  if (!result.alreadyRegistered) {
    await recordJourney({
      kind: "execution",
      action: "piece_scanned_into_batch",
      title: `Piece ${result.tag.publicCode} received into stock (${result.receivedCount}/${result.batchCount})`,
      batchId,
      tagId: result.tag.id,
      afterValue: "available",
      metadata: { serialNumber: result.tag.serialNumber, method: parsed.method, receivedCount: result.receivedCount, batchCount: result.batchCount },
    }, journeyContext(userId, source));
  }
  return result;
}

/** How long after a read the intake station may still undo it. */
export const INTAKE_UNDO_WINDOW_MS = 30 * 60_000;
const INTAKE_UNDONE = "intake undone";

/**
 * Undo a read the intake station just made (the operator scanned the wrong piece, or too early). Only a piece
 * received into this open batch within INTAKE_UNDO_WINDOW_MS and untouched since (still house stock, no customer,
 * no chip write, no stock movement but its intake, no sale). The piece goes back to `pending` (not received) and
 * stays registered to the batch: stock movements are append-only, so a received piece is never deleted; reading it
 * again receives it again. Anything else is refused: use the piece's own actions instead.
 */
export async function undoBatchIntake(
  batchId: string,
  tagId: string,
  userId: string | null,
  source: JourneySource = "admin",
  now: Date = new Date(),
): Promise<{ publicCode: string; batchCount: number; receivedCount: number }> {
  const result = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(tagBatches).where(eq(tagBatches.id, batchId)).for("update");
    if (!batch) throw new TagError("Batch not found", 404, "batch_not_found");
    if (batch.status !== "open") throw new TagError("This batch is closed and no longer accepts scans", 409, "batch_closed");
    const tag = await lockTag(tx, tagId);
    if (tag.batchId !== batchId) throw new TagError(`Piece ${tag.publicCode} was not issued to this batch`, 409, "piece_not_in_batch", { code: tag.publicCode });
    const receivedAt = tag.registeredAt ? new Date(tag.registeredAt).getTime() : null;
    if (tag.stockStatus === "pending" || receivedAt === null) {
      throw new TagError(`Piece ${tag.publicCode} has not been received`, 409, "intake_undo_blocked", { code: tag.publicCode });
    }
    if (now.getTime() - receivedAt > INTAKE_UNDO_WINDOW_MS) {
      throw new TagError(`Piece ${tag.publicCode} was received too long ago to undo`, 409, "intake_undo_expired", { code: tag.publicCode });
    }
    // Only its intake (and earlier undos of it) may be on record.
    const [otherMove] = await tx.select({ id: tagStockMovements.id }).from(tagStockMovements)
      .where(and(
        eq(tagStockMovements.tagId, tag.id),
        sql`${tagStockMovements.movementType} NOT IN ('intake', 'issue', 'migration')`,
        sql`NOT (${tagStockMovements.movementType} = 'adjustment' AND ${tagStockMovements.reason} = ${INTAKE_UNDONE})`,
      ))
      .limit(1);
    const [sale] = await tx.select({ id: salesSaleTags.id }).from(salesSaleTags).where(eq(salesSaleTags.tagId, tag.id)).limit(1);
    const touched = tag.stockStatus !== "available" || tag.status !== "inventory" || tag.repId !== null || tag.kitId !== null ||
      tag.leadId !== null || tag.destinationUrl !== null || tag.nfcProvisioningStatus !== "not_programmed" || !!otherMove || !!sale;
    if (touched) throw new TagError(`Piece ${tag.publicCode} changed after it was received`, 409, "intake_undo_blocked", { code: tag.publicCode });

    await tx.update(tags).set({
      stockStatus: "pending",
      registeredAt: null,
      registeredByUserId: null,
      scannedPayload: null,
      intakeIdempotencyKey: null,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, tag.id));
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "adjustment",
      fromStockStatus: "available",
      toStockStatus: "pending",
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: tag.ownershipType,
      actorUserId: userId,
      referenceType: "batch",
      referenceId: batch.id,
      reason: INTAKE_UNDONE,
    });
    await tx.update(tagBatches).set({ updatedAt: now }).where(eq(tagBatches.id, batch.id));
    return { publicCode: tag.publicCode, batchCount: batch.quantity, receivedCount: await receivedCountOf(tx, batchId) };
  });
  await recordJourney({
    kind: "execution",
    action: "piece_intake_undone",
    title: `Read of piece ${result.publicCode} undone (${result.receivedCount}/${result.batchCount})`,
    batchId,
    tagId,
    beforeValue: "available",
    afterValue: "pending",
    metadata: { code: result.publicCode, receivedCount: result.receivedCount, batchCount: result.batchCount },
  }, journeyContext(userId, source));
  return result;
}


export async function setTagInternalUse(
  id: string,
  purpose: string,
  userId: string | null,
  source: JourneySource = "admin",
) {
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    if (tag.stockStatus !== "available" || tag.repId !== null) {
      throw new TagError("Only available house stock can be moved to internal use", 409);
    }
    const [next] = await tx.update(tags).set({
      stockStatus: "internal_use",
      internalUseNote: purpose,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, id)).returning();
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "internal_use",
      fromStockStatus: tag.stockStatus,
      toStockStatus: next.stockStatus,
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: next.ownershipType,
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: next.custodianRepId,
      actorUserId: userId,
      reason: purpose,
    });
    return next;
  });
  await recordJourney({
    kind: "execution",
    action: "piece_internal_use",
    title: `Piece ${updated.publicCode} moved to internal use`,
    content: purpose,
    tagId: updated.id,
    batchId: updated.batchId,
    beforeValue: "available",
    afterValue: "internal_use",
  }, journeyContext(userId, source));
  return updated;
}

export async function returnInternalTagToStock(
  id: string,
  reason: string,
  userId: string | null,
  source: JourneySource = "admin",
) {
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    if (tag.stockStatus !== "internal_use") throw new TagError("Only an internal-use piece can return through this action", 409);
    const [next] = await tx.update(tags).set({
      stockStatus: "available",
      internalUseNote: null,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, id)).returning();
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "return",
      fromStockStatus: tag.stockStatus,
      toStockStatus: next.stockStatus,
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: next.ownershipType,
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: next.custodianRepId,
      actorUserId: userId,
      reason,
    });
    return next;
  });
  await recordJourney({
    kind: "execution",
    action: "piece_returned_to_stock",
    title: `Piece ${updated.publicCode} returned to house stock`,
    content: reason,
    tagId: updated.id,
    batchId: updated.batchId,
    beforeValue: "internal_use",
    afterValue: "available",
  }, journeyContext(userId, source));
  return updated;
}

/**
 * Remove a failed physical piece from usable stock while retaining its code,
 * batch and movement history for manufacturing quality-control reporting.
 */
export async function markTagDamaged(
  id: string,
  reason: string,
  userId: string | null,
  source: JourneySource = "admin",
) {
  const now = new Date();
  let beforeStockStatus = "";
  const updated = await db.transaction(async (tx) => {
    const tag = await lockTag(tx, id);
    beforeStockStatus = tag.stockStatus;
    if (tag.status !== "inventory" || tag.repId !== null || tag.leadId !== null) {
      throw new TagError("Only unassigned company stock can be marked damaged", 409);
    }
    if (tag.stockStatus === "damaged") throw new TagError("This piece is already marked damaged", 409, "tag_already_damaged");
    if (tag.stockStatus !== "available" && tag.stockStatus !== "pending") {
      throw new TagError(`A piece in ${tag.stockStatus} stock cannot be marked damaged`, 409);
    }
    const [next] = await tx.update(tags).set({
      stockStatus: "damaged",
      internalUseNote: null,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, id)).returning();
    await tx.insert(tagStockMovements).values({
      tagId: tag.id,
      movementType: "damage",
      fromStockStatus: tag.stockStatus,
      toStockStatus: next.stockStatus,
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: next.ownershipType,
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: next.custodianRepId,
      actorUserId: userId,
      reason,
    });
    return next;
  });
  await recordJourney({
    kind: "execution",
    action: "piece_damaged",
    title: `Piece ${updated.publicCode} marked damaged`,
    content: reason,
    tagId: updated.id,
    batchId: updated.batchId,
    beforeValue: beforeStockStatus,
    afterValue: "damaged",
  }, journeyContext(userId, source));
  return updated;
}

export async function setBatchIntakeStatus(
  id: string,
  status: "open" | "closed",
  userId: string | null,
  reason: string | null = null,
  source: JourneySource = "admin",
) {
  const now = new Date();
  const [previous] = await db.select().from(tagBatches).where(eq(tagBatches.id, id)).limit(1);
  if (!previous) throw new TagError("Batch not found", 404, "batch_not_found");
  if (previous.status === "cancelled") throw new TagError("A cancelled batch cannot be changed", 409);
  if (previous.status === status) return previous;
  const [batch] = await db.update(tagBatches).set(status === "closed" ? {
    status,
    closedAt: now,
    closedByUserId: userId,
    updatedAt: now,
  } : {
    status,
    reopenedAt: now,
    reopenedByUserId: userId,
    reopenReason: reason,
    updatedAt: now,
  }).where(eq(tagBatches.id, id)).returning();
  await recordJourney({
    kind: "execution",
    action: status === "closed" ? "batch_closed" : "batch_reopened",
    title: `Batch ${batch.batchCode} ${status}`,
    batchId: id,
    beforeValue: previous.status,
    afterValue: status,
    content: reason,
  }, journeyContext(userId, source));
  return batch;
}

export async function updateBatch(
  id: string,
  input: Partial<Pick<BatchInput, "name" | "face" | "vendor" | "notes" | "salesProductId">> & { status?: string },
  userId: string | null = null,
  source: JourneySource = "admin",
) {
  const [previous] = await db.select({ status: tagBatches.status, salesProductId: tagBatches.salesProductId }).from(tagBatches).where(eq(tagBatches.id, id)).limit(1);
  if (!previous) throw new TagError("Batch not found", 404, "batch_not_found");
  const batch = await db.transaction(async (tx) => {
    const productChanged = input.salesProductId !== undefined && input.salesProductId !== previous.salesProductId;
    if (productChanged) await assertPhysicalProduct(tx, input.salesProductId!);
    const [updated] = await tx
      .update(tagBatches)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(tagBatches.id, id))
      .returning();
    if (productChanged) {
      // A new catalog product for the run reaches only the pieces that followed the batch's old one (or had none) and
      // are not sold: a piece mapped on its own keeps its product, and a sold piece keeps the product it was sold as.
      const now = new Date();
      const sold = sql`EXISTS (SELECT 1 FROM sales_sale_tags st WHERE st.tag_id = ${tags.id} AND st.status = 'active')`;
      const followsBatch = previous.salesProductId === null
        ? sql`${tags.salesProductId} IS NULL`
        : sql`(${tags.salesProductId} IS NULL OR ${tags.salesProductId} = ${previous.salesProductId})`;
      if (previous.salesProductId !== null) {
        // Sold pieces that only inherited the batch's product are pinned to it before the batch changes.
        await tx.update(tags).set({ salesProductId: previous.salesProductId, updatedAt: now })
          .where(and(eq(tags.batchId, id), isNull(tags.salesProductId), sold));
      }
      await tx.update(tags).set({ salesProductId: input.salesProductId, updatedAt: now })
        .where(and(eq(tags.batchId, id), followsBatch, sql`NOT ${sold}`));
    }
    return updated;
  });
  if (!batch) throw new TagError("Batch not found", 404, "batch_not_found");
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

// The latest production step written to a batch's journey (3D Printing records art, slicing, printing, assembly).
const PRODUCTION_STEP_SQL = sql`(
  SELECT j.action FROM tag_journey_entries j
  WHERE j.batch_id = b.id AND j.status = 'active'
    AND j.action IN ('art_built', 'plate_built', 'sliced', 'printed', 'nfc_inserted', 'assembled', 'tested')
  ORDER BY j.occurred_at DESC LIMIT 1
)`;

interface BatchRow {
  id: string; batch_code: string; name: string; product_type: string; sales_product_id: number | null;
  face: string | null; vendor: string | null; quantity: number; status: string; code_source: string; print_job_id: string | null;
  notes: string | null; created_at: Date; tag_count: number; pending_count: number; house_count: number; hand_out_count: number;
  with_resellers_count: number; sold_count: number; damaged_count: number; active_count: number; nfc_verified_count: number;
  last_production_action: string | null;
}

const BATCH_SELECT = sql`
  SELECT b.id, b.batch_code, b.name, b.product_type, b.sales_product_id, b.face, b.vendor, count(t.id)::int AS quantity,
    b.status, b.code_source, b.print_job_id, b.notes, b.created_at, b.created_by_user_id, b.updated_at,
    count(t.id)::int AS tag_count,
    ${countMetricSql("notReceived")} AS pending_count,
    ${countMetricSql("house")} AS house_count,
    ${countMetricSql("handOut")} AS hand_out_count,
    ${countMetricSql("withResellers")} AS with_resellers_count,
    ${countMetricSql("sold")} AS sold_count,
    ${countMetricSql("damaged")} AS damaged_count,
    ${countMetricSql("live")} AS active_count,
    count(t.id) FILTER (WHERE t.nfc_provisioning_status IN ('verified', 'locked'))::int AS nfc_verified_count,
    ${PRODUCTION_STEP_SQL} AS last_production_action
  FROM tag_batches b
  LEFT JOIN tags t ON t.batch_id = b.id`;

function batchItem(b: BatchRow): TagBatchItem {
  const tagCount = Number(b.tag_count);
  const pendingCount = Number(b.pending_count);
  return {
    id: b.id,
    batchCode: b.batch_code,
    name: b.name,
    productType: b.product_type,
    salesProductId: b.sales_product_id,
    face: resolveTagFace({ batchFace: b.face, productType: b.product_type }),
    ownFace: b.face,
    vendor: b.vendor,
    quantity: Number(b.quantity),
    status: b.status,
    codeSource: b.code_source,
    printJobId: b.print_job_id,
    stage: batchStage({ status: b.status, codeSource: b.code_source, tagCount, pendingCount, lastProductionAction: b.last_production_action }),
    lastProductionAction: b.last_production_action,
    notes: b.notes,
    createdAt: iso(b.created_at)!,
    tagCount,
    pendingCount,
    receivedCount: tagCount - pendingCount,
    houseCount: Number(b.house_count),
    handOutCount: Number(b.hand_out_count),
    withResellersCount: Number(b.with_resellers_count),
    soldCount: Number(b.sold_count),
    damagedCount: Number(b.damaged_count),
    activeCount: Number(b.active_count),
    nfcVerifiedCount: Number(b.nfc_verified_count),
  };
}

export async function listBatches(): Promise<TagBatchItem[]> {
  const list = await rows<BatchRow>(sql`${BATCH_SELECT} GROUP BY b.id ORDER BY b.created_at DESC`);
  return list.map(batchItem);
}

/** What managers need to pick a batch (Give a kit, the Pieces filter): no vendor, notes or production details. */
export async function listBatchOptions(): Promise<TagBatchOption[]> {
  return (await listBatches()).map((b) => ({
    id: b.id,
    batchCode: b.batchCode,
    name: b.name,
    productType: b.productType,
    face: b.face,
    houseCount: b.houseCount,
    handOutCount: b.handOutCount,
  }));
}

export async function getBatch(id: string) {
  const [batch] = await rows<BatchRow & { created_by_user_id: string | null; updated_at: Date }>(
    sql`${BATCH_SELECT} WHERE b.id = ${id} GROUP BY b.id`,
  );
  if (!batch) return null;
  return {
    ...batchItem(batch),
    face: batch.face,
    createdByUserId: batch.created_by_user_id,
    createdAt: batch.created_at,
    updatedAt: batch.updated_at,
  };
}

/** One batch with its stage, counts and pieces: the production view (MCP `tags_batch_get`). */
export async function getBatchProduction(idOrCode: string) {
  const [ref] = await rows<{ id: string }>(sql`
    SELECT id FROM tag_batches WHERE id::text = ${idOrCode} OR batch_code = ${idOrCode.trim().toUpperCase()} LIMIT 1
  `);
  if (!ref) return null;
  const batch = await getBatch(ref.id);
  const pieces = await db.select({
    serialNumber: tags.serialNumber,
    publicCode: tags.publicCode,
    status: tags.status,
    stockStatus: tags.stockStatus,
    nfcStatus: tags.nfcProvisioningStatus,
    registeredAt: tags.registeredAt,
    repId: tags.repId,
    leadId: tags.leadId,
  }).from(tags).where(eq(tags.batchId, ref.id)).orderBy(tags.serialNumber, tags.publicCode);
  return { batch, pieces };
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
    id: string; public_code: string; face: string | null; product_type: string; batch_face: string | null; batch_code: string | null;
    lead_name: string | null; rep_name: string | null; qr: number; nfc: number;
  }>(sql`
    SELECT t.id, t.public_code, t.face, t.product_type, b.face AS batch_face, b.batch_code, l.name AS lead_name, r.display_name AS rep_name,
      count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
      count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
    FROM tag_events e
    JOIN tags t ON t.id = e.tag_id
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    WHERE ${where} AND ${COUNTABLE}
    GROUP BY t.id, t.public_code, b.face, b.batch_code, l.name, r.display_name
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
      id: t.id, publicCode: t.public_code, productType: t.product_type, face: faceOf(t), batchCode: t.batch_code,
      leadName: t.lead_name, repName: t.rep_name, qr: Number(t.qr), nfc: Number(t.nfc),
    })),
  };
}

export async function getOverview(now: Date = new Date(), timezoneOffsetMinutes = 0): Promise<TagOverview> {
  // Browser Date#getTimezoneOffset is minutes from local time to UTC. Shift to
  // the user's wall clock, take midnight, then shift back to the real instant.
  const localNow = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const dayStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + timezoneOffsetMinutes * 60_000);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  // Digital statuses count by tags.status alone, so each card matches its
  // `?status=` list; damaged is the physical stock status (`?stock=damaged`).
  const statusRows = await rows<{ status: string; count: number }>(sql`
    SELECT status, count(*)::int AS count FROM tags GROUP BY status
  `);
  // The stock numbers every Tags screen shares (shared/tagMetrics.ts).
  const [stockRow] = await rows<{
    house: number; with_resellers: number; damaged: number; not_received: number; sold: number; live: number;
    chip_pending: number; scanned_not_live: number; no_product: number;
  }>(sql`
    SELECT ${countMetricSql("house")} AS house,
           ${countMetricSql("withResellers")} AS with_resellers,
           ${countMetricSql("damaged")} AS damaged,
           ${countMetricSql("notReceived")} AS not_received,
           ${countMetricSql("sold")} AS sold,
           ${countMetricSql("live")} AS live,
           ${countQueueSql("chipPending", now)} AS chip_pending,
           ${countQueueSql("scannedNotLive", now)} AS scanned_not_live,
           ${countQueueSql("noProduct", now)} AS no_product
    FROM tags t
  `);
  // The other two queues are not pieces: paid Stuscle orders waiting for their pieces, and batches still receiving.
  const [queueRow] = await rows<{ stuscle_orders: number; batches_not_received: number }>(sql`
    SELECT (SELECT count(*)::int FROM tag_acquisitions a WHERE a.status = 'pending') AS stuscle_orders,
           (SELECT count(DISTINCT b.id)::int FROM tag_batches b JOIN tags t ON t.batch_id = b.id
             WHERE b.status <> 'cancelled' AND ${stockMetricSql("notReceived")}) AS batches_not_received
  `);
  const counts: TagOverview["counts"] = { total: 0, inventory: 0, assigned: 0, active: 0, disabled: 0, retired: 0, damaged: Number(stockRow?.damaged ?? 0) };
  const stock = { house: Number(stockRow?.house ?? 0), withResellers: Number(stockRow?.with_resellers ?? 0) };
  const funnel: TagOverview["funnel"] = {
    notReceived: Number(stockRow?.not_received ?? 0),
    house: stock.house,
    withResellers: stock.withResellers,
    sold: Number(stockRow?.sold ?? 0),
    live: Number(stockRow?.live ?? 0),
  };
  const queues: TagOverview["queues"] = {
    stuscleOrders: Number(queueRow?.stuscle_orders ?? 0),
    batchesNotReceived: Number(queueRow?.batches_not_received ?? 0),
    chipPending: Number(stockRow?.chip_pending ?? 0),
    scannedNotLive: Number(stockRow?.scanned_not_live ?? 0),
    noProduct: Number(stockRow?.no_product ?? 0),
  };
  for (const r of statusRows) {
    counts.total += Number(r.count);
    if (r.status in counts) counts[r.status as TagStatus] = Number(r.count);
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
    id: number; tag_id: string; public_code: string; face: string | null; product_type: string; batch_face: string | null; batch_code: string | null;
    lead_name: string | null; access_method: string; event_type: string; device_type: string | null; occurred_at: Date;
  }>(sql`
    SELECT e.id, e.tag_id, t.public_code, t.face, t.product_type, b.face AS batch_face, b.batch_code, l.name AS lead_name,
           e.access_method, e.event_type, e.device_type, e.occurred_at
    FROM tag_events e
    JOIN tags t ON t.id = e.tag_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN sales_leads l ON l.id = e.lead_id
    WHERE NOT e.is_bot
    ORDER BY e.occurred_at DESC
    LIMIT 15
  `);

  const recentActivations = await rows<{
    id: string; public_code: string; face: string | null; product_type: string; batch_face: string | null; batch_code: string | null;
    lead_name: string | null; rep_name: string | null; activated_at: Date;
  }>(sql`
    SELECT t.id, t.public_code, t.face, t.product_type, b.face AS batch_face, b.batch_code, l.name AS lead_name, r.display_name AS rep_name, t.activated_at
    FROM tags t
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    LEFT JOIN sales_reps r ON r.id = t.rep_id
    WHERE t.status = 'active' AND t.activated_at IS NOT NULL
    ORDER BY t.activated_at DESC
    LIMIT 5
  `);

  return {
    counts,
    stock,
    funnel,
    queues,
    interactions: { today: Number(m?.today ?? 0), last7: Number(m?.last7 ?? 0), last30: Number(m?.last30 ?? 0) },
    split30: { qr: Number(m?.qr30 ?? 0), nfc: Number(m?.nfc30 ?? 0) },
    approxUnique30: Number(m?.unique30 ?? 0),
    recentEvents: recentEvents.map((e) => ({
      id: Number(e.id),
      tagId: e.tag_id,
      publicCode: e.public_code,
      productType: e.product_type,
      face: faceOf(e),
      batchCode: e.batch_code,
      leadName: e.lead_name,
      accessMethod: e.access_method,
      eventType: e.event_type,
      deviceType: e.device_type,
      occurredAt: iso(e.occurred_at)!,
    })),
    recentActivations: recentActivations.map((a) => ({
      id: a.id, publicCode: a.public_code, productType: a.product_type, face: faceOf(a), batchCode: a.batch_code,
      leadName: a.lead_name, repName: a.rep_name, activatedAt: iso(a.activated_at)!,
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
  const list = await rows<{ lead_id: number; name: string | null; pieces: number; live: number; scans30: number }>(sql`
    SELECT t.lead_id,
           (SELECT l.name FROM sales_leads l WHERE l.id = t.lead_id) AS name,
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
  return list.map((r) => ({ leadId: r.lead_id, name: r.name?.trim() || null, pieces: r.pieces, live: r.live, scansLast30: r.scans30 }));
}

/**
 * A phone opened this tag's /n/ link after someone signed in reported writing
 * the chip without a read-back (NFC Tools on an iPhone: "programmed"). That tap
 * is the check of that write, so the chip becomes verified. The link alone is
 * no proof (anyone can open it): a chip nobody reported writing, or whose write
 * failed, stays as it is and keeps its place in the production queue.
 */
export async function confirmNfcFromTap(tagId: string): Promise<void> {
  const now = new Date();
  await db
    .update(tags)
    .set({ nfcProvisioningStatus: "verified", nfcVerifiedAt: now, nfcProgrammedAt: sql`coalesce(${tags.nfcProgrammedAt}, ${now})`, updatedAt: now })
    .where(and(eq(tags.id, tagId), eq(tags.nfcProvisioningStatus, "programmed")));
}

/**
 * The Tags dashboard: stock, sales, scans per day (QR vs NFC), the pieces and
 * customers scanned most, the phones used and the chips still unwritten.
 * `repId` null means every rep (a manager in admin mode).
 */
export async function getTagDashboard(repId: number | null, days = 30, now: Date = new Date()): Promise<TagDashboard> {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const tagScope = repId === null ? sql`true` : sql`t.rep_id = ${repId}`;
  const eventScope = repId === null ? sql`true` : sql`e.rep_id = ${repId}`;
  const inPeriod = sql`e.occurred_at >= ${since} AND ${COUNTABLE} AND ${eventScope}`;

  // The shared stock numbers (shared/tagMetrics.ts), so the dashboard reads what Overview, Inventory and
  // Resellers read: "in stock" is the unsold stock in resellers' hands (the rep's own, for a rep), set-up and
  // live pieces included; "sold" is an active financial sale in the period (as the Resellers report counts it).
  const [totals] = await rows<{ in_stock: number; active: number; sold: number; missing: number }>(sql`
    SELECT
      ${countMetricSql("withResellers")} AS in_stock,
      count(*) FILTER (WHERE t.status = 'active')::int AS active,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM sales_sale_tags st WHERE st.tag_id = t.id AND st.status = 'active' AND st.sold_at >= ${since}
      ))::int AS sold,
      count(*) FILTER (WHERE t.status IN ('assigned', 'active') AND t.nfc_provisioning_status IN ('not_programmed', 'failed'))::int AS missing
    FROM tags t WHERE ${tagScope}
  `);
  const [scans] = await rows<{ qr: number; nfc: number; visitors: number }>(sql`
    SELECT count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
           count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc,
           count(DISTINCT e.visitor_day_key)::int AS visitors
    FROM tag_events e WHERE ${inPeriod}
  `);
  const daily = await rows<{ day: string; qr: number; nfc: number }>(sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
           count(e.id) FILTER (WHERE e.access_method = 'qr')::int AS qr,
           count(e.id) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
    FROM generate_series(${since}::timestamptz, ${now}::timestamptz, interval '1 day') d
    LEFT JOIN tag_events e ON e.occurred_at >= d AND e.occurred_at < d + interval '1 day' AND ${COUNTABLE} AND ${eventScope}
    GROUP BY d ORDER BY d
  `);
  const topPieces = await rows<{
    id: string; public_code: string; product_type: string; face: string | null; batch_face: string | null;
    batch_code: string | null; label: string | null; lead_name: string | null; scans: number; qr: number; nfc: number;
  }>(sql`
    SELECT t.id, t.public_code, t.product_type, t.face, b.face AS batch_face, b.batch_code,
           t.label, l.name AS lead_name, count(*)::int AS scans,
           count(*) FILTER (WHERE e.access_method = 'qr')::int AS qr,
           count(*) FILTER (WHERE e.access_method = 'nfc')::int AS nfc
    FROM tag_events e
    JOIN tags t ON t.id = e.tag_id
    LEFT JOIN tag_batches b ON b.id = t.batch_id
    LEFT JOIN sales_leads l ON l.id = t.lead_id
    WHERE ${inPeriod}
    GROUP BY t.id, t.public_code, b.face, b.batch_code, t.label, l.name
    ORDER BY scans DESC LIMIT 5
  `);
  const topCustomers = await rows<{ lead_id: number; name: string; pieces: number; scans: number }>(sql`
    SELECT l.id AS lead_id, l.name, count(DISTINCT t.id)::int AS pieces, count(*)::int AS scans
    FROM tag_events e JOIN tags t ON t.id = e.tag_id JOIN sales_leads l ON l.id = t.lead_id
    WHERE ${inPeriod}
    GROUP BY l.id, l.name
    ORDER BY scans DESC LIMIT 5
  `);
  const devices = await rows<{ os: string | null; scans: number }>(sql`
    SELECT e.os_family AS os, count(*)::int AS scans
    FROM tag_events e WHERE ${inPeriod}
    GROUP BY e.os_family ORDER BY scans DESC LIMIT 4
  `);
  const recentScans = await rows<{
    id: number; tag_id: string; public_code: string; product_type: string; face: string | null;
    batch_face: string | null; batch_code: string | null; lead_name: string | null;
    access_method: string; occurred_at: Date | string;
  }>(sql`
    SELECT recent.* FROM (
      SELECT DISTINCT ON (t.id)
             e.id, t.id AS tag_id, t.public_code, t.product_type, t.face,
             b.face AS batch_face, b.batch_code, l.name AS lead_name,
             e.access_method, e.occurred_at
      FROM tag_events e
      JOIN tags t ON t.id = e.tag_id
      LEFT JOIN tag_batches b ON b.id = t.batch_id
      LEFT JOIN sales_leads l ON l.id = t.lead_id
      WHERE ${COUNTABLE} AND ${eventScope}
      ORDER BY t.id, e.occurred_at DESC
    ) recent
    ORDER BY recent.occurred_at DESC
    LIMIT 10
  `);

  return {
    days,
    inStock: Number(totals?.in_stock ?? 0),
    active: Number(totals?.active ?? 0),
    soldInPeriod: Number(totals?.sold ?? 0),
    scans: { qr: Number(scans?.qr ?? 0), nfc: Number(scans?.nfc ?? 0) },
    visitors: Number(scans?.visitors ?? 0),
    chipsMissing: Number(totals?.missing ?? 0),
    daily: daily.map((d) => ({ day: d.day, qr: Number(d.qr), nfc: Number(d.nfc) })),
    topPieces: topPieces.map((p) => ({
      id: p.id,
      publicCode: p.public_code,
      productType: p.product_type,
      face: faceOf(p),
      batchCode: p.batch_code,
      label: p.label,
      leadName: p.lead_name,
      scans: Number(p.scans),
      qr: Number(p.qr),
      nfc: Number(p.nfc),
    })),
    topCustomers: topCustomers.map((c) => ({ leadId: Number(c.lead_id), name: c.name, pieces: Number(c.pieces), scans: Number(c.scans) })),
    devices: devices.map((d) => ({ os: d.os ?? "other", scans: Number(d.scans) })),
    recentScans: recentScans.map((scan) => ({
      id: Number(scan.id),
      tagId: scan.tag_id,
      publicCode: scan.public_code,
      productType: scan.product_type,
      face: faceOf(scan),
      batchCode: scan.batch_code,
      leadName: scan.lead_name,
      accessMethod: scan.access_method,
      occurredAt: iso(scan.occurred_at)!,
    })),
  };
}

