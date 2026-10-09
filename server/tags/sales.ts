import { createHash } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
  tags,
} from "#shared/schema.js";
import type { TagActor } from "#shared/tagAccess.js";
import { allocateSaleLineTotals, paymentStatusFor, resolveUnitPriceCents } from "#shared/pricing.js";
import { resolveTagUnitCost, type TagSaleCreateInput } from "#shared/tagSales.js";
import { salesStorage } from "../storage-sales.js";

export class TagSaleError extends Error {
  constructor(message: string, public status = 400, public code = "tag_sale_invalid") {
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
    if (!actor.isManager && lead.ownerRepId !== actor.repId) {
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
        leadId: tags.leadId,
        status: tags.status,
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
      throw new TagSaleError(`Already sold: ${codes.join(", ")}`, 409, "tag_already_sold");
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
          throw new TagSaleError(`Piece ${tag.publicCode} is not mapped to ${product.name}`, 409, "tag_product_mismatch");
        }
        if (tag.repId !== null && tag.repId !== sellerRepId) {
          throw new TagSaleError(`Piece ${tag.publicCode} belongs to another seller`, 403, "tag_owner_mismatch");
        }
        if (tag.status === "retired") {
          throw new TagSaleError(`Piece ${tag.publicCode} is retired`, 409, "tag_retired");
        }
        if (tag.leadId !== null && tag.leadId !== input.leadId) {
          throw new TagSaleError(`Piece ${tag.publicCode} is assigned to another customer`, 409, "tag_lead_mismatch");
        }
        const acquisition = acquisitionsByTag.get(tagId);
        if (seller.costPolicy === "acquisition" && acquisition?.acquisitionRepId !== sellerRepId) {
          throw new TagSaleError(`Acquisition cost is missing for ${tag.publicCode}`, 409, "tag_cost_missing");
        }
        let cost;
        try {
          cost = resolveTagUnitCost({
            costPolicy: seller.costPolicy === "zero" ? "zero" : "acquisition",
            acquisitionCostCents: acquisition?.unitCostCents ?? null,
            overrideCostCents: acquisition?.overrideCostCents ?? null,
          });
        } catch {
          throw new TagSaleError(`Acquisition cost is missing for ${tag.publicCode}`, 409, "tag_cost_missing");
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
      updatedAt: new Date(),
    }).where(inArray(tags.id, allTagIds));
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

export async function cancelTagLinksForSale(saleId: number) {
  await db.transaction(async (tx) => {
    const links = await tx
      .select({ tagId: salesSaleTags.tagId })
      .from(salesSaleTags)
      .where(and(eq(salesSaleTags.saleId, saleId), eq(salesSaleTags.status, "active")))
      .for("update");
    if (!links.length) return;
    const now = new Date();
    await tx.update(salesSaleTags).set({ status: "cancelled", endedAt: now }).where(and(eq(salesSaleTags.saleId, saleId), eq(salesSaleTags.status, "active")));
    await tx.update(tags).set({ soldAt: null, updatedAt: now }).where(inArray(tags.id, links.map((link) => link.tagId)));
  });
}
