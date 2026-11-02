import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  customerOrders as orders,
  customerOrderLines as lines,
  customerOrderPieces as pieces,
  customerOrderDeliveries as deliveries,
  customerOrderEvents as events,
  customerOrderPayments as payments,
  customerOrderArtwork as artwork,
  organizations,
  organizationMemberships,
  salesLeads,
  salesReps,
  salesProducts,
  salesVisits,
  salesOpportunitiesLocal,
  salesSales,
  tags,
  tagBatches,
  printModels,
  printModelVersions,
} from "#shared/schema.js";
import {
  orderLineBalance,
  orderWorkState,
  pieceAllocationBlocker,
  orderCreditBalance,
  planOrderDelivery,
  MAX_ORDER_CENTS,
  type CustomerOrderCreateInput,
} from "#shared/customerOrders.js";
import { PRINT_MAX_PLATES, type PrintNfcMount } from "#shared/printProduction.js";
import type { TagActor } from "#shared/tagAccess.js";
import { resolveTagFace } from "#shared/tagFace.js";
import { createTagSaleWithin, releaseSalePieces } from "../tags/sales.js";
import { leadUsableBy, rows, deliverKit } from "../tags/repository.js";
import { createJob } from "../tags/production.js";
import { companyOrganizationId } from "../organizations/service.js";
import { getPrivateFile, putPrivateFile, discardFiles } from "../lib/files.js";

export type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof orders.$inferSelect;
type Line = typeof lines.$inferSelect;
export class OrderError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
function fail(code: string, status = 409): never {
  throw new OrderError(code, status);
}
const managed = (actor: TagActor, organizationId: number) =>
  actor.isManager ||
  Boolean(actor.managedOrganizationIds?.includes(organizationId));
const owns = (actor: TagActor, order: Order) =>
  managed(actor, order.organizationId) ||
  (actor.repId === order.repId &&
    actor.organizationIds?.includes(order.organizationId));
const fingerprint = (action: string, body: unknown) =>
  createHash("sha256").update(JSON.stringify({ action, body })).digest("hex");

async function authorized(
  id: string,
  actor: TagActor,
  tx: typeof db | OrderTx = db,
  lock = false,
) {
  const query = tx.select().from(orders).where(eq(orders.id, id));
  const [order] = await (lock ? query.for("update") : query);
  if (!order) return fail("order_not_found", 404);
  const lineQuery = tx
    .select()
    .from(lines)
    .where(eq(lines.orderId, id))
    .orderBy(lines.sequence);
  const orderLines = await (lock ? lineQuery.for("update") : lineQuery);
  const seller = Boolean(owns(actor, order));
  const visibleLines = seller
    ? orderLines
    : orderLines.filter((l) => managed(actor, l.producerOrganizationId));
  if (!seller && !visibleLines.length) return fail("order_not_found", 404);
  return { order, lines: visibleLines, seller };
}

async function counts(lineId: string, tx: typeof db | OrderTx = db) {
  const [result] = await rows<{
    delivered: number;
    allocated: number;
    pending: number;
  }>(
    sql`
    SELECT (SELECT count(*)::int FROM customer_order_pieces WHERE line_id=${lineId} AND state='delivered') AS delivered,
      (SELECT count(*)::int FROM customer_order_pieces WHERE line_id=${lineId} AND state='allocated') AS allocated,
      (SELECT count(*)::int FROM tags t JOIN tag_batches b ON b.id=t.batch_id JOIN print_jobs j ON j.id=b.print_job_id
       JOIN print_requests r ON r.id=j.request_id WHERE r.customer_order_line_id=${lineId} AND t.stock_status='pending'
       AND j.status NOT IN ('cancelled','failed')) AS pending`,
    tx,
  );
  return result ?? { delivered: 0, allocated: 0, pending: 0 };
}
async function credit(id: string, tx: typeof db | OrderTx = db) {
  return orderCreditBalance(
    await tx.select().from(payments).where(eq(payments.orderId, id)),
  );
}
async function sellerActive(order: Order, tx: OrderTx) {
  const [member] = await tx
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .innerJoin(salesReps, eq(salesReps.id, organizationMemberships.repId))
    .where(
      and(
        eq(organizationMemberships.organizationId, order.organizationId),
        eq(organizationMemberships.repId, order.repId),
        eq(organizationMemberships.isActive, true),
        eq(salesReps.isActive, true),
        sql`${organizationMemberships.blockedAt} IS NULL AND ${salesReps.blockedAt} IS NULL AND ${salesReps.deletedAt} IS NULL`,
      ),
    );
  if (!member) fail("order_seller_inactive");
}

export async function getOrder(id: string, actor: TagActor) {
  const scope = await authorized(id, actor);
  const [lead, rep, lineInfo, paymentRows, eventRows, deliveryRows] =
    await Promise.all([
      db
        .select({ name: salesLeads.name })
        .from(salesLeads)
        .where(eq(salesLeads.id, scope.order.leadId)),
      db
        .select({
          name: salesReps.displayName,
          active: sql<boolean>`${salesReps.isActive} AND ${salesReps.blockedAt} IS NULL AND ${salesReps.deletedAt} IS NULL AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.rep_id=${scope.order.repId} AND m.organization_id=${scope.order.organizationId} AND m.is_active AND m.blocked_at IS NULL)`,
        })
        .from(salesReps)
        .where(eq(salesReps.id, scope.order.repId)),
      Promise.all(
        scope.lines.map(async (line) => {
          const [balance, units, revisions, production, model] =
            await Promise.all([
              counts(line.id),
              rows<{
                id: string;
                tagId: string;
                publicCode: string;
                state: string;
                repId: number | null;
                organizationId: number;
                deliveryId: string | null;
              }>(sql`
          SELECT p.id,p.tag_id AS "tagId",t.public_code AS "publicCode",p.state,t.rep_id AS "repId",t.organization_id AS "organizationId",p.delivery_id AS "deliveryId"
          FROM customer_order_pieces p JOIN tags t ON t.id=p.tag_id WHERE p.line_id=${line.id} ORDER BY p.created_at`),
              db
                .select()
                .from(artwork)
                .where(eq(artwork.lineId, line.id))
                .orderBy(artwork.revision),
              rows<{
                id: string;
                quantity: number;
                status: string;
                modelTitle: string;
              }>(sql`SELECT r.id,r.quantity,
          CASE WHEN bool_or(j.status IN ('requested','building','ready','printing')) THEN 'open' WHEN bool_or(j.status='printed') THEN 'printed' ELSE 'stopped' END AS status,
          m.title AS "modelTitle" FROM print_requests r JOIN print_jobs j ON j.request_id=r.id JOIN print_models m ON m.id=r.model_id
          WHERE r.customer_order_line_id=${line.id} GROUP BY r.id,m.title ORDER BY r.created_at`),
              line.modelId
                ? db
                    .select({ slug: printModels.slug })
                    .from(printModels)
                    .where(eq(printModels.id, line.modelId))
                : [],
            ]);
          const approved = revisions.some((r) => r.status === "approved");
          const { unitPriceCents, ...operational } = line;
          return {
            ...operational,
            ...(scope.seller ? { unitPriceCents } : {}),
            ...balance,
            ...orderLineBalance({ ...line, ...balance }),
            approved,
            modelSlug: model[0]?.slug ?? null,
            units,
            artwork: revisions.map(({ fileRef, ...r }) => ({
              ...r,
              hasFile: Boolean(fileRef),
            })),
            production,
          };
        }),
      ),
      scope.seller
        ? db
            .select()
            .from(payments)
            .where(eq(payments.orderId, id))
            .orderBy(payments.createdAt)
        : [],
      scope.seller
        ? db
            .select({
              id: events.id,
              action: events.action,
              detail: events.detail,
              createdAt: events.createdAt,
            })
            .from(events)
            .where(eq(events.orderId, id))
            .orderBy(events.createdAt)
        : [],
      scope.seller
        ? db
            .select({
              id: deliveries.id,
              orderId: deliveries.orderId,
              saleId: deliveries.saleId,
              status: deliveries.status,
              createdAt: deliveries.createdAt,
              totalCents: salesSales.totalCents,
              paidCents: salesSales.paidCents,
              paymentStatus: salesSales.paymentStatus,
            })
            .from(deliveries)
            .innerJoin(salesSales, eq(salesSales.id, deliveries.saleId))
            .where(eq(deliveries.orderId, id))
            .orderBy(deliveries.createdAt)
        : [],
    ]);
  const canManage = managed(actor, scope.order.organizationId);
  return {
    ...scope.order,
    notes: scope.seller ? scope.order.notes : null,
    customerName: lead[0]?.name ?? "",
    sellerName: rep[0]?.name ?? "",
    sellerActive: rep[0]?.active ?? false,
    sellerView: scope.seller,
    canManage,
    canDesign: actor.isManager,
    canProduce:
      actor.isManager ||
      scope.lines.some((l) => managed(actor, l.producerOrganizationId)),
    workState: orderWorkState(
      lineInfo.map((l) => ({ ...l, custom: l.custom })),
      scope.order.status === "cancelled",
    ),
    lines: lineInfo,
    payments: paymentRows,
    deliveries: deliveryRows,
    events: eventRows,
    ...(scope.seller
      ? {
          creditCents: orderCreditBalance(paymentRows),
          totalCents: scope.lines.reduce(
            (s, l) => s + (l.quantity - l.cancelledQuantity) * l.unitPriceCents,
            0,
          ),
        }
      : {}),
  };
}

