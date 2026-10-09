import { createHash } from "crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  salesProducts,
  salesReps,
  tagAcquisitionLines,
  tagAcquisitionUnits,
  tagAcquisitions,
  tagBatches,
  tagKits,
  tags,
} from "#shared/schema.js";
import { allocateAcquisitionUnitCosts, type StuscleWholesaleOrderInput } from "#shared/tagSales.js";
import { normalizeTagCode } from "#shared/tags.js";
import { TagSaleError } from "./sales.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function payloadHash(input: StuscleWholesaleOrderInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function acquisitionView(id: string) {
  const [acquisition] = await db.select().from(tagAcquisitions).where(eq(tagAcquisitions.id, id)).limit(1);
  if (!acquisition) return null;
  const lines = await db.select().from(tagAcquisitionLines).where(eq(tagAcquisitionLines.acquisitionId, id)).orderBy(asc(tagAcquisitionLines.createdAt));
  const units = lines.length
    ? await db.select().from(tagAcquisitionUnits).where(inArray(tagAcquisitionUnits.acquisitionLineId, lines.map((line) => line.id)))
    : [];
  return { acquisition, lines, units };
}

export async function recordStuscleOrder(input: StuscleWholesaleOrderInput, repId: number) {
  const hash = payloadHash(input);
  const acquisitionId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(tagAcquisitions)
      .where(and(eq(tagAcquisitions.source, "stuscle"), eq(tagAcquisitions.externalRef, input.externalOrderId)))
      .limit(1);
    if (existing) {
      if (existing.externalPayloadHash !== hash) {
        if (input.status === "cancelled" && existing.status === "pending") {
          await tx.update(tagAcquisitions).set({
            status: "cancelled",
            externalPayloadHash: hash,
            updatedAt: new Date(),
          }).where(eq(tagAcquisitions.id, existing.id));
          return existing.id;
        }
        throw new TagSaleError("Order id was already used with different data", 409, "wholesale_order_conflict");
      }
      return existing.id;
    }

    const skus = Array.from(new Set(input.items.map((item) => item.sku)));
    const products = await tx.select().from(salesProducts).where(inArray(salesProducts.sku, skus));
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const missing = skus.filter((sku) => !bySku.has(sku));
    if (missing.length) throw new TagSaleError(`Unknown Stuscle SKUs: ${missing.join(", ")}`, 400, "wholesale_sku_unknown");

    const [acquisition] = await tx.insert(tagAcquisitions).values({
      repId,
      source: "stuscle",
      externalRef: input.externalOrderId,
      externalPayloadHash: hash,
      currency: input.currency,
      status: input.status === "cancelled" ? "cancelled" : "pending",
      purchasedAt: new Date(input.purchasedAt),
    }).returning();
    await tx.insert(tagAcquisitionLines).values(input.items.map((item) => ({
      acquisitionId: acquisition.id,
      salesProductId: bySku.get(item.sku)!.id,
      externalSku: item.sku,
      quantity: item.quantity,
      subtotalCents: item.subtotalCents,
      unitCostCents: Math.floor(item.subtotalCents / item.quantity),
    })));
    return acquisition.id;
  });

  const hasAllCodes = input.status === "paid" && input.items.every((item) => item.tagCodes?.length === item.quantity);
  if (hasAllCodes) {
    const codes = input.items.flatMap((item) => item.tagCodes ?? []);
    const current = await acquisitionView(acquisitionId);
    if (current?.acquisition.status === "pending") await fulfillAcquisition(acquisitionId, codes, null);
  }
  return acquisitionView(acquisitionId);
}

async function lockFulfillmentTags(tx: Tx, rawCodes: string[]) {
  const codes = rawCodes.map((raw) => normalizeTagCode(raw));
  if (codes.some((code) => !code)) throw new TagSaleError("One or more tag codes are invalid", 400, "tag_code_invalid");
  const normalized = codes as string[];
  if (new Set(normalized).size !== normalized.length) throw new TagSaleError("Tag codes must not repeat", 400, "tag_code_duplicate");
  const rows = await tx
    .select({
      id: tags.id,
      publicCode: tags.publicCode,
      status: tags.status,
      repId: tags.repId,
      ownProductId: tags.salesProductId,
      batchProductId: tagBatches.salesProductId,
    })
    .from(tags)
    .leftJoin(tagBatches, eq(tags.batchId, tagBatches.id))
    .where(inArray(tags.publicCode, normalized))
    .for("update");
  if (rows.length !== normalized.length) throw new TagSaleError("One or more pieces were not found", 404, "tag_not_found");
  const unavailable = rows.filter((tag) => tag.status !== "inventory" || tag.repId !== null);
  if (unavailable.length) throw new TagSaleError(`Not in house stock: ${unavailable.map((tag) => tag.publicCode).join(", ")}`, 409, "tag_not_house_stock");
  return rows;
}

