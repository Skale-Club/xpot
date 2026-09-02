// Sales module storage — catalog, direct sales, consigned stock.
//
// Separate from storage.ts so the sales module has one clear data boundary.
// The three stock operations (deposit / settle / return-adjust) run inside a
// transaction: the consignment's cached on-hand figure and the movement ledger
// must never disagree.

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  salesLeads,
  salesProducts,
  salesProductPriceTiers,
  salesConsignments,
  salesConsignmentMovements,
  salesSales,
  salesSaleItems,
  type SalesProduct,
  type InsertSalesProduct,
  type SalesProductPriceTier,
  type SalesConsignment,
  type InsertSalesConsignment,
  type SalesConsignmentMovement,
  type SalesSale,
  type InsertSalesSale,
  type SalesSaleItem,
  type InsertSalesSaleItem,
  type SalesSaleStatus,
  type SalesConsignmentStatus,
  type SalesPaymentStatus,
} from "#shared/schema.js";
import { computeSettlement, nextDueDate, paymentStatusFor, resolveUnitPriceCents } from "#shared/pricing.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LeadRef = { id: number; name: string };
export type ProductRef = Pick<SalesProduct, "id" | "name" | "sku" | "kind" | "unitLabel" | "currency">;

export type SaleWithItems = {
  sale: SalesSale;
  items: SalesSaleItem[];
  lead: LeadRef | null;
};

export type ConsignmentWithRefs = {
  consignment: SalesConsignment;
  product: ProductRef | null;
  lead: LeadRef | null;
};

export type SalesSummary = {
  period: { days: number; from: string; to: string };
  revenue: { todayCents: number; periodCents: number; monthToDateCents: number };
  /** What we keep: revenue minus the frozen production cost of what was sold. */
  profit: { todayCents: number; periodCents: number; monthToDateCents: number };
  sales: { periodCount: number; unitsSold: number; directCents: number; settlementCents: number };
  unpaid: { count: number; cents: number };
  byProduct: { productId: number | null; name: string; quantity: number; revenueCents: number; profitCents: number }[];
  daily: { date: string; revenueCents: number; profitCents: number; salesCount: number }[];
  consignment: {
    activeCount: number;
    unitsOnHand: number;
    valueOnHandCents: number;
    dueCount: number;
    dueSoonCount: number;
  };
};

// ─── Catalog ─────────────────────────────────────────────────────────────────

export async function listProducts(opts: { includeInactive?: boolean } = {}): Promise<SalesProduct[]> {
  const query = db.select().from(salesProducts).orderBy(asc(salesProducts.sortOrder), asc(salesProducts.name));
  if (opts.includeInactive) return await query;
  return await query.where(eq(salesProducts.isActive, true));
}

export async function getProduct(id: number): Promise<SalesProduct | undefined> {
  const [row] = await db.select().from(salesProducts).where(eq(salesProducts.id, id));
  return row;
}

export async function createProduct(input: InsertSalesProduct): Promise<SalesProduct> {
  const [created] = await db.insert(salesProducts).values(input).returning();
  return created;
}

export async function updateProduct(id: number, input: Partial<InsertSalesProduct>): Promise<SalesProduct | undefined> {
  const [updated] = await db
    .update(salesProducts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(salesProducts.id, id))
    .returning();
  return updated;
}

export async function listTiers(productId: number): Promise<SalesProductPriceTier[]> {
  return await db
    .select()
    .from(salesProductPriceTiers)
    .where(eq(salesProductPriceTiers.productId, productId))
    .orderBy(asc(salesProductPriceTiers.minQuantity));
}

export async function listTiersBatch(productIds: number[]): Promise<SalesProductPriceTier[]> {
  if (!productIds.length) return [];
  return await db
    .select()
    .from(salesProductPriceTiers)
    .where(inArray(salesProductPriceTiers.productId, productIds))
    .orderBy(asc(salesProductPriceTiers.productId), asc(salesProductPriceTiers.minQuantity));
}

