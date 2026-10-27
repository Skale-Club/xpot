import { createHash } from "crypto";
import { and, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db.js";
import {
  salesLeads,
  salesProductPriceTiers,
  salesProducts,
  salesReps,
  salesSaleItems,
  salesSales,
  salesSaleTags,
  salesSyncEvents,
  salesVisits,
  tagAcquisitionLines,
  tagAcquisitionUnits,
  tagAcquisitions,
  tagBatches,
  tagStockMovements,
  tags,
} from "#shared/schema.js";
import { canWorkOnTag, type TagActor } from "#shared/tagAccess.js";
import type { LinkableSaleItem } from "#shared/tagsApi.js";
import { tagSystemReason } from "#shared/tagReasons.js";
import { allocateSaleLineTotals, paymentStatusFor, resolveUnitPriceCents } from "#shared/pricing.js";
import { resolveTagUnitCost, type TagSaleCreateInput } from "#shared/tagSales.js";
import { salesStorage } from "../storage-sales.js";
import { leadUsableBy } from "./repository.js";

export class TagSaleError extends Error {
  constructor(message: string, public status = 400, public code = "tag_sale_invalid", public params?: Record<string, string | number>) {
    super(message);
    this.name = "TagSaleError";
  }
}

function fingerprint(input: TagSaleCreateInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function createTagSale(input: TagSaleCreateInput, actor: TagActor, idempotencyKey: string) {
  const normalizedKey = idempotencyKey.trim();
  if (!normalizedKey || normalizedKey.length > 120) {
    throw new TagSaleError("A valid Idempotency-Key header is required", 400, "idempotency_key_required");
  }
  const requestFingerprint = fingerprint(input);
  const sellerRepId = input.sellerRepId ?? actor.repId;
  if (sellerRepId !== actor.repId && !actor.isManager) {
    throw new TagSaleError("Only managers can record a sale for another seller", 403, "seller_forbidden");
  }

  const transactionResult = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: salesSales.id, fingerprint: salesSales.idempotencyFingerprint })
      .from(salesSales)
      .where(and(eq(salesSales.repId, sellerRepId), eq(salesSales.idempotencyKey, normalizedKey)))
      .limit(1);
    if (existing) {
      if (existing.fingerprint !== requestFingerprint) {
        throw new TagSaleError("This idempotency key was already used for a different sale", 409, "idempotency_conflict");
      }
      return { saleId: existing.id, replayed: true };
    }

    const [[seller], [lead]] = await Promise.all([
      tx.select({ id: salesReps.id, costPolicy: salesReps.costPolicy, costPolicyConfiguredAt: salesReps.costPolicyConfiguredAt }).from(salesReps).where(eq(salesReps.id, sellerRepId)).limit(1),
      tx.select({ id: salesLeads.id, organizationId: salesLeads.organizationId, ownerRepId: salesLeads.ownerRepId }).from(salesLeads).where(eq(salesLeads.id, input.leadId)).limit(1),
    ]);
    if (!seller) throw new TagSaleError("Seller not found", 404, "seller_not_found");
    if (!seller.costPolicyConfiguredAt) {
      throw new TagSaleError("The seller's Tags cost policy must be confirmed by an administrator", 409, "seller_cost_policy_unconfigured");
    }
    if (!lead) throw new TagSaleError("Customer not found", 404, "lead_not_found");
    if (!actor.isManager && !(await leadUsableBy(actor, lead.id, tx))) {
      throw new TagSaleError("This customer is not assigned to you", 403, "lead_forbidden");
    }
    if (input.visitId) {
      const [visit] = await tx.select().from(salesVisits).where(eq(salesVisits.id, input.visitId)).limit(1);
      if (!visit || visit.leadId !== input.leadId) {
        throw new TagSaleError("Visit does not belong to this customer", 400, "visit_mismatch");
      }
    }

    const allTagIds = input.lines.flatMap((line) => line.tagIds);
    const tagRows = await tx
      .select({
        id: tags.id,
        publicCode: tags.publicCode,
        repId: tags.repId,
        organizationId: tags.organizationId,
        leadId: tags.leadId,
        status: tags.status,
        stockStatus: tags.stockStatus,
        ownershipType: tags.ownershipType,
        custodianRepId: tags.custodianRepId,
        ownProductId: tags.salesProductId,
        batchProductId: tagBatches.salesProductId,
      })
      .from(tags)
      .leftJoin(tagBatches, eq(tags.batchId, tagBatches.id))
      .where(inArray(tags.id, allTagIds))
      // Lock only the physical pieces. PostgreSQL rejects a blanket FOR UPDATE
      // when a LEFT JOIN is present because the batch is the nullable side.
      .for("update", { of: tags });
    if (tagRows.length !== allTagIds.length) {
      throw new TagSaleError("One or more pieces were not found", 404, "tag_not_found");
    }
    const tagsById = new Map(tagRows.map((tag) => [tag.id, tag]));

    const activeLinks = await tx
      .select({ tagId: salesSaleTags.tagId })
      .from(salesSaleTags)
      .where(and(inArray(salesSaleTags.tagId, allTagIds), eq(salesSaleTags.status, "active")));
    if (activeLinks.length) {
      const codes = activeLinks.map((link) => tagsById.get(link.tagId)?.publicCode ?? link.tagId);
      throw new TagSaleError(`Already sold: ${codes.join(", ")}`, 409, "tag_already_sold", { codes: codes.join(", ") });
    }

    const acquisitionRows = await tx
      .select({
        unitId: tagAcquisitionUnits.id,
        tagId: tagAcquisitionUnits.tagId,
        unitCostCents: tagAcquisitionUnits.unitCostCents,
        overrideCostCents: tagAcquisitionUnits.overrideCostCents,
        acquisitionRepId: tagAcquisitions.repId,
      })
      .from(tagAcquisitionUnits)
      .innerJoin(tagAcquisitionLines, eq(tagAcquisitionUnits.acquisitionLineId, tagAcquisitionLines.id))
      .innerJoin(tagAcquisitions, eq(tagAcquisitionLines.acquisitionId, tagAcquisitions.id))
      .where(and(inArray(tagAcquisitionUnits.tagId, allTagIds), isNull(tagAcquisitionUnits.returnedAt), eq(tagAcquisitions.status, "fulfilled")));
    const acquisitionsByTag = new Map(acquisitionRows.map((row) => [row.tagId, row]));

    const productIds = Array.from(new Set(input.lines.map((line) => line.salesProductId)));
    const [products, tiers] = await Promise.all([
      tx.select().from(salesProducts).where(inArray(salesProducts.id, productIds)),
      tx.select().from(salesProductPriceTiers).where(inArray(salesProductPriceTiers.productId, productIds)),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const currencies = new Set(products.map((product) => product.currency));
    if (products.length !== productIds.length) throw new TagSaleError("One or more products were not found", 404, "product_not_found");
    if (products.some((product) => !product.isActive)) throw new TagSaleError("One or more products are inactive", 409, "product_inactive");
    if (currencies.size !== 1) throw new TagSaleError("All products in a sale must use the same currency", 400, "currency_mismatch");

    const units: Array<{
      tagId: string;
      productId: number;
      description: string;
      unitPriceCents: number;
      unitCostCents: number;
      acquisitionUnitId: string | null;
      costSource: "policy_zero" | "manual_override" | "acquisition";
    }> = [];

    for (const line of input.lines) {
      const product = productsById.get(line.salesProductId)!;
      const productTiers = tiers.filter((tier) => tier.productId === product.id);
      const unitPriceCents = line.unitPriceCents ?? resolveUnitPriceCents(product.basePriceCents, productTiers, line.tagIds.length);
      for (const tagId of line.tagIds) {
        const tag = tagsById.get(tagId)!;
        const effectiveProductId = tag.ownProductId ?? tag.batchProductId;
        if (effectiveProductId !== line.salesProductId) {
          throw new TagSaleError(`Piece ${tag.publicCode} is not mapped to ${product.name}`, 409, "tag_product_mismatch", { code: tag.publicCode, product: product.name });
        }
        if (tag.repId !== null && tag.repId !== sellerRepId) {
          throw new TagSaleError(`Piece ${tag.publicCode} belongs to another seller`, 403, "tag_owner_mismatch", { code: tag.publicCode });
        }
        // A reseller sells the pieces in their kit, never house stock they do not hold (canWorkOnTag, as everywhere
        // else in Tags): selling one would take it into their hands, and cancelling the sale would keep it there.
        if (!actor.isManager && !canWorkOnTag(actor, tag)) {
          throw new TagSaleError(`Piece ${tag.publicCode} is not in your kit`, 403, "tag_not_yours", { code: tag.publicCode });
        }
        if (tag.status === "retired") {
          throw new TagSaleError(`Piece ${tag.publicCode} is retired`, 409, "tag_retired", { code: tag.publicCode });
        }
        if (tag.stockStatus !== "available") {
          throw new TagSaleError(`Piece ${tag.publicCode} is not available`, 409, "tag_not_available", { code: tag.publicCode });
        }
        if (tag.leadId !== null && tag.leadId !== input.leadId) {
          throw new TagSaleError(`Piece ${tag.publicCode} is assigned to another customer`, 409, "tag_lead_mismatch", { code: tag.publicCode });
        }
        const acquisition = acquisitionsByTag.get(tagId);
        if (seller.costPolicy === "acquisition" && acquisition?.acquisitionRepId !== sellerRepId) {
          throw new TagSaleError(`Acquisition cost is missing for ${tag.publicCode}`, 409, "tag_cost_missing", { code: tag.publicCode });
        }
        let cost;
        try {
          cost = resolveTagUnitCost({
            costPolicy: seller.costPolicy === "zero" ? "zero" : "acquisition",
            acquisitionCostCents: acquisition?.unitCostCents ?? null,
            overrideCostCents: acquisition?.overrideCostCents ?? null,
          });
        } catch {
          throw new TagSaleError(`Acquisition cost is missing for ${tag.publicCode}`, 409, "tag_cost_missing", { code: tag.publicCode });
        }
        units.push({
          tagId,
          productId: product.id,
          description: product.name,
          unitPriceCents,
          unitCostCents: cost.costCents,
          acquisitionUnitId: acquisition?.unitId ?? null,
          costSource: cost.source,
        });
      }
    }

    const allocated = allocateSaleLineTotals(units.map((unit) => ({ quantity: 1, unitPriceCents: unit.unitPriceCents })), input.discountCents ?? 0);
    const subtotalCents = allocated.reduce((sum, line) => sum + line.grossCents, 0);
    const discountCents = allocated.reduce((sum, line) => sum + line.discountCents, 0);
    const totalCents = allocated.reduce((sum, line) => sum + line.netCents, 0);
    const paymentStatus = input.paymentStatus ?? "paid";
    if (paymentStatus === "partial" && (!input.paidCents || input.paidCents >= totalCents)) {
      throw new TagSaleError("A partial payment must be greater than zero and less than the sale total", 400, "partial_payment_invalid");
    }
    const paidCents = paymentStatus === "paid"
      ? totalCents
      : paymentStatus === "unpaid"
        ? 0
        : Math.min(input.paidCents ?? totalCents, totalCents);
    const finalPaymentStatus = input.paymentStatus ?? paymentStatusFor(paidCents, totalCents);
    const soldAt = input.soldAt ? new Date(input.soldAt) : new Date();

    const [sale] = await tx.insert(salesSales).values({
      organizationId: lead.organizationId,
      leadId: input.leadId,
      repId: sellerRepId,
      visitId: input.visitId ?? null,
      source: "tags",
      idempotencyKey: normalizedKey,
      idempotencyFingerprint: requestFingerprint,
      kind: "direct",
      status: "completed",
      currency: products[0]?.currency ?? "USD",
      subtotalCents,
      discountCents,
      totalCents,
      paymentStatus: finalPaymentStatus,
      paymentMethod: input.paymentMethod ?? null,
      paidCents,
      paidAt: finalPaymentStatus === "paid" ? soldAt : null,
      soldAt,
      notes: input.notes ?? null,
    }).returning();

    const items = await tx.insert(salesSaleItems).values(units.map((unit, index) => ({
      saleId: sale.id,
      productId: unit.productId,
      description: unit.description,
      quantity: 1,
      unitPriceCents: unit.unitPriceCents,
      unitCostCents: unit.unitCostCents,
      totalCents: allocated[index].grossCents,
      allocatedDiscountCents: allocated[index].discountCents,
      netTotalCents: allocated[index].netCents,
    }))).returning();

    await tx.insert(salesSaleTags).values(units.map((unit, index) => ({
      saleId: sale.id,
      saleItemId: items[index].id,
      tagId: unit.tagId,
      acquisitionUnitId: unit.acquisitionUnitId,
      costBasisCents: unit.unitCostCents,
      costSource: unit.costSource,
      soldAt,
    })));
    await tx.update(tags).set({
      leadId: input.leadId,
      repId: sellerRepId,
      soldAt,
      assignedAt: soldAt,
      stockStatus: "sold",
      ownershipType: "customer",
      custodianRepId: null,
      stockUpdatedAt: soldAt,
      updatedAt: new Date(),
    }).where(inArray(tags.id, allTagIds));
    await tx.insert(tagStockMovements).values(tagRows.map((tag) => ({
      tagId: tag.id,
      movementType: "sale",
      fromStockStatus: tag.stockStatus,
      toStockStatus: "sold",
      fromOwnershipType: tag.ownershipType,
      toOwnershipType: "customer",
      fromCustodianRepId: tag.custodianRepId,
      toCustodianRepId: null,
      referenceType: "sale",
      referenceId: String(sale.id),
      actorUserId: actor.userId,
    })));
    await tx.update(salesLeads).set({ status: "customer", updatedAt: new Date() }).where(eq(salesLeads.id, input.leadId));
    await tx.insert(salesSyncEvents).values({
      provider: "xphere",
      entityType: "sales_sale",
      entityId: String(sale.id),
      direction: "outbound",
      status: "pending",
      payload: { saleId: sale.id, source: "tags" },
    });
    return { saleId: sale.id, replayed: false };
  });
  const createdSaleId = transactionResult.saleId;

  const sale = await salesStorage.getSale(createdSaleId);
  if (!sale) throw new TagSaleError("Sale could not be loaded", 500, "sale_load_failed");
  const pieces = await db
    .select({
      tagId: salesSaleTags.tagId,
      saleItemId: salesSaleTags.saleItemId,
      publicCode: tags.publicCode,
      costBasisCents: salesSaleTags.costBasisCents,
      costSource: salesSaleTags.costSource,
      status: salesSaleTags.status,
    })
    .from(salesSaleTags)
    .innerJoin(tags, eq(salesSaleTags.tagId, tags.id))
    .where(eq(salesSaleTags.saleId, createdSaleId));
  return { ...sale, pieces, replayed: transactionResult.replayed };
}