export async function fulfillAcquisition(acquisitionId: string, codes: string[], userId: string | null) {
  await db.transaction(async (tx) => {
    const [acquisition] = await tx.select().from(tagAcquisitions).where(eq(tagAcquisitions.id, acquisitionId)).for("update");
    if (!acquisition) throw new TagSaleError("Acquisition not found", 404, "acquisition_not_found");
    if (acquisition.status === "fulfilled") return;
    if (acquisition.status === "cancelled") throw new TagSaleError("A cancelled acquisition cannot be fulfilled", 409, "acquisition_cancelled");
    const lines = await tx.select().from(tagAcquisitionLines).where(eq(tagAcquisitionLines.acquisitionId, acquisitionId)).orderBy(asc(tagAcquisitionLines.createdAt));
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (codes.length !== quantity) throw new TagSaleError(`This acquisition needs exactly ${quantity} pieces`, 400, "acquisition_quantity_mismatch");
    const picked = await lockFulfillmentTags(tx, codes);

    const [kit] = await tx.insert(tagKits).values({
      repId: acquisition.repId,
      note: acquisition.source === "stuscle" ? `Stuscle order ${acquisition.externalRef}` : "Manual acquisition",
      createdByUserId: userId,
    }).returning();

    const remaining = new Map(picked.map((tag) => [tag.id, tag]));
    for (const line of lines) {
      const matches = Array.from(remaining.values()).filter((tag) => (tag.ownProductId ?? tag.batchProductId) === line.salesProductId).slice(0, line.quantity);
      if (matches.length !== line.quantity) {
        throw new TagSaleError(`The selected pieces do not match acquisition line ${line.externalSku ?? line.id}`, 409, "acquisition_product_mismatch");
      }
      const costs = allocateAcquisitionUnitCosts(line.subtotalCents, line.quantity);
      await tx.insert(tagAcquisitionUnits).values(matches.map((tag, index) => ({
        acquisitionLineId: line.id,
        tagId: tag.id,
        unitCostCents: costs[index],
      })));
      await tx.update(tags).set({ repId: acquisition.repId, kitId: kit.id, updatedAt: new Date() }).where(inArray(tags.id, matches.map((tag) => tag.id)));
      matches.forEach((tag) => remaining.delete(tag.id));
    }
    if (remaining.size) throw new TagSaleError("Some selected pieces do not match any acquisition line", 409, "acquisition_product_mismatch");
    await tx.update(tagAcquisitions).set({ status: "fulfilled", kitId: kit.id, updatedAt: new Date() }).where(eq(tagAcquisitions.id, acquisition.id));
  });
  return acquisitionView(acquisitionId);
}

export async function listAcquisitions(repId?: number) {
  const conditions = repId ? eq(tagAcquisitions.repId, repId) : undefined;
  const acquisitions = await db.select().from(tagAcquisitions).where(conditions).orderBy(desc(tagAcquisitions.purchasedAt));
  if (!acquisitions.length) return [];
  const lines = await db.select().from(tagAcquisitionLines).where(inArray(tagAcquisitionLines.acquisitionId, acquisitions.map((item) => item.id)));
  const unitCounts = lines.length
    ? await db
        .select({ lineId: tagAcquisitionUnits.acquisitionLineId, count: sql<number>`count(*)::int` })
        .from(tagAcquisitionUnits)
        .where(and(inArray(tagAcquisitionUnits.acquisitionLineId, lines.map((line) => line.id)), isNull(tagAcquisitionUnits.returnedAt)))
        .groupBy(tagAcquisitionUnits.acquisitionLineId)
    : [];
  const countByLine = new Map(unitCounts.map((row) => [row.lineId, row.count]));
  const reps = await db.select({ id: salesReps.id, displayName: salesReps.displayName })
    .from(salesReps)
    .where(inArray(salesReps.id, Array.from(new Set(acquisitions.map((item) => item.repId)))));
  const repNames = new Map(reps.map((rep) => [rep.id, rep.displayName]));
  return acquisitions.map((acquisition) => ({
    acquisition,
    repName: repNames.get(acquisition.repId) ?? null,
    lines: lines.filter((line) => line.acquisitionId === acquisition.id).map((line) => ({ ...line, fulfilledUnits: countByLine.get(line.id) ?? 0 })),
  }));
}