export async function replaceTiers(
  productId: number,
  tiers: { label?: string | null; minQuantity: number; unitPriceCents: number }[],
): Promise<SalesProductPriceTier[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(salesProductPriceTiers).where(eq(salesProductPriceTiers.productId, productId));
    if (!tiers.length) return [];
    return await tx
      .insert(salesProductPriceTiers)
      .values(tiers.map((t) => ({ productId, label: t.label ?? null, minQuantity: t.minQuantity, unitPriceCents: t.unitPriceCents })))
      .returning();
  });
}

/** Catalog price for `quantity` of a product, honouring volume tiers. */
export async function priceProduct(
  productId: number,
  quantity: number,
): Promise<{ product: SalesProduct; unitPriceCents: number; unitCostCents: number } | null> {
  const product = await getProduct(productId);
  if (!product) return null;
  const tiers = await listTiers(productId);
  return {
    product,
    unitPriceCents: resolveUnitPriceCents(product.basePriceCents, tiers, quantity),
    unitCostCents: product.costCents ?? 0,
  };
}

// ─── Sales ───────────────────────────────────────────────────────────────────

async function attachLeadRefs<T extends { leadId: number }>(rows: T[]): Promise<Map<number, LeadRef>> {
  const ids = Array.from(new Set(rows.map((r) => r.leadId)));
  if (!ids.length) return new Map();
  const leads = await db.select({ id: salesLeads.id, name: salesLeads.name }).from(salesLeads).where(inArray(salesLeads.id, ids));
  return new Map(leads.map((l) => [l.id, l]));
}

export async function listSales(filters: {
  repId?: number;
  leadId?: number;
  visitId?: number;
  status?: SalesSaleStatus;
  since?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<SaleWithItems[]> {
  const conditions = [];
  if (filters.repId) conditions.push(eq(salesSales.repId, filters.repId));
  if (filters.leadId) conditions.push(eq(salesSales.leadId, filters.leadId));
  if (filters.visitId) conditions.push(eq(salesSales.visitId, filters.visitId));
  if (filters.status) conditions.push(eq(salesSales.status, filters.status));
  if (filters.since) conditions.push(gte(salesSales.soldAt, filters.since));

  let query = db.select().from(salesSales).orderBy(desc(salesSales.soldAt), desc(salesSales.id)).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));
  query = query.limit(Math.min(filters.limit ?? 100, 500)).offset(filters.offset ?? 0);
  const sales = await query;
  if (!sales.length) return [];

  const items = await db
    .select()
    .from(salesSaleItems)
    .where(inArray(salesSaleItems.saleId, sales.map((s) => s.id)))
    .orderBy(asc(salesSaleItems.id));
  const itemsBySale = new Map<number, SalesSaleItem[]>();
  for (const item of items) {
    if (!itemsBySale.has(item.saleId)) itemsBySale.set(item.saleId, []);
    itemsBySale.get(item.saleId)!.push(item);
  }
  const leadRefs = await attachLeadRefs(sales);

  return sales.map((sale) => ({
    sale,
    items: itemsBySale.get(sale.id) ?? [],
    lead: leadRefs.get(sale.leadId) ?? null,
  }));
}

export async function getSale(id: number): Promise<SaleWithItems | undefined> {
  const [sale] = await db.select().from(salesSales).where(eq(salesSales.id, id));
  if (!sale) return undefined;
  const items = await db.select().from(salesSaleItems).where(eq(salesSaleItems.saleId, id)).orderBy(asc(salesSaleItems.id));
  const leadRefs = await attachLeadRefs([sale]);
  return { sale, items, lead: leadRefs.get(sale.leadId) ?? null };
}