/**
 * A cancelled sale gives its pieces back: the sale links end, and each piece still marked
 * sold by this sale returns to stock in its seller's hands (rep_id is the seller since the
 * sale), with the ownership it had before the sale, recorded as a `restore` movement that
 * points at the sale. A piece whose stock moved on since (damaged, lost) keeps that status.
 * It keeps its customer and destination; removing the customer is a separate step.
 */
export async function cancelTagLinksForSale(saleId: number, actorUserId: string | null = null) {
  await db.transaction((tx) => releaseSalePieces(tx, saleId, actorUserId));
}

/**
 * Cancel a direct sale and give its pieces back in one transaction, so a failure
 * leaves the sale as it was instead of cancelled with pieces still sold. The sale
 * row is locked first (linkTagToSale takes it in the same order), so a piece
 * cannot be linked while the sale is being cancelled. An already cancelled sale
 * is not touched, but any piece still linked to it is released (a retry repairs
 * a cancellation from before this was one transaction).
 */
export async function cancelSale(saleId: number, reason: string | null, actorUserId: string | null) {
  await db.transaction(async (tx) => {
    const [sale] = await tx.select({ status: salesSales.status }).from(salesSales).where(eq(salesSales.id, saleId)).for("update");
    if (!sale) throw new TagSaleError("Sale not found", 404, "sale_not_found");
    if (sale.status !== "cancelled") {
      const now = new Date();
      await tx.update(salesSales).set({ status: "cancelled", cancelledAt: now, cancelReason: reason, updatedAt: now })
        .where(eq(salesSales.id, saleId));
    }
    await releaseSalePieces(tx, saleId, actorUserId);
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function releaseSalePieces(tx: Tx, saleId: number, actorUserId: string | null) {
  const links = await tx
    .select({ tagId: salesSaleTags.tagId })
    .from(salesSaleTags)
    .where(and(eq(salesSaleTags.saleId, saleId), eq(salesSaleTags.status, "active")))
    .for("update");
  if (!links.length) return;
  const now = new Date();
  const tagIds = links.map((link) => link.tagId);
  await tx.update(salesSaleTags).set({ status: "cancelled", endedAt: now }).where(and(eq(salesSaleTags.saleId, saleId), eq(salesSaleTags.status, "active")));
  await tx.update(tags).set({ soldAt: null, updatedAt: now }).where(inArray(tags.id, tagIds));

  const [pieces, saleMovements] = await Promise.all([
    tx.select({ id: tags.id, repId: tags.repId, stockStatus: tags.stockStatus, ownershipType: tags.ownershipType, custodianRepId: tags.custodianRepId })
      .from(tags).where(inArray(tags.id, tagIds)).for("update"),
    tx.select({ tagId: tagStockMovements.tagId, fromOwnershipType: tagStockMovements.fromOwnershipType })
      .from(tagStockMovements)
      .where(and(inArray(tagStockMovements.tagId, tagIds), eq(tagStockMovements.movementType, "sale"), eq(tagStockMovements.referenceType, "sale"), eq(tagStockMovements.referenceId, String(saleId)))),
  ]);
  const ownershipBefore = new Map(saleMovements.map((m) => [m.tagId, m.fromOwnershipType]));
  for (const piece of pieces) {
    if (piece.stockStatus !== "sold") continue;
    const ownershipType = ownershipBefore.get(piece.id) ?? "company";
    await tx.update(tags).set({
      stockStatus: "available",
      ownershipType,
      custodianRepId: piece.repId,
      stockUpdatedAt: now,
    }).where(eq(tags.id, piece.id));
    await tx.insert(tagStockMovements).values({
      tagId: piece.id,
      movementType: "restore",
      fromStockStatus: piece.stockStatus,
      toStockStatus: "available",
      fromOwnershipType: piece.ownershipType,
      toOwnershipType: ownershipType,
      fromCustodianRepId: piece.custodianRepId,
      toCustodianRepId: piece.repId,
      referenceType: "sale",
      referenceId: String(saleId),
      actorUserId,
      reason: tagSystemReason("sale_cancelled"),
    });
  }
}

/** The product a piece sells as: its own, else its batch's. */
async function pieceForLink(executor: Pick<typeof db, "select">, tagId: string) {
  const [piece] = await executor
    .select({
      id: tags.id,
      publicCode: tags.publicCode,
      leadId: tags.leadId,
      status: tags.status,
      stockStatus: tags.stockStatus,
      ownershipType: tags.ownershipType,
      custodianRepId: tags.custodianRepId,
      ownProductId: tags.salesProductId,
      batchProductId: tagBatches.salesProductId,
    })
    .from(tags)
    .leftJoin(tagBatches, eq(tags.batchId, tagBatches.id))
    .where(eq(tags.id, tagId))
    .limit(1);
  return piece ? { ...piece, productId: piece.ownProductId ?? piece.batchProductId } : null;
}

/**
 * Sales already recorded for the piece's customer that it can join: completed
 * direct sales from outside Tags whose line is the piece's product (or has no product) and has
 * fewer pieces linked than units sold. Empty for a sold or unassigned piece.
 */
export async function listLinkableSales(tagId: string): Promise<LinkableSaleItem[]> {
  const piece = await pieceForLink(db, tagId);
  if (!piece?.leadId) return [];
  const [active] = await db.select({ id: salesSaleTags.id }).from(salesSaleTags)
    .where(and(eq(salesSaleTags.tagId, tagId), eq(salesSaleTags.status, "active"))).limit(1);
  if (active) return [];
  const items = await db
    .select({
      saleId: salesSales.id,
      saleItemId: salesSaleItems.id,
      soldAt: salesSales.soldAt,
      currency: salesSales.currency,
      description: salesSaleItems.description,
      quantity: salesSaleItems.quantity,
      netTotalCents: salesSaleItems.netTotalCents,
    })
    .from(salesSaleItems)
    .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
    .where(and(
      eq(salesSales.leadId, piece.leadId),
      eq(salesSales.status, "completed"),
      eq(salesSales.kind, "direct"),
      // A Tags sale already names its pieces, one line each.
      ne(salesSales.source, "tags"),
      piece.productId ? or(eq(salesSaleItems.productId, piece.productId), isNull(salesSaleItems.productId)) : undefined,
    ))
    .orderBy(desc(salesSales.soldAt), desc(salesSaleItems.id))
    .limit(20);
  if (!items.length) return [];
  const counts = await db
    .select({ saleItemId: salesSaleTags.saleItemId, linked: count() })
    .from(salesSaleTags)
    .where(and(inArray(salesSaleTags.saleItemId, items.map((item) => item.saleItemId)), eq(salesSaleTags.status, "active")))
    .groupBy(salesSaleTags.saleItemId);
  const linkedByItem = new Map(counts.map((row) => [row.saleItemId, Number(row.linked)]));
  return items
    .map((item) => ({
      saleId: item.saleId,
      saleItemId: item.saleItemId,
      soldAt: item.soldAt.toISOString(),
      description: item.description,
      quantity: item.quantity,
      linked: linkedByItem.get(item.saleItemId) ?? 0,
      unitNetCents: Math.round(item.netTotalCents / Math.max(item.quantity, 1)),
      currency: item.currency,
    }))
    .filter((item) => item.linked < item.quantity);
}

/**
 * Link a piece to one unit of a sale already recorded for its customer. The
 * sale's amounts do not change; the piece becomes sold at the sale's date and
 * costs what the sale item froze.
 */
export async function linkTagToSale(tagId: string, saleItemId: number, actor: TagActor) {
  await db.transaction(async (tx) => {
    // Lock the sale and its line, then the piece: two links cannot take the
    // line's last unit, and a cancellation (cancelSale, same order) cannot run
    // in between and leave this piece sold on a cancelled sale.
    const [locked] = await tx.select({ saleId: salesSaleItems.saleId }).from(salesSaleItems).where(eq(salesSaleItems.id, saleItemId));
    if (locked) await tx.select({ id: salesSales.id }).from(salesSales).where(eq(salesSales.id, locked.saleId)).for("update");
    await tx.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).for("update");
    const piece = await pieceForLink(tx, tagId);
    if (!piece) throw new TagSaleError("Piece not found", 404, "tag_not_found");
    if (!piece.leadId) throw new TagSaleError(`Piece ${piece.publicCode} has no customer`, 409, "tag_has_no_customer");
    if (piece.status === "retired") throw new TagSaleError(`Piece ${piece.publicCode} is retired`, 409, "tag_retired");
    const [active] = await tx.select({ id: salesSaleTags.id }).from(salesSaleTags)
      .where(and(eq(salesSaleTags.tagId, tagId), eq(salesSaleTags.status, "active"))).limit(1);
    if (active) throw new TagSaleError(`Already sold: ${piece.publicCode}`, 409, "tag_already_sold", { codes: piece.publicCode });
    if (piece.stockStatus !== "available") throw new TagSaleError(`Piece ${piece.publicCode} is not available`, 409, "tag_not_available", { code: piece.publicCode });

    const [line] = await tx
      .select({ item: salesSaleItems, sale: salesSales })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .where(eq(salesSaleItems.id, saleItemId))
      .for("update", { of: salesSaleItems });
    if (!line) throw new TagSaleError("Sale not found", 404, "sale_not_found");
    if (line.sale.leadId !== piece.leadId) throw new TagSaleError("This sale is for another customer", 409, "tag_lead_mismatch", { code: piece.publicCode });
    if (line.sale.status !== "completed" || line.sale.kind !== "direct" || line.sale.source === "tags") throw new TagSaleError("This sale cannot take pieces", 409, "sale_not_linkable");
    if (line.item.productId && piece.productId && line.item.productId !== piece.productId) {
      throw new TagSaleError(`Piece ${piece.publicCode} is not ${line.item.description}`, 409, "tag_product_mismatch", { code: piece.publicCode, product: line.item.description });
    }
    const [{ linked }] = await tx.select({ linked: count() }).from(salesSaleTags)
      .where(and(eq(salesSaleTags.saleItemId, saleItemId), eq(salesSaleTags.status, "active")));
    if (Number(linked) >= line.item.quantity) throw new TagSaleError("Every unit of this sale already has a piece", 409, "sale_item_full");

    const [acquisition] = await tx
      .select({ unitId: tagAcquisitionUnits.id })
      .from(tagAcquisitionUnits)
      .innerJoin(tagAcquisitionLines, eq(tagAcquisitionUnits.acquisitionLineId, tagAcquisitionLines.id))
      .innerJoin(tagAcquisitions, eq(tagAcquisitionLines.acquisitionId, tagAcquisitions.id))
      .where(and(eq(tagAcquisitionUnits.tagId, tagId), isNull(tagAcquisitionUnits.returnedAt), eq(tagAcquisitions.status, "fulfilled")))
      .limit(1);
    const now = new Date();
    const soldAt = line.sale.soldAt;
    await tx.insert(salesSaleTags).values({
      saleId: line.sale.id,
      saleItemId,
      tagId,
      acquisitionUnitId: acquisition?.unitId ?? null,
      costBasisCents: line.item.unitCostCents,
      costSource: "sale_item",
      soldAt,
    });
    await tx.update(tags).set({
      soldAt,
      stockStatus: "sold",
      ownershipType: "customer",
      custodianRepId: null,
      stockUpdatedAt: now,
      updatedAt: now,
    }).where(eq(tags.id, tagId));
    await tx.insert(tagStockMovements).values({
      tagId,
      movementType: "sale",
      fromStockStatus: piece.stockStatus,
      toStockStatus: "sold",
      fromOwnershipType: piece.ownershipType,
      toOwnershipType: "customer",
      fromCustodianRepId: piece.custodianRepId,
      toCustodianRepId: null,
      referenceType: "sale",
      referenceId: String(line.sale.id),
      actorUserId: actor.userId,
      reason: tagSystemReason("sale_linked"),
    });
  });
}