export async function listOrders(
  actor: TagActor,
  options: {
    leadId?: number;
    all?: boolean;
    limit?: number;
    offset?: number;
    work?: string;
  } = {},
) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = Math.max(0, options.offset ?? 0);
  const organizationIds = actor.organizationIds ?? [];
  const ownerIds = actor.managedOrganizationIds ?? [];
  const access =
    actor.isManager && options.all
      ? sql`TRUE`
      : options.all && ownerIds.length
        ? sql`(o.organization_id IN (${sql.join(
            ownerIds.map((i) => sql`${i}`),
            sql`,`,
          )}) OR EXISTS(SELECT 1 FROM customer_order_lines l WHERE l.order_id=o.id AND l.producer_organization_id IN (${sql.join(
            ownerIds.map((i) => sql`${i}`),
            sql`,`,
          )})))`
        : organizationIds.length
          ? sql`o.rep_id=${actor.repId} AND o.organization_id IN (${sql.join(
              organizationIds.map((i) => sql`${i}`),
              sql`,`,
            )})`
          : sql`FALSE`;
  const unfinished = sql`o.status='open' AND EXISTS(SELECT 1 FROM customer_order_lines l WHERE l.order_id=o.id AND l.quantity-l.cancelled_quantity>(SELECT count(*) FROM customer_order_pieces p WHERE p.line_id=l.id AND p.state='delivered'))`;
  const financialAccess = actor.isManager
    ? sql`TRUE`
    : sql`(o.rep_id=${actor.repId} OR ${
        ownerIds.length
          ? sql`o.organization_id IN (${sql.join(
              ownerIds.map((i) => sql`${i}`),
              sql`,`,
            )})`
          : sql`FALSE`
      })`;
  const work =
    options.work === "open"
      ? sql`AND (${unfinished})`
      : options.work === "attention"
        ? sql`AND ((${unfinished}) OR (${financialAccess} AND (
    COALESCE((SELECT sum(CASE WHEN p.kind IN ('received','release') THEN p.amount_cents ELSE -p.amount_cents END) FROM customer_order_payments p WHERE p.order_id=o.id),0)>0
    OR EXISTS(SELECT 1 FROM customer_order_deliveries d JOIN sales_sales s ON s.id=d.sale_id WHERE d.order_id=o.id AND d.status='confirmed' AND s.paid_cents<s.total_cents))))`
        : sql``;
  const where = sql`${access} ${options.leadId ? sql`AND o.lead_id=${options.leadId}` : sql``} ${work}`;
  const [total] = await rows<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM customer_orders o WHERE ${where}`,
  );
  const found = await rows<{ id: string }>(
    sql`SELECT o.id FROM customer_orders o WHERE ${where} ORDER BY o.created_at DESC,o.id LIMIT ${limit + 1} OFFSET ${offset}`,
  );
  return {
    items: await Promise.all(
      found.slice(0, limit).map((o) => getOrder(o.id, actor)),
    ),
    total: total.total,
    nextOffset: found.length > limit ? offset + limit : null,
  };
}

async function validateLine(
  input: CustomerOrderCreateInput["lines"][number],
  currency: string,
  organizationId: number,
  actor: TagActor,
  tx: OrderTx,
) {
  const [product] = await tx
    .select()
    .from(salesProducts)
    .where(eq(salesProducts.id, input.salesProductId));
  if (
    !product?.isActive ||
    product.kind !== "physical" ||
    product.currency !== currency
  )
    fail("order_product_invalid", 400);
  const company = await companyOrganizationId();
  const [ownOrg] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const producerId =
    input.producerOrganizationId ??
    (ownOrg?.printsOwnPieces ? organizationId : company);
  const [producer] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, producerId));
  if (
    !producer?.isActive ||
    (producerId !== company && !producer.printsOwnPieces)
  )
    fail("order_producer_invalid", 400);
  if (producerId !== organizationId && producerId !== company) {
    const [link] = await rows(
      sql`SELECT 1 FROM organization_links WHERE producer_id=${producerId} AND seller_id=${organizationId}`,
      tx,
    );
    if (!link || producer.distribution !== "own")
      fail("order_producer_invalid", 400);
  }
  let model: typeof printModels.$inferSelect | undefined;
  if (input.modelId) {
    [model] = await tx
      .select()
      .from(printModels)
      .where(eq(printModels.id, input.modelId))
      .for("share");
    if (
      !model ||
      model.customerOrderLineId ||
      model.status !== "ready" ||
      model.productType !== input.productType ||
      model.face !== input.face ||
      model.salesProductId !== input.salesProductId ||
      (input.theme && model.theme !== input.theme)
    )
      fail("order_piece_design", 400);
    if (
      !actor.isManager &&
      producer.releasedPrintModels &&
      !producer.releasedPrintModels.includes(model.slug)
    )
      fail("order_model_not_released", 403);
  }
  if (!input.custom && !model) fail("order_model_required", 400);
  return { producerId, model };
}

export async function createOrder(
  input: CustomerOrderCreateInput,
  actor: TagActor,
  key: string,
) {
  checkKey(key);
  const hash = fingerprint("create", input);
  const id = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${actor.userId + key}))`,
    );
    const [prior] = await tx
      .select()
      .from(events)
      .where(
        and(eq(events.actorUserId, actor.userId), eq(events.commandKey, key)),
      );
    if (prior) {
      if (prior.fingerprint !== hash) fail("order_idempotency_conflict");
      return prior.orderId;
    }
    if (!(await leadUsableBy(actor, input.leadId, tx)))
      fail("order_not_found", 404);
    const [lead] = await tx
      .select()
      .from(salesLeads)
      .where(eq(salesLeads.id, input.leadId))
      .for("update");
    if (!lead) return fail("order_not_found", 404);
    if (input.visitId) {
      const [visit] = await tx
        .select()
        .from(salesVisits)
        .where(eq(salesVisits.id, input.visitId));
      if (
        !visit ||
        visit.leadId !== lead.id ||
        (!managed(actor, lead.organizationId) && visit.repId !== actor.repId)
      )
        fail("order_visit_invalid", 400);
    }
    if (input.opportunityId) {
      const [deal] = await tx
        .select()
        .from(salesOpportunitiesLocal)
        .where(eq(salesOpportunitiesLocal.id, input.opportunityId))
        .for("update");
      if (
        !deal ||
        deal.leadId !== lead.id ||
        deal.status !== "won" ||
        (!managed(actor, lead.organizationId) && deal.repId !== actor.repId)
      )
        fail("order_deal_invalid", 400);
      const [converted] = await tx
        .select()
        .from(orders)
        .where(eq(orders.opportunityId, deal.id));
      if (converted) return converted.id;
    }
    const prepared = [];
    for (const line of input.lines)
      prepared.push(
        await validateLine(
          line,
          input.currency,
          lead.organizationId,
          actor,
          tx,
        ),
      );
    const [order] = await tx
      .insert(orders)
      .values({
        organizationId: lead.organizationId,
        leadId: lead.id,
        repId: actor.repId,
        visitId: input.visitId,
        opportunityId: input.opportunityId,
        currency: input.currency,
        notes: input.notes,
        createdByUserId: actor.userId,
      })
      .returning();
    await sellerActive(order, tx);
    for (const [i, line] of Array.from(input.lines.entries()))
      await tx.insert(lines).values({
        orderId: order.id,
        sequence: i + 1,
        quantity: line.quantity,
        description: line.description,
        salesProductId: line.salesProductId,
        productType: line.productType,
        face: line.face,
        theme: line.theme,
        unitPriceCents: line.unitPriceCents,
        producerOrganizationId: prepared[i].producerId,
        modelId: prepared[i].model?.id,
        versionId: prepared[i].model?.currentVersionId,
        custom: line.custom ? "custom" : "standard",
      });
    await tx.insert(events).values({
      orderId: order.id,
      action: "created",
      commandKey: key,
      fingerprint: hash,
      actorUserId: actor.userId,
      detail: {},
    });
    return order.id;
  });
  return getOrder(id, actor);
}
function checkKey(key: string) {
  if (key.trim().length < 8 || key.length > 120)
    fail("order_idempotency_required", 400);
}