async function insertSaleWithItems(
  tx: Tx,
  sale: InsertSalesSale,
  items: Omit<InsertSalesSaleItem, "saleId">[],
): Promise<{ sale: SalesSale; items: SalesSaleItem[] }> {
  const [created] = await tx.insert(salesSales).values(sale).returning();
  const createdItems = items.length
    ? await tx.insert(salesSaleItems).values(items.map((item) => ({ ...item, saleId: created.id }))).returning()
    : [];
  return { sale: created, items: createdItems };
}

export async function createDirectSale(
  sale: InsertSalesSale,
  items: Omit<InsertSalesSaleItem, "saleId">[],
): Promise<SaleWithItems> {
  const result = await db.transaction((tx) => insertSaleWithItems(tx, { ...sale, kind: "direct" }, items));
  const leadRefs = await attachLeadRefs([result.sale]);
  return { ...result, lead: leadRefs.get(result.sale.leadId) ?? null };
}

export async function updateSale(id: number, patch: Partial<InsertSalesSale>): Promise<SalesSale | undefined> {
  const [updated] = await db
    .update(salesSales)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(salesSales.id, id))
    .returning();
  return updated;
}

// ─── Consignments ────────────────────────────────────────────────────────────

async function attachConsignmentRefs(rows: SalesConsignment[]): Promise<ConsignmentWithRefs[]> {
  if (!rows.length) return [];
  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const [products, leadRefs] = await Promise.all([
    db
      .select({
        id: salesProducts.id,
        name: salesProducts.name,
        sku: salesProducts.sku,
        kind: salesProducts.kind,
        unitLabel: salesProducts.unitLabel,
        currency: salesProducts.currency,
      })
      .from(salesProducts)
      .where(inArray(salesProducts.id, productIds)),
    attachLeadRefs(rows),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  return rows.map((consignment) => ({
    consignment,
    product: productMap.get(consignment.productId) ?? null,
    lead: leadRefs.get(consignment.leadId) ?? null,
  }));
}

export async function listConsignments(filters: {
  repId?: number;
  leadId?: number;
  status?: SalesConsignmentStatus;
} = {}): Promise<ConsignmentWithRefs[]> {
  const conditions = [];
  if (filters.repId) conditions.push(eq(salesConsignments.repId, filters.repId));
  if (filters.leadId) conditions.push(eq(salesConsignments.leadId, filters.leadId));
  if (filters.status) conditions.push(eq(salesConsignments.status, filters.status));

  let query = db
    .select()
    .from(salesConsignments)
    .orderBy(asc(salesConsignments.nextVisitDueAt), desc(salesConsignments.id))
    .$dynamic();
  if (conditions.length) query = query.where(and(...conditions));
  return attachConsignmentRefs(await query);
}

export async function getConsignment(id: number): Promise<ConsignmentWithRefs | undefined> {
  const [row] = await db.select().from(salesConsignments).where(eq(salesConsignments.id, id));
  if (!row) return undefined;
  const [withRefs] = await attachConsignmentRefs([row]);
  return withRefs;
}

export async function getActiveConsignment(leadId: number, productId: number): Promise<SalesConsignment | undefined> {
  const [row] = await db
    .select()
    .from(salesConsignments)
    .where(and(eq(salesConsignments.leadId, leadId), eq(salesConsignments.productId, productId), eq(salesConsignments.status, "active")));
  return row;
}

export async function updateConsignment(id: number, patch: Partial<InsertSalesConsignment>): Promise<SalesConsignment | undefined> {
  const [updated] = await db
    .update(salesConsignments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(salesConsignments.id, id))
    .returning();
  return updated;
}

export async function listMovements(consignmentId: number): Promise<SalesConsignmentMovement[]> {
  return await db
    .select()
    .from(salesConsignmentMovements)
    .where(eq(salesConsignmentMovements.consignmentId, consignmentId))
    .orderBy(desc(salesConsignmentMovements.occurredAt), desc(salesConsignmentMovements.id));
}

/**
 * Leave `quantity` units at the establishment. Opens the agreement when there is
 * no active one for (lead, product); otherwise tops up the existing stock.
 */
export async function runDeposit(input: {
  leadId: number;
  productId: number;
  repId: number;
  quantity: number;
  /** Price for a NEW agreement. On a top-up the agreed price is kept unless
   *  `repriceExisting` says otherwise — see the note in runDeposit. */
  unitPriceCents: number;
  /** Explicit intent to renegotiate an open agreement's unit price. */
  repriceExisting?: boolean;
  currency: string;
  settlementIntervalDays?: number;
  visitId?: number | null;
  notes?: string | null;
}): Promise<{ consignment: SalesConsignment; movement: SalesConsignmentMovement; opened: boolean }> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    let [existing] = await tx
      .select()
      .from(salesConsignments)
      .where(and(eq(salesConsignments.leadId, input.leadId), eq(salesConsignments.productId, input.productId), eq(salesConsignments.status, "active")))
      .for("update");

    let opened = false;
    if (!existing) {
      opened = true;
      const interval = input.settlementIntervalDays ?? 30;
      [existing] = await tx
        .insert(salesConsignments)
        .values({
          leadId: input.leadId,
          productId: input.productId,
          repId: input.repId,
          unitPriceCents: input.unitPriceCents,
          currency: input.currency,
          settlementIntervalDays: interval,
          openedAt: now,
          nextVisitDueAt: nextDueDate(interval, now),
          notes: input.notes ?? null,
        })
        .returning();
    }

    const onHandBefore = existing.quantityOnHand;
    const onHandAfter = onHandBefore + input.quantity;

    const effectivePriceCents = opened || input.repriceExisting
      ? input.unitPriceCents
      : existing.unitPriceCents;

    const [movement] = await tx
      .insert(salesConsignmentMovements)
      .values({
        consignmentId: existing.id,
        repId: input.repId,
        visitId: input.visitId ?? null,
        type: "deposit",
        quantity: input.quantity,
        onHandBefore,
        onHandAfter,
        unitPriceCents: effectivePriceCents,
        occurredAt: now,
        notes: input.notes ?? null,
      })
      .returning();

    const [consignment] = await tx
      .update(salesConsignments)
      .set({
        quantityOnHand: onHandAfter,
        totalDeposited: existing.totalDeposited + input.quantity,
        // A top-up NEVER silently reprices. The shelf holds units left under the
        // agreed price, and the settlement bills the whole shelf at one price —
        // so letting a restock quantity cross a volume tier would retroactively
        // change what the shop owes for stock it already has. Renegotiating is
        // an explicit act.
        unitPriceCents: opened || input.repriceExisting ? input.unitPriceCents : existing.unitPriceCents,
        nextVisitDueAt: existing.nextVisitDueAt ?? nextDueDate(existing.settlementIntervalDays, now),
        updatedAt: now,
      })
      .where(eq(salesConsignments.id, existing.id))
      .returning();

    return { consignment, movement, opened };
  });
}

/**
 * Settlement visit: count what is left, bill what was sold, optionally leave
 * new stock. Produces a sale (kind = consignment_settlement) when anything sold.
 */
export async function runSettlement(input: {
  consignmentId: number;
  repId: number;
  countedRemaining: number;
  restockQuantity?: number;
  unitPriceCents?: number;
  paymentStatus?: SalesPaymentStatus;
  paymentMethod?: string | null;
  paidCents?: number;
  visitId?: number | null;
  notes?: string | null;
}): Promise<{
  consignment: SalesConsignment;
  settlement: SalesConsignmentMovement;
  restock: SalesConsignmentMovement | null;
  sale: SaleWithItems | null;
  soldQuantity: number;
  amountCents: number;
}> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const [current] = await tx.select().from(salesConsignments).where(eq(salesConsignments.id, input.consignmentId)).for("update");
    if (!current) throw new Error("Consignment not found");
    if (current.status !== "active") throw new Error("Consignment is closed");

    const [product] = await tx.select().from(salesProducts).where(eq(salesProducts.id, current.productId));
    const unitPriceCents = input.unitPriceCents ?? current.unitPriceCents;

    const unitCostCents = product?.costCents ?? 0;
    const result = computeSettlement({
      onHand: current.quantityOnHand,
      countedRemaining: input.countedRemaining,
      unitPriceCents,
      unitCostCents,
      restockQuantity: input.restockQuantity,
    });
    if (result.overCount) {
      throw new Error(`Counted ${input.countedRemaining} but only ${current.quantityOnHand} on record. Record an adjustment first.`);
    }

    let sale: SaleWithItems | null = null;
    if (result.soldQuantity > 0) {
      const paidCents = input.paymentStatus === "paid"
        ? result.amountCents
        : input.paymentStatus === "unpaid"
          ? 0
          : Math.min(input.paidCents ?? result.amountCents, result.amountCents);
      const paymentStatus = input.paymentStatus ?? paymentStatusFor(paidCents, result.amountCents);
      const created = await insertSaleWithItems(
        tx,
        {
          leadId: current.leadId,
          repId: input.repId,
          visitId: input.visitId ?? null,
          consignmentId: current.id,
          kind: "consignment_settlement",
          status: "completed",
          currency: current.currency,
          subtotalCents: result.amountCents,
          discountCents: 0,
          totalCents: result.amountCents,
          paymentStatus,
          paymentMethod: input.paymentMethod ?? null,
          paidCents,
          paidAt: paymentStatus === "paid" ? now : null,
          soldAt: now,
          notes: input.notes ?? null,
        },
        [
          {
            productId: current.productId,
            description: product?.name ?? `Product #${current.productId}`,
            quantity: result.soldQuantity,
            unitPriceCents,
            unitCostCents,
            totalCents: result.amountCents,
          },
        ],
      );
      sale = { ...created, lead: null };
    }

    const [settlement] = await tx
      .insert(salesConsignmentMovements)
      .values({
        consignmentId: current.id,
        repId: input.repId,
        visitId: input.visitId ?? null,
        saleId: sale?.sale.id ?? null,
        type: "settlement",
        quantity: result.soldQuantity,
        countedRemaining: input.countedRemaining,
        onHandBefore: current.quantityOnHand,
        onHandAfter: result.onHandAfterSettlement,
        unitPriceCents,
        amountCents: result.amountCents,
        occurredAt: now,
        notes: input.notes ?? null,
      })
      .returning();

    let restock: SalesConsignmentMovement | null = null;
    const restockQty = Math.max(0, input.restockQuantity ?? 0);
    if (restockQty > 0) {
      [restock] = await tx
        .insert(salesConsignmentMovements)
        .values({
          consignmentId: current.id,
          repId: input.repId,
          visitId: input.visitId ?? null,
          type: "deposit",
          quantity: restockQty,
          onHandBefore: result.onHandAfterSettlement,
          onHandAfter: result.onHandAfterRestock,
          unitPriceCents,
          occurredAt: now,
          notes: "Restock at settlement",
        })
        .returning();
    }

    const [consignment] = await tx
      .update(salesConsignments)
      .set({
        quantityOnHand: result.onHandAfterRestock,
        totalSold: current.totalSold + result.soldQuantity,
        totalDeposited: current.totalDeposited + restockQty,
        totalSettledCents: current.totalSettledCents + result.amountCents,
        // The per-settlement price is a one-off (a discount at the counter, a
        // correction), documented as such on xpotConsignmentSettleSchema. It
        // must not become the agreement's price — the next cycle's stock was
        // left under the agreed one. Renegotiating is PATCH /consignments/:id.
        lastSettlementAt: now,
        nextVisitDueAt: nextDueDate(current.settlementIntervalDays, now),
        updatedAt: now,
      })
      .where(eq(salesConsignments.id, current.id))
      .returning();

    if (sale) {
      const leadRefs = await attachLeadRefs([sale.sale]);
      sale = { ...sale, lead: leadRefs.get(sale.sale.leadId) ?? null };
    }

    return { consignment, settlement, restock, sale, soldQuantity: result.soldQuantity, amountCents: result.amountCents };
  });
}