type CommandBody = { revision: number; [key: string]: unknown };
async function command(
  id: string,
  actor: TagActor,
  action: string,
  key: string,
  input: CommandBody,
  run: (
    context: Awaited<ReturnType<typeof authorized>>,
    tx: OrderTx,
    afterCommit: Array<() => Promise<void>>,
  ) => Promise<Record<string, unknown>>,
) {
  checkKey(key);
  const hash = fingerprint(`${id}:${action}`, input);
  const afterCommit: Array<() => Promise<void>> = [];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${actor.userId + key}))`,
    );
    const scope = await authorized(id, actor, tx, true);
    const [prior] = await tx
      .select()
      .from(events)
      .where(
        and(eq(events.actorUserId, actor.userId), eq(events.commandKey, key)),
      );
    if (prior) {
      if (prior.fingerprint !== hash || prior.orderId !== id)
        fail("order_idempotency_conflict");
      return;
    }
    if (scope.order.revision !== input.revision)
      fail("order_revision_conflict");
    const detail = await run(scope, tx, afterCommit);
    await tx
      .update(orders)
      .set({ revision: sql`${orders.revision}+1`, updatedAt: new Date() })
      .where(eq(orders.id, id));
    await tx.insert(events).values({
      orderId: id,
      action,
      commandKey: key,
      fingerprint: hash,
      actorUserId: actor.userId,
      detail,
    });
  });
  for (const run of afterCommit) {
    try {
      await run();
    } catch (e) {
      console.error("[customer-orders] after commit failed", e);
    }
  }
  return getOrder(id, actor);
}
const lineOf = (
  scope: Awaited<ReturnType<typeof authorized>>,
  lineId: string,
) =>
  scope.lines.find((l) => l.id === lineId) ?? fail("order_line_not_found", 404);
const editable = (scope: Awaited<ReturnType<typeof authorized>>) => {
  if (!scope.seller) fail("order_forbidden", 403);
  if (scope.order.status !== "open") fail("order_closed");
};

export async function allocateOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: { revision: number; lineId: string; tagIds: string[] },
) {
  return command(id, actor, "allocated", key, input, async (scope, tx) => {
    editable(scope);
    await sellerActive(scope.order, tx);
    const line = lineOf(scope, input.lineId);
    if (
      line.custom === "custom" &&
      !(
        await tx
          .select()
          .from(artwork)
          .where(
            and(eq(artwork.lineId, line.id), eq(artwork.status, "approved")),
          )
      ).length
    )
      fail("order_artwork_required");
    const balance = await counts(line.id, tx);
    if (
      input.tagIds.length > orderLineBalance({ ...line, ...balance }).toProduce
    )
      fail("order_quantity_exceeded");
    const selected = await tx
      .select()
      .from(tags)
      .where(inArray(tags.id, input.tagIds))
      .orderBy(tags.id)
      .for("update");
    if (
      selected.length !== input.tagIds.length ||
      new Set(input.tagIds).size !== input.tagIds.length
    )
      fail("order_piece_unavailable");
    for (const tag of selected) {
      const [batch] = tag.batchId
        ? await tx
            .select()
            .from(tagBatches)
            .where(eq(tagBatches.id, tag.batchId))
        : [];
      const [sale] = await rows(
        sql`SELECT 1 FROM sales_sale_tags WHERE tag_id=${tag.id} AND status='active'`,
        tx,
      );
      const blocker = pieceAllocationBlocker(
        {
          ...tag,
          salesProductId: tag.salesProductId ?? batch?.salesProductId ?? null,
          face: resolveTagFace({
            face: tag.face,
            batchFace: batch?.face,
            productType: tag.productType,
          }),
          orderLineId: tag.customerOrderLineId,
          saleId: sale ? 1 : null,
        },
        line,
        scope.order.leadId,
      );
      if (blocker) fail(blocker);
      if (tag.destinationUrl && tag.leadId !== scope.order.leadId)
        fail("order_piece_customer");
      if (
        tag.organizationId !== scope.order.organizationId ||
        (tag.repId !== scope.order.repId &&
          !(managed(actor, tag.organizationId) && tag.repId === null))
      )
        fail("order_piece_custody");
      if (line.theme || line.custom === "custom") {
        const [printed] = tag.batchId
          ? await rows<{ model_id: string }>(
              sql`SELECT model_id FROM print_jobs WHERE batch_id=${tag.batchId} ORDER BY created_at DESC LIMIT 1`,
              tx,
            )
          : [];
        if (!printed || printed.model_id !== line.modelId)
          fail("order_piece_design");
      }
      await tx
        .update(tags)
        .set({ customerOrderLineId: line.id })
        .where(eq(tags.id, tag.id));
    }
    return { lineId: line.id, quantity: selected.length };
  });
}

export async function produceOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: { revision: number; lineId: string; quantity?: number; nfcMount?: PrintNfcMount },
) {
  return command(
    id,
    actor,
    "production_requested",
    key,
    input,
    async (scope, tx, afterCommit) => {
      if (scope.order.status !== "open") fail("order_closed");
      const line = lineOf(scope, input.lineId);
      if (!scope.seller && !managed(actor, line.producerOrganizationId))
        fail("order_forbidden", 403);
      await sellerActive(scope.order, tx);
      if (!line.modelId) fail("order_model_required");
      if (line.custom === "custom") {
        const [approved] = await tx
          .select()
          .from(artwork)
          .where(
            and(eq(artwork.lineId, line.id), eq(artwork.status, "approved")),
          );
        const [version] = line.versionId
          ? await tx
              .select()
              .from(printModelVersions)
              .where(eq(printModelVersions.id, line.versionId))
          : [];
        if (!approved || !version?.preview) fail("order_artwork_required");
      }
      const missing = orderLineBalance({
        ...line,
        ...(await counts(line.id, tx)),
      }).toProduce;
      const quantity = input.quantity ?? Math.min(missing, PRINT_MAX_PLATES);
      if (quantity > missing || quantity > PRINT_MAX_PLATES)
        fail("order_quantity_exceeded");
      if (!quantity) fail("order_nothing_to_produce");
      const [model] = await tx
        .select()
        .from(printModels)
        .where(eq(printModels.id, line.modelId));
      if (!model || model.currentVersionId !== line.versionId)
        fail("order_design_changed");
      const [lead] = await tx
        .select({ name: salesLeads.name })
        .from(salesLeads)
        .where(eq(salesLeads.id, scope.order.leadId));
      const request = await createJob(
        {
          model: line.modelId,
          quantity,
          nfcMount: input.nfcMount,
          organization: line.producerOrganizationId,
          notes: lead?.name ?? line.description,
        },
        actor.userId,
        "admin",
        actor.isManager ? null : [line.producerOrganizationId],
        null,
        { lineId: line.id, within: { tx, afterCommit } },
      );
      return { lineId: line.id, requestId: request.id, quantity };
    },
  );
}

export async function deliverOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    tagIds: string[];
    paymentStatus: "paid" | "partial" | "unpaid";
    paidCents?: number;
    applyCreditCents: number;
    paymentMethod?: "cash" | "card" | "pix" | "transfer" | "invoice" | "other";
  },
) {
  return command(id, actor, "delivered", key, input, async (scope, tx) => {
    editable(scope);
    await sellerActive(scope.order, tx);
    const selected = await tx
      .select()
      .from(tags)
      .where(inArray(tags.id, input.tagIds))
      .orderBy(tags.id)
      .for("update");
    if (
      !selected.length ||
      selected.length !== input.tagIds.length ||
      new Set(input.tagIds).size !== input.tagIds.length
    )
      fail("order_piece_unavailable");
    const groups = new Map<string, { line: Line; tagIds: string[] }>();
    for (const tag of selected) {
      const line = scope.lines.find((l) => l.id === tag.customerOrderLineId);
      if (
        !line ||
        tag.stockStatus !== "available" ||
        tag.repId !== scope.order.repId ||
        tag.organizationId !== scope.order.organizationId
      )
        fail("order_piece_custody");
      const group = groups.get(line.id) ?? { line, tagIds: [] as string[] };
      group.tagIds.push(tag.id);
      groups.set(line.id, group);
    }
    let total = 0;
    const productIds = Array.from(
      new Set(Array.from(groups.values()).map((g) => g.line.salesProductId)),
    ).sort((a, b) => a - b);
    const products = await tx
      .select()
      .from(salesProducts)
      .where(inArray(salesProducts.id, productIds))
      .orderBy(salesProducts.id)
      .for("share");
    if (
      products.length !== productIds.length ||
      products.some((p) => p.currency !== scope.order.currency)
    )
      fail("order_currency_changed");
    for (const g of Array.from(groups.values())) {
      if (
        g.tagIds.length >
        orderLineBalance({ ...g.line, ...(await counts(g.line.id, tx)) })
          .remaining
      )
        fail("order_quantity_exceeded");
      total += g.line.unitPriceCents * g.tagIds.length;
    }
    const cash =
      input.paymentStatus === "paid"
        ? Math.max(0, total - input.applyCreditCents)
        : input.paymentStatus === "partial"
          ? (input.paidCents ?? 0)
          : 0;
    if (
      input.paymentStatus === "partial" &&
      (cash + input.applyCreditCents <= 0 ||
        cash + input.applyCreditCents >= total)
    )
      fail("order_payment_invalid", 400);
    if (cash > 0 && !input.paymentMethod)
      fail("order_payment_method_required", 400);
    const payment = planOrderDelivery(
      total,
      await credit(id, tx),
      input.applyCreditCents,
      cash,
    );
    if (!payment.ok) fail(payment.code, 400);
    if (total > 0 && payment.paymentStatus !== input.paymentStatus)
      fail("order_payment_invalid", 400);
    await tx
      .update(tags)
      .set({ customerOrderLineId: null })
      .where(inArray(tags.id, input.tagIds));
    const sale = await createTagSaleWithin(
      {
        leadId: scope.order.leadId,
        sellerRepId: scope.order.repId,
        visitId: scope.order.visitId,
        lines: Array.from(groups.values()).map((g) => ({
          salesProductId: g.line.salesProductId,
          tagIds: g.tagIds,
          unitPriceCents: g.line.unitPriceCents,
        })),
        paymentStatus: payment.paymentStatus,
        paidCents: payment.paidCents,
        paymentMethod: input.paymentMethod,
      },
      // The order command has authorized this customer, seller and every physical unit.
      // Reassignment does not silently change the customer's CRM owner.
      { ...actor, repId: scope.order.repId, isManager: true },
      `order:${createHash("sha256")
        .update(actor.userId + key)
        .digest("hex")}`,
      tx,
    );
    const [delivery] = await tx
      .insert(deliveries)
      .values({ orderId: id, saleId: sale.saleId, actorUserId: actor.userId })
      .returning();
    await tx
      .update(pieces)
      .set({
        state: "delivered",
        deliveryId: delivery.id,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(pieces.tagId, input.tagIds), eq(pieces.state, "allocated")),
      );
    if (cash > 0)
      await tx.insert(payments).values({
        orderId: id,
        kind: "received",
        amountCents: cash,
        paymentMethod: input.paymentMethod,
        deliveryId: delivery.id,
        reason: "delivery",
        actorUserId: actor.userId,
      });
    if (payment.paidCents > 0)
      await tx.insert(payments).values({
        orderId: id,
        kind: "applied",
        amountCents: payment.paidCents,
        deliveryId: delivery.id,
        reason: "delivery",
        actorUserId: actor.userId,
      });
    return {
      deliveryId: delivery.id,
      saleId: sale.saleId,
      quantity: selected.length,
      totalCents: total,
    };
  });
}

export async function changeOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    lineId?: string;
    quantity?: number;
    unitPriceCents?: number;
    repId?: number;
    reason: string;
  },
) {
  return command(id, actor, "changed", key, input, async (scope, tx) => {
    editable(scope);
    const changes: Record<string, { from: number; to: number }> = {};
    if (input.repId !== undefined) {
      if (!managed(actor, scope.order.organizationId))
        fail("order_forbidden", 403);
      await sellerActive({ ...scope.order, repId: input.repId }, tx);
      changes.repId = { from: scope.order.repId, to: input.repId };
      if (
        (
          await rows(
            sql`SELECT 1 FROM tags WHERE customer_order_line_id IN (SELECT id FROM customer_order_lines WHERE order_id=${id}) AND rep_id IS NOT NULL LIMIT 1`,
            tx,
          )
        ).length
      )
        fail("order_release_before_reassign");
      await tx
        .update(orders)
        .set({ repId: input.repId })
        .where(eq(orders.id, id));
      await tx.execute(
        sql`UPDATE sales_tasks SET rep_id=${input.repId},updated_at=now() WHERE customer_order_id=${id} AND status IN ('pending','in_progress')`,
      );
    }
    if (input.lineId) {
      const line = lineOf(scope, input.lineId);
      const balance = await counts(line.id, tx);
      const nextTotal = scope.lines.reduce(
        (sum, l) =>
          sum +
          (l.id === line.id
            ? (input.quantity ?? l.quantity) *
              (input.unitPriceCents ?? l.unitPriceCents)
            : (l.quantity - l.cancelledQuantity) * l.unitPriceCents),
        0,
      );
      if (nextTotal > MAX_ORDER_CENTS) fail("order_input_invalid", 400);
      if (input.quantity !== undefined && input.quantity !== line.quantity) {
        changes.quantity = { from: line.quantity, to: input.quantity };
        if (input.quantity < balance.delivered || input.quantity < 1)
          fail("order_quantity_exceeded");
        if (balance.allocated || balance.pending)
          fail("order_release_before_change");
        await tx
          .update(lines)
          .set({ quantity: input.quantity, cancelledQuantity: 0 })
          .where(eq(lines.id, line.id));
      }
      if (
        input.unitPriceCents !== undefined &&
        input.unitPriceCents !== line.unitPriceCents
      ) {
        if (balance.delivered || (await credit(id, tx)) > 0)
          fail("order_price_locked");
        changes.unitPriceCents = {
          from: line.unitPriceCents,
          to: input.unitPriceCents,
        };
        await tx
          .update(lines)
          .set({ unitPriceCents: input.unitPriceCents })
          .where(eq(lines.id, line.id));
      }
    }
    return { reason: input.reason, lineId: input.lineId, changes };
  });
}

export async function cancelOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: { revision: number; reason: string },
) {
  return command(id, actor, "cancelled", key, input, async (scope, tx) => {
    editable(scope);
    const [started] = await rows(
      sql`SELECT 1 FROM print_jobs j JOIN print_requests r ON r.id=j.request_id JOIN customer_order_lines l ON l.id=r.customer_order_line_id
      WHERE l.order_id=${id} AND j.status NOT IN ('requested','cancelled') LIMIT 1`,
      tx,
    );
    if (
      (started || (await credit(id, tx)) > 0) &&
      !managed(actor, scope.order.organizationId)
    )
      fail("order_owner_required", 403);
    if (started && !input.reason.trim()) fail("order_reason_required", 400);
    for (const line of scope.lines) {
      const balance = await counts(line.id, tx);
      await tx
        .update(lines)
        .set({ cancelledQuantity: line.quantity - balance.delivered })
        .where(eq(lines.id, line.id));
      await tx
        .update(tags)
        .set({ customerOrderLineId: null })
        .where(eq(tags.customerOrderLineId, line.id));
      await tx
        .update(pieces)
        .set({ state: "released", updatedAt: new Date() })
        .where(and(eq(pieces.lineId, line.id), eq(pieces.state, "allocated")));
    }
    await tx.execute(sql`WITH retired AS (UPDATE tags t SET stock_status='retired',status='retired',updated_at=now() FROM tag_batches b JOIN print_jobs j ON j.id=b.print_job_id JOIN print_requests r ON r.id=j.request_id JOIN customer_order_lines l ON l.id=r.customer_order_line_id
      WHERE t.batch_id=b.id AND l.order_id=${id} AND t.stock_status='pending' AND j.status IN ('requested','building','ready','failed') RETURNING t.id,t.ownership_type,t.custodian_rep_id)
      INSERT INTO tag_stock_movements(tag_id,movement_type,from_stock_status,to_stock_status,from_ownership_type,to_ownership_type,from_custodian_rep_id,to_custodian_rep_id,reference_type,reference_id,reason,actor_user_id)
      SELECT id,'retire','pending','retired',ownership_type,ownership_type,custodian_rep_id,custodian_rep_id,'customer_order',${id},${input.reason},${actor.userId} FROM retired`);
    await tx.execute(
      sql`UPDATE print_jobs SET status='cancelled',updated_at=now() WHERE request_id IN (SELECT r.id FROM print_requests r JOIN customer_order_lines l ON l.id=r.customer_order_line_id WHERE l.order_id=${id}) AND status IN ('requested','building','ready','failed')`,
    );
    await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(eq(orders.id, id));
    await tx.execute(
      sql`UPDATE sales_tasks SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE customer_order_id=${id} AND status IN ('pending','in_progress')`,
    );
    return { reason: input.reason, productionStarted: Boolean(started) };
  });
}

export async function releaseOrderPieces(
  id: string,
  actor: TagActor,
  key: string,
  input: { revision: number; tagIds: string[]; reason: string },
) {
  return command(id, actor, "released", key, input, async (scope, tx) => {
    editable(scope);
    const ownIds = scope.lines.map((l) => l.id);
    const selected = await tx
      .select()
      .from(tags)
      .where(
        and(
          inArray(tags.id, input.tagIds),
          inArray(tags.customerOrderLineId, ownIds),
        ),
      )
      .for("update");
    if (selected.length !== input.tagIds.length)
      fail("order_piece_unavailable");
    await tx
      .update(tags)
      .set({ customerOrderLineId: null })
      .where(inArray(tags.id, input.tagIds));
    await tx
      .update(pieces)
      .set({ state: "released", updatedAt: new Date() })
      .where(
        and(inArray(pieces.tagId, input.tagIds), eq(pieces.state, "allocated")),
      );
    return { quantity: selected.length, reason: input.reason };
  });
}

export async function recordOrderPayment(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    kind: "received" | "refund" | "retained";
    amountCents: number;
    paymentMethod?: string;
    referenceId?: string;
    reason: string;
  },
) {
  return command(
    id,
    actor,
    "payment_recorded",
    key,
    input,
    async (scope, tx) => {
      if (!scope.seller) fail("order_forbidden", 403);
      if (
        input.kind !== "received" &&
        !managed(actor, scope.order.organizationId)
      )
        fail("order_owner_required", 403);
      if (input.kind === "received") {
        if (scope.order.status !== "open") fail("order_closed");
        const total = scope.lines.reduce(
          (s, l) => s + (l.quantity - l.cancelledQuantity) * l.unitPriceCents,
          0,
        );
        const paid = (
          await tx.select().from(payments).where(eq(payments.orderId, id))
        ).reduce(
          (s, e) =>
            s +
            (e.kind === "received"
              ? e.amountCents
              : e.kind === "refund" || e.kind === "retained"
                ? -e.amountCents
                : 0),
          0,
        );
        if (input.amountCents + paid > total) fail("order_credit_exceeded");
        if (!input.paymentMethod) fail("order_payment_method_required", 400);
      } else {
        if (input.amountCents > (await credit(id, tx)))
          fail("order_credit_exceeded");
        if (!input.referenceId) fail("order_payment_reference", 400);
        const [receipt] = await tx
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.id, input.referenceId),
              eq(payments.orderId, id),
              eq(payments.kind, "received"),
            ),
          );
        if (!receipt) fail("order_payment_reference", 400);
        const used = (
          await tx
            .select()
            .from(payments)
            .where(eq(payments.referenceId, receipt.id))
        ).reduce((s, p) => s + p.amountCents, 0);
        if (input.amountCents + used > receipt.amountCents)
          fail("order_credit_exceeded");
      }
      const [payment] = await tx
        .insert(payments)
        .values({ ...input, orderId: id, actorUserId: actor.userId })
        .returning();
      return {
        paymentId: payment.id,
        kind: input.kind,
        amountCents: input.amountCents,
        reason: input.reason,
      };
    },
  );
}

export async function reverseOrderDelivery(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    deliveryId: string;
    returned: boolean;
    reason: string;
  },
) {
  return command(
    id,
    actor,
    "delivery_reversed",
    key,
    input,
    async (scope, tx) => {
      if (!managed(actor, scope.order.organizationId))
        fail("order_owner_required", 403);
      if (!input.returned) fail("order_return_required", 400);
      const [delivery] = await tx
        .select()
        .from(deliveries)
        .where(
          and(eq(deliveries.id, input.deliveryId), eq(deliveries.orderId, id)),
        )
        .for("update");
      if (!delivery || delivery.status !== "confirmed")
        fail("order_delivery_invalid");
      const [sale] = await tx
        .select()
        .from(salesSales)
        .where(eq(salesSales.id, delivery.saleId))
        .for("update");
      await tx
        .update(salesSales)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason,
        })
        .where(eq(salesSales.id, delivery.saleId));
      await releaseSalePieces(tx, delivery.saleId, actor.userId);
      await tx
        .update(pieces)
        .set({ state: "returned", updatedAt: new Date() })
        .where(eq(pieces.deliveryId, delivery.id));
      await tx
        .update(deliveries)
        .set({ status: "reversed" })
        .where(eq(deliveries.id, delivery.id));
      if (sale.paidCents > 0)
        await tx.insert(payments).values({
          orderId: id,
          kind: "release",
          amountCents: sale.paidCents,
          deliveryId: delivery.id,
          reason: input.reason,
          actorUserId: actor.userId,
        });
      if (scope.order.status === "cancelled")
        for (const line of scope.lines) {
          const balance = await counts(line.id, tx);
          await tx
            .update(lines)
            .set({ cancelledQuantity: line.quantity - balance.delivered })
            .where(eq(lines.id, line.id));
        }
      return { deliveryId: delivery.id, reason: input.reason };
    },
  );
}

export async function settleOrderDelivery(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    deliveryId: string;
    cashCents: number;
    applyCreditCents: number;
    paymentMethod?: string;
  },
) {
  return command(
    id,
    actor,
    "delivery_payment",
    key,
    input,
    async (scope, tx) => {
      if (!scope.seller) fail("order_forbidden", 403);
      const [delivery] = await tx
        .select()
        .from(deliveries)
        .where(
          and(eq(deliveries.id, input.deliveryId), eq(deliveries.orderId, id)),
        )
        .for("update");
      if (!delivery || delivery.status !== "confirmed")
        fail("order_delivery_invalid");
      const [sale] = await tx
        .select()
        .from(salesSales)
        .where(eq(salesSales.id, delivery.saleId))
        .for("update");
      const payment = planOrderDelivery(
        sale.totalCents - sale.paidCents,
        await credit(id, tx),
        input.applyCreditCents,
        input.cashCents,
      );
      if (!payment.ok) fail(payment.code);
      if (!payment.paidCents) fail("order_payment_invalid", 400);
      if (input.cashCents > 0 && !input.paymentMethod)
        fail("order_payment_method_required", 400);
      const paidCents = sale.paidCents + payment.paidCents;
      await tx
        .update(salesSales)
        .set({
          paidCents,
          paymentStatus: paidCents === sale.totalCents ? "paid" : "partial",
          paidAt: paidCents === sale.totalCents ? new Date() : null,
          paymentMethod: input.paymentMethod ?? sale.paymentMethod,
        })
        .where(eq(salesSales.id, sale.id));
      if (input.cashCents > 0)
        await tx.insert(payments).values({
          orderId: id,
          kind: "received",
          amountCents: input.cashCents,
          paymentMethod: input.paymentMethod,
          deliveryId: delivery.id,
          reason: "delivery_payment",
          actorUserId: actor.userId,
        });
      await tx.insert(payments).values({
        orderId: id,
        kind: "applied",
        amountCents: payment.paidCents,
        deliveryId: delivery.id,
        reason: "delivery_payment",
        actorUserId: actor.userId,
      });
      return { deliveryId: delivery.id, amountCents: payment.paidCents };
    },
  );
}

export async function dispatchOrder(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    lineId: string;
    tagIds: string[];
    unitCostCents?: number;
  },
) {
  return command(
    id,
    actor,
    "dispatched",
    key,
    input,
    async (scope, tx, afterCommit) => {
      if (scope.order.status !== "open") fail("order_closed");
      const line = lineOf(scope, input.lineId);
      if (!managed(actor, line.producerOrganizationId))
        fail("order_forbidden", 403);
      await sellerActive(scope.order, tx);
      const [seller] = await tx
        .select()
        .from(salesReps)
        .where(eq(salesReps.id, scope.order.repId));
      if (
        seller.costPolicy === "acquisition" &&
        input.unitCostCents === undefined
      )
        fail("order_cost_required");
      const selected = await tx
        .select()
        .from(tags)
        .where(inArray(tags.id, input.tagIds))
        .orderBy(tags.id)
        .for("update");
      if (
        !selected.length ||
        selected.length !== input.tagIds.length ||
        new Set(input.tagIds).size !== input.tagIds.length ||
        selected.some(
          (t) =>
            t.customerOrderLineId !== line.id ||
            t.repId !== null ||
            t.organizationId !== line.producerOrganizationId ||
            t.stockStatus !== "available",
        )
      )
        fail("order_piece_custody");
      const kit = await deliverKit(
        {
          repId: scope.order.repId,
          organizationId: scope.order.organizationId,
          sourceOrganizationId: line.producerOrganizationId,
          codes: selected.map((t) => t.publicCode),
          unitCostCents: input.unitCostCents,
          ownershipType:
            seller.costPolicy === "acquisition" ? "rep" : "company",
          note: line.description,
        },
        actor.userId,
        "admin",
        { tx, afterCommit },
      );
      return { kitId: kit.id, lineId: line.id, quantity: selected.length };
    },
  );
}

export async function orderCatalog(actor: TagActor) {
  const list = await rows<{
    id: string;
    title: string;
    productType: string;
    face: string;
    theme: string | null;
    salesProductId: number;
    unitPriceCents: number;
    currency: string;
  }>(sql`
    SELECT m.id,m.title,m.product_type AS "productType",m.face,m.theme,m.sales_product_id AS "salesProductId",p.base_price_cents AS "unitPriceCents",p.currency
    FROM print_models m JOIN sales_products p ON p.id=m.sales_product_id WHERE m.kind='serialized' AND m.status='ready'
    AND m.customer_order_line_id IS NULL AND p.is_active=true ORDER BY m.sort_order,m.title LIMIT 250`);
  const products = await db
    .select({
      id: salesProducts.id,
      name: salesProducts.name,
      currency: salesProducts.currency,
      basePriceCents: salesProducts.basePriceCents,
    })
    .from(salesProducts)
    .where(
      and(eq(salesProducts.kind, "physical"), eq(salesProducts.isActive, true)),
    );
  const orgIds = actor.organizationIds ?? [];
  const producers = await rows<{
    id: number;
    name: string;
    sellerOrganizationIds: number[];
  }>(sql`SELECT p.id,p.name,
    ARRAY(SELECT s.id FROM organizations s WHERE s.is_active AND (${actor.isManager} OR ${
      orgIds.length
        ? sql`s.id IN (${sql.join(
            orgIds.map((id) => sql`${id}`),
            sql`,`,
          )})`
        : sql`FALSE`
    })
      AND (p.id=s.id OR p.slug='xpot-company' OR (p.distribution='own' AND EXISTS(SELECT 1 FROM organization_links x WHERE x.producer_id=p.id AND x.seller_id=s.id)))) AS "sellerOrganizationIds"
    FROM organizations p WHERE p.is_active AND (p.prints_own_pieces OR p.slug='xpot-company') ORDER BY p.name`);
  return {
    models: list,
    products,
    producers: producers.filter((p) => p.sellerOrganizationIds.length),
  };
}

export async function orderCandidates(
  id: string,
  lineId: string,
  actor: TagActor,
  search = "",
) {
  const scope = await authorized(id, actor);
  if (!scope.seller) fail("order_forbidden", 403);
  const line = lineOf(scope, lineId);
  return rows<{
    id: string;
    publicCode: string;
  }>(sql`SELECT t.id,t.public_code AS "publicCode" FROM tags t LEFT JOIN tag_batches b ON b.id=t.batch_id
    WHERE t.organization_id=${scope.order.organizationId} AND (t.rep_id=${scope.order.repId} OR (${managed(actor, scope.order.organizationId)} AND t.rep_id IS NULL))
    AND t.customer_order_line_id IS NULL AND t.stock_status='available' AND t.status<>'retired'
    AND (t.lead_id IS NULL OR t.lead_id=${scope.order.leadId}) AND t.product_type=${line.productType}
    AND COALESCE(t.sales_product_id,b.sales_product_id)=${line.salesProductId} AND COALESCE(t.face,b.face,CASE WHEN t.product_type='google_review_sign' THEN 'google_review' ELSE NULL END)=${line.face}
    AND NOT EXISTS(SELECT 1 FROM sales_sale_tags st WHERE st.tag_id=t.id AND st.status='active')
    AND (${!line.theme && line.custom !== "custom"} OR EXISTS(SELECT 1 FROM print_jobs j WHERE j.batch_id=b.id AND j.model_id=${line.modelId}))
    AND (${search === ""} OR t.public_code ILIKE ${"%" + search + "%"}) ORDER BY t.public_code LIMIT 100`);
}

export async function orderAssignees(id: string, actor: TagActor) {
  const scope = await authorized(id, actor);
  if (!managed(actor, scope.order.organizationId))
    fail("order_owner_required", 403);
  return rows<{
    id: number;
    name: string;
  }>(sql`SELECT r.id,r.display_name AS name FROM organization_memberships m JOIN sales_reps r ON r.id=m.rep_id
    WHERE m.organization_id=${scope.order.organizationId} AND m.is_active AND m.blocked_at IS NULL AND r.is_active AND r.blocked_at IS NULL AND r.deleted_at IS NULL ORDER BY r.display_name`);
}

export async function orderDesignModels(
  id: string,
  lineId: string,
  actor: TagActor,
) {
  if (!actor.isManager) fail("order_forbidden", 403);
  const line = lineOf(await authorized(id, actor), lineId);
  return rows<{
    id: string;
    title: string;
    slug: string;
  }>(sql`SELECT m.id,m.title,m.slug FROM print_models m JOIN print_model_versions v ON v.id=m.current_version_id
    WHERE m.kind='serialized' AND m.status='ready' AND v.preview->>'fileRef' IS NOT NULL AND m.product_type=${line.productType} AND m.face=${line.face} AND m.sales_product_id=${line.salesProductId}
    AND m.customer_order_line_id=${line.id} ORDER BY m.title LIMIT 250`);
}

export async function linkOrderModel(
  id: string,
  actor: TagActor,
  key: string,
  input: { revision: number; lineId: string; modelId: string },
) {
  return command(id, actor, "model_linked", key, input, async (scope, tx) => {
    if (!actor.isManager) fail("order_forbidden", 403);
    editable(scope);
    const line = lineOf(scope, input.lineId);
    const [approved] = await tx
      .select()
      .from(artwork)
      .where(and(eq(artwork.lineId, line.id), eq(artwork.status, "approved")));
    const balance = await counts(line.id, tx);
    if (!approved || balance.pending || balance.allocated || balance.delivered)
      fail("order_artwork_required");
    const [model] = await tx
      .select()
      .from(printModels)
      .where(eq(printModels.id, input.modelId))
      .for("update");
    const [version] = model?.currentVersionId
      ? await tx
          .select()
          .from(printModelVersions)
          .where(eq(printModelVersions.id, model.currentVersionId))
      : [];
    if (
      !model ||
      !version?.preview ||
      model.status !== "ready" ||
      model.productType !== line.productType ||
      model.face !== line.face ||
      model.salesProductId !== line.salesProductId ||
      model.customerOrderLineId !== line.id
    )
      fail("order_preview_required");
    if (
      (
        await rows(
          sql`SELECT 1 FROM print_jobs WHERE model_id=${model.id} LIMIT 1`,
          tx,
        )
      ).length &&
      model.customerOrderLineId !== line.id
    )
      fail("order_design_locked");
    await tx
      .update(printModels)
      .set({ customerOrderLineId: line.id })
      .where(eq(printModels.id, model.id));
    await tx
      .update(lines)
      .set({ modelId: model.id, versionId: version.id, theme: model.theme })
      .where(eq(lines.id, line.id));
    return {
      modelId: model.id,
      versionId: version.id,
      artworkId: approved.id,
      lineId: line.id,
    };
  });
}

export async function addOrderArtwork(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    lineId: string;
    description: string;
    kind: "brief" | "proof";
    file?: { filename: string; contentType: string; data: string };
  },
) {
  let fileRef: string | undefined;
  let hash: string | undefined;
  let bytes: Buffer | undefined;
  if (input.file) {
    bytes = Buffer.from(input.file.data, "base64");
    if (bytes.length > 5 * 1024 * 1024 || !bytes.length)
      fail("order_artwork_file_invalid", 400);
    const valid =
      input.file.contentType === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.file.contentType === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : input.file.contentType === "application/pdf"
            ? bytes.subarray(0, 5).toString() === "%PDF-"
            : false;
    if (!valid) fail("order_artwork_file_invalid", 400);
    hash = createHash("sha256").update(bytes).digest("hex");
    // Access and role are checked before anything is uploaded.
    const scope = await authorized(id, actor);
    if (!scope.seller && !actor.isManager) fail("order_forbidden", 403);
    lineOf(scope, input.lineId);
    if (input.kind === "proof" && !actor.isManager)
      fail("order_forbidden", 403);
  }
  try {
    return await command(
      id,
      actor,
      "artwork_added",
      key,
      {
        ...input,
        file: input.file
          ? {
              sha256: hash,
              filename: input.file.filename,
              contentType: input.file.contentType,
            }
          : undefined,
      },
      async (scope, tx) => {
        editable(scope);
        const line = lineOf(scope, input.lineId);
        if (line.custom !== "custom") fail("order_artwork_invalid", 400);
        if (input.kind === "proof" && !actor.isManager)
          fail("order_forbidden", 403);
        if (
          (await counts(line.id, tx)).pending ||
          (await counts(line.id, tx)).delivered ||
          (await counts(line.id, tx)).allocated
        )
          fail("order_design_locked");
        if (input.file && bytes)
          fileRef = await putPrivateFile(
            `orders/${id}/${randomUUID()}`,
            bytes,
            input.file.contentType,
          );
        const prior = await tx
          .select()
          .from(artwork)
          .where(eq(artwork.lineId, line.id));
        // A changed brief/proof invalidates the old production choice as well as the approval.
        await tx
          .update(lines)
          .set({ modelId: null, versionId: null, theme: null })
          .where(eq(lines.id, line.id));
        await tx
          .update(artwork)
          .set({ status: "superseded" })
          .where(
            and(
              eq(artwork.lineId, line.id),
              inArray(artwork.status, ["approved", "proposed"]),
            ),
          );
        const [revision] = await tx
          .insert(artwork)
          .values({
            lineId: line.id,
            revision: prior.length + 1,
            kind: input.kind,
            description: input.description,
            fileRef,
            filename: input.file?.filename,
            contentType: input.file?.contentType,
            sha256: hash,
            createdByUserId: actor.userId,
          })
          .returning();
        return {
          artworkId: revision.id,
          lineId: line.id,
          revision: revision.revision,
        };
      },
    );
  } finally {
    if (
      fileRef &&
      !(
        await db
          .select({ id: artwork.id })
          .from(artwork)
          .where(eq(artwork.fileRef, fileRef))
      ).length
    )
      await discardFiles([fileRef], "uncommitted customer order artwork");
  }
}

export async function approveOrderArtwork(
  id: string,
  actor: TagActor,
  key: string,
  input: {
    revision: number;
    artworkId: string;
    approvedBy: string;
    approvalMethod: string;
    modelId?: string;
  },
) {
  return command(
    id,
    actor,
    "artwork_approved",
    key,
    input,
    async (scope, tx) => {
      editable(scope);
      const [revision] = await tx
        .select()
        .from(artwork)
        .where(eq(artwork.id, input.artworkId))
        .for("update");
      if (
        !revision ||
        revision.kind !== "proof" ||
        revision.status !== "proposed"
      )
        fail("order_artwork_invalid");
      const line = lineOf(scope, revision.lineId);
      const latest = await tx
        .select()
        .from(artwork)
        .where(eq(artwork.lineId, line.id))
        .orderBy(sql`${artwork.revision} DESC`)
        .limit(1);
      if (latest[0].id !== revision.id) fail("order_artwork_invalid");
      let linkedVersionId: string | null = null;
      if (input.modelId) {
        if (!actor.isManager) fail("order_forbidden", 403);
        const [model] = await tx
          .select()
          .from(printModels)
          .where(eq(printModels.id, input.modelId))
          .for("update");
        const [version] = model?.currentVersionId
          ? await tx
              .select()
              .from(printModelVersions)
              .where(eq(printModelVersions.id, model.currentVersionId))
          : [];
        if (
          !model ||
          model.status !== "ready" ||
          !version?.preview ||
          model.productType !== line.productType ||
          model.salesProductId !== line.salesProductId ||
          model.face !== line.face ||
          model.customerOrderLineId !== line.id
        )
          fail("order_preview_required");
        if (
          (
            await rows(
              sql`SELECT 1 FROM print_jobs WHERE model_id=${model.id} LIMIT 1`,
              tx,
            )
          ).length &&
          model.customerOrderLineId !== line.id
        )
          fail("order_design_locked");
        await tx
          .update(printModels)
          .set({ customerOrderLineId: line.id })
          .where(eq(printModels.id, model.id));
        await tx
          .update(lines)
          .set({ modelId: model.id, versionId: version.id, theme: model.theme })
          .where(eq(lines.id, line.id));
        linkedVersionId = version.id;
      }
      await tx
        .update(artwork)
        .set({ status: "superseded" })
        .where(
          and(eq(artwork.lineId, line.id), eq(artwork.status, "approved")),
        );
      await tx
        .update(artwork)
        .set({
          status: "approved",
          approvedBy: input.approvedBy,
          approvalMethod: input.approvalMethod,
          approvedAt: new Date(),
        })
        .where(eq(artwork.id, revision.id));
      return {
        artworkId: revision.id,
        approvedBy: input.approvedBy,
        approvalMethod: input.approvalMethod,
        modelId: input.modelId ?? null,
        versionId: linkedVersionId,
      };
    },
  );
}

export async function readOrderArtwork(
  id: string,
  artworkId: string,
  actor: TagActor,
) {
  const scope = await authorized(id, actor);
  const [revision] = await db
    .select()
    .from(artwork)
    .where(eq(artwork.id, artworkId));
  if (!revision?.fileRef || !scope.lines.some((l) => l.id === revision.lineId))
    fail("order_not_found", 404);
  return {
    body: await getPrivateFile(revision.fileRef),
    contentType: revision.contentType ?? "application/octet-stream",
    filename: revision.filename ?? "artwork",
  };
}