/** Pick unsold units back up without billing. Optionally closes the agreement. */
export async function runReturn(input: {
  consignmentId: number;
  repId: number;
  quantity: number;
  close?: boolean;
  visitId?: number | null;
  notes?: string | null;
}): Promise<{ consignment: SalesConsignment; movement: SalesConsignmentMovement }> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const [current] = await tx.select().from(salesConsignments).where(eq(salesConsignments.id, input.consignmentId)).for("update");
    if (!current) throw new Error("Consignment not found");
    if (current.status !== "active") throw new Error("Consignment is closed");
    if (input.quantity > current.quantityOnHand) {
      throw new Error(`Only ${current.quantityOnHand} on record; cannot return ${input.quantity}.`);
    }
    const onHandAfter = current.quantityOnHand - input.quantity;
    const [movement] = await tx
      .insert(salesConsignmentMovements)
      .values({
        consignmentId: current.id,
        repId: input.repId,
        visitId: input.visitId ?? null,
        type: "return",
        quantity: input.quantity,
        onHandBefore: current.quantityOnHand,
        onHandAfter,
        occurredAt: now,
        notes: input.notes ?? null,
      })
      .returning();
    const closing = Boolean(input.close);
    const [consignment] = await tx
      .update(salesConsignments)
      .set({
        quantityOnHand: onHandAfter,
        totalReturned: current.totalReturned + input.quantity,
        status: closing ? "closed" : current.status,
        closedAt: closing ? now : current.closedAt,
        nextVisitDueAt: closing ? null : current.nextVisitDueAt,
        updatedAt: now,
      })
      .where(eq(salesConsignments.id, current.id))
      .returning();
    return { consignment, movement };
  });
}

/** Correct the on-record stock (lost, damaged, miscounted). Signed delta. */
export async function runAdjustment(input: {
  consignmentId: number;
  repId: number;
  delta: number;
  visitId?: number | null;
  notes?: string | null;
}): Promise<{ consignment: SalesConsignment; movement: SalesConsignmentMovement }> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const [current] = await tx.select().from(salesConsignments).where(eq(salesConsignments.id, input.consignmentId)).for("update");
    if (!current) throw new Error("Consignment not found");
    if (current.status !== "active") throw new Error("Consignment is closed");
    const onHandAfter = current.quantityOnHand + input.delta;
    if (onHandAfter < 0) throw new Error("Adjustment would take stock below zero.");
    const [movement] = await tx
      .insert(salesConsignmentMovements)
      .values({
        consignmentId: current.id,
        repId: input.repId,
        visitId: input.visitId ?? null,
        type: "adjustment",
        quantity: input.delta,
        onHandBefore: current.quantityOnHand,
        onHandAfter,
        occurredAt: now,
        notes: input.notes ?? null,
      })
      .returning();
    const [consignment] = await tx
      .update(salesConsignments)
      .set({ quantityOnHand: onHandAfter, updatedAt: now })
      .where(eq(salesConsignments.id, current.id))
      .returning();
    return { consignment, movement };
  });
}

export async function closeConsignment(id: number): Promise<SalesConsignment | undefined> {
  const now = new Date();
  const [updated] = await db
    .update(salesConsignments)
    .set({ status: "closed", closedAt: now, nextVisitDueAt: null, updatedAt: now })
    .where(eq(salesConsignments.id, id))
    .returning();
  return updated;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function salesSummary(filters: { repId?: number; days?: number } = {}): Promise<SalesSummary> {
  const days = Math.min(Math.max(filters.days ?? 30, 1), 365);
  const now = new Date();
  const from = startOfDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const today = startOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completed = eq(salesSales.status, "completed");
  const repFilter = filters.repId ? eq(salesSales.repId, filters.repId) : undefined;
  const where = (...extra: (ReturnType<typeof eq> | undefined)[]) => and(completed, repFilter, ...extra);

  // Profit lives on the ITEMS (price and cost are per line), so anything that
  // reports profit joins through sales_sale_items rather than summing the sale.
  const profitExpr = sql<number>`coalesce(sum((${salesSaleItems.unitPriceCents} - ${salesSaleItems.unitCostCents}) * ${salesSaleItems.quantity}), 0)::int`;
  const profitFor = (from: Date) =>
    db
      .select({ cents: profitExpr })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .where(where(gte(salesSales.soldAt, from)));

  const [[period], [todayRow], [mtd], [unpaid], byProductRows, dailyRows, itemsInPeriod, [profitPeriod], [profitToday], [profitMtd]] = await Promise.all([
    db
      .select({
        cents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
        directCents: sql<number>`coalesce(sum(case when ${salesSales.kind} = 'direct' then ${salesSales.totalCents} else 0 end), 0)::int`,
        settlementCents: sql<number>`coalesce(sum(case when ${salesSales.kind} = 'consignment_settlement' then ${salesSales.totalCents} else 0 end), 0)::int`,
      })
      .from(salesSales)
      .where(where(gte(salesSales.soldAt, from))),
    db
      .select({ cents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int` })
      .from(salesSales)
      .where(where(gte(salesSales.soldAt, today))),
    db
      .select({ cents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int` })
      .from(salesSales)
      .where(where(gte(salesSales.soldAt, monthStart))),
    db
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${salesSales.totalCents} - ${salesSales.paidCents}), 0)::int`,
      })
      .from(salesSales)
      .where(and(completed, repFilter, sql`${salesSales.paymentStatus} <> 'paid'`)),
    db
      .select({
        productId: salesSaleItems.productId,
        name: sql<string>`coalesce(min(${salesProducts.name}), min(${salesSaleItems.description}))`,
        quantity: sql<number>`coalesce(sum(${salesSaleItems.quantity}), 0)::int`,
        revenueCents: sql<number>`coalesce(sum(${salesSaleItems.totalCents}), 0)::int`,
        profitCents: profitExpr,
      })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .leftJoin(salesProducts, eq(salesSaleItems.productId, salesProducts.id))
      .where(where(gte(salesSales.soldAt, from)))
      .groupBy(salesSaleItems.productId)
      .orderBy(desc(sql`sum(${salesSaleItems.totalCents})`)),
    db
      .select({
        date: sql<string>`to_char(${salesSales.soldAt}::date, 'YYYY-MM-DD')`,
        revenueCents: sql<number>`coalesce(sum(${salesSaleItems.totalCents}), 0)::int`,
        profitCents: profitExpr,
        salesCount: sql<number>`count(distinct ${salesSales.id})::int`,
      })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .where(where(gte(salesSales.soldAt, from)))
      .groupBy(sql`${salesSales.soldAt}::date`)
      .orderBy(sql`${salesSales.soldAt}::date`),
    db
      .select({ units: sql<number>`coalesce(sum(${salesSaleItems.quantity}), 0)::int` })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .where(where(gte(salesSales.soldAt, from))),
    profitFor(from),
    profitFor(today),
    profitFor(monthStart),
  ]);

  const consignmentRepFilter = filters.repId ? eq(salesConsignments.repId, filters.repId) : undefined;
  const dueSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [[cons]] = await Promise.all([
    db
      .select({
        activeCount: sql<number>`count(*)::int`,
        unitsOnHand: sql<number>`coalesce(sum(${salesConsignments.quantityOnHand}), 0)::int`,
        valueOnHandCents: sql<number>`coalesce(sum(${salesConsignments.quantityOnHand} * ${salesConsignments.unitPriceCents}), 0)::int`,
        dueCount: sql<number>`coalesce(sum(case when ${salesConsignments.nextVisitDueAt} <= ${now} then 1 else 0 end), 0)::int`,
        dueSoonCount: sql<number>`coalesce(sum(case when ${salesConsignments.nextVisitDueAt} > ${now} and ${salesConsignments.nextVisitDueAt} <= ${dueSoon} then 1 else 0 end), 0)::int`,
      })
      .from(salesConsignments)
      .where(and(eq(salesConsignments.status, "active"), consignmentRepFilter)),
  ]);

  // Fill every day in the window so the chart never has gaps.
  const dailyMap = new Map(dailyRows.map((r) => [r.date, r]));
  const daily: SalesSummary["daily"] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = dailyMap.get(key);
    daily.push({
      date: key,
      revenueCents: row?.revenueCents ?? 0,
      profitCents: row?.profitCents ?? 0,
      salesCount: row?.salesCount ?? 0,
    });
  }

  return {
    period: { days, from: from.toISOString(), to: now.toISOString() },
    revenue: { todayCents: todayRow?.cents ?? 0, periodCents: period?.cents ?? 0, monthToDateCents: mtd?.cents ?? 0 },
    profit: {
      todayCents: profitToday?.cents ?? 0,
      periodCents: profitPeriod?.cents ?? 0,
      monthToDateCents: profitMtd?.cents ?? 0,
    },
    sales: {
      periodCount: period?.count ?? 0,
      unitsSold: itemsInPeriod[0]?.units ?? 0,
      directCents: period?.directCents ?? 0,
      settlementCents: period?.settlementCents ?? 0,
    },
    unpaid: { count: unpaid?.count ?? 0, cents: unpaid?.cents ?? 0 },
    byProduct: byProductRows.map((r) => ({
      productId: r.productId ?? null,
      name: r.name,
      quantity: r.quantity,
      revenueCents: r.revenueCents,
      profitCents: r.profitCents,
    })),
    daily,
    consignment: {
      activeCount: cons?.activeCount ?? 0,
      unitsOnHand: cons?.unitsOnHand ?? 0,
      valueOnHandCents: cons?.valueOnHandCents ?? 0,
      dueCount: cons?.dueCount ?? 0,
      dueSoonCount: cons?.dueSoonCount ?? 0,
    },
  };
}

/** Per-lead totals for the lead card and check-in screen. */
export async function leadSalesSnapshot(leadId: number): Promise<{
  lifetimeCents: number;
  lifetimeProfitCents: number;
  salesCount: number;
  lastSaleAt: string | null;
  activeConsignments: ConsignmentWithRefs[];
}> {
  const completedForLead = and(eq(salesSales.leadId, leadId), eq(salesSales.status, "completed"));
  const [[totals], [profit], active] = await Promise.all([
    db
      .select({
        cents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
        last: sql<string | null>`max(${salesSales.soldAt})`,
      })
      .from(salesSales)
      .where(completedForLead),
    db
      .select({
        cents: sql<number>`coalesce(sum((${salesSaleItems.unitPriceCents} - ${salesSaleItems.unitCostCents}) * ${salesSaleItems.quantity}), 0)::int`,
      })
      .from(salesSaleItems)
      .innerJoin(salesSales, eq(salesSaleItems.saleId, salesSales.id))
      .where(completedForLead),
    listConsignments({ leadId, status: "active" }),
  ]);
  return {
    lifetimeCents: totals?.cents ?? 0,
    lifetimeProfitCents: profit?.cents ?? 0,
    salesCount: totals?.count ?? 0,
    lastSaleAt: totals?.last ? new Date(totals.last).toISOString() : null,
    activeConsignments: active,
  };
}

export const salesStorage = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  listTiers,
  listTiersBatch,
  replaceTiers,
  priceProduct,
  listSales,
  getSale,
  createDirectSale,
  updateSale,
  listConsignments,
  getConsignment,
  getActiveConsignment,
  updateConsignment,
  listMovements,
  runDeposit,
  runSettlement,
  runReturn,
  runAdjustment,
  closeConsignment,
  salesSummary,
  leadSalesSnapshot,
};
