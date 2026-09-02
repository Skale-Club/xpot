import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { salesStorage } from "../../storage-sales.js";
import { requireXpotUser, isManagerOrAdmin, loadAccessibleLead, type XpotActor } from "./middleware.js";
import { xpotSaleCreateSchema, xpotSalePaymentSchema, xpotSaleCancelSchema } from "#shared/xpot.js";
import { computeSaleTotals, paymentStatusFor } from "#shared/pricing.js";
import { syncSaleToXphere } from "./xphere-sync.js";

// Direct sales: what the rep closes on the spot (a website, a marketing plan,
// a handful of keychains sold outright). Consignment settlements also land
// here as sales, but are created by the consignments router.
export function createSalesRouter() {
  const router = Router();
  router.use(requireXpotUser);

  const listQuerySchema = z.object({
    leadId: z.coerce.number().int().positive().optional(),
    visitId: z.coerce.number().int().positive().optional(),
    repId: z.coerce.number().int().positive().optional(),
    status: z.enum(["completed", "cancelled"]).optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  // GET /sales — rep sees own; manager/admin sees all (optional ?repId=).
  router.get("/sales", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const q = listQuerySchema.parse(req.query);
    const repId = isManagerOrAdmin(actor) ? q.repId : actor.rep.id;
    const since = q.days ? new Date(Date.now() - q.days * 24 * 60 * 60 * 1000) : undefined;
    res.json(await salesStorage.listSales({ repId, leadId: q.leadId, visitId: q.visitId, status: q.status, since, limit: q.limit, offset: q.offset }));
  });

  // GET /sales/summary?days=30[&repId=] — revenue, by product, daily series, consignment stock.
  router.get("/sales/summary", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const repId = isManagerOrAdmin(actor)
      ? (req.query.repId ? Number(req.query.repId) : undefined)
      : actor.rep.id;
    res.json(await salesStorage.salesSummary({ repId, days }));
  });

  // GET /sales/lead/:leadId — lifetime totals + active consignments for a lead card.
  router.get("/sales/lead/:leadId", async (req, res) => {
    const lead = await loadAccessibleLead(req, res, Number(req.params.leadId));
    if (!lead) return;
    res.json(await salesStorage.leadSalesSnapshot(lead.id));
  });

  router.get("/sales/:id", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const sale = await salesStorage.getSale(Number(req.params.id));
    if (!sale) return res.status(404).json({ message: "Sale not found" });
    if (!isManagerOrAdmin(actor) && sale.sale.repId !== actor.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(sale);
  });

  // POST /sales — direct sale with line items. Prices come from the catalog
  // (volume tiers) unless the rep overrides a unit price.
  router.post("/sales", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const input = xpotSaleCreateSchema.parse(req.body);

    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;

    if (input.visitId) {
      const visit = await storage.getSalesVisit(input.visitId);
      if (!visit || visit.leadId !== lead.id) {
        return res.status(400).json({ message: "Visit does not belong to this lead" });
      }
    }

    // Resolve each line against the catalog.
    const lines: {
      productId: number | null; description: string; quantity: number;
      unitPriceCents: number; unitCostCents: number; totalCents: number;
    }[] = [];
    let currency = "USD";
    for (const item of input.items) {
      let description = item.description?.trim() || "";
      let unitPriceCents = item.unitPriceCents;
      // Ad-hoc lines have no catalog cost, so their profit equals their price.
      let unitCostCents = 0;
      if (item.productId) {
        const priced = await salesStorage.priceProduct(item.productId, item.quantity);
        if (!priced) return res.status(400).json({ message: `Product ${item.productId} not found` });
        if (!priced.product.isActive) return res.status(400).json({ message: `${priced.product.name} is no longer sold` });
        description = description || priced.product.name;
        unitPriceCents = unitPriceCents ?? priced.unitPriceCents;
        // Frozen here: editing the product's cost later must not rewrite the
        // profit of a sale that already happened.
        unitCostCents = priced.unitCostCents;
        currency = priced.product.currency;
      }
      if (unitPriceCents === undefined) {
        return res.status(400).json({ message: `Unit price required for "${description}"` });
      }
      lines.push({
        productId: item.productId ?? null,
        description,
        quantity: item.quantity,
        unitPriceCents,
        unitCostCents,
        totalCents: item.quantity * unitPriceCents,
      });
    }

    const totals = computeSaleTotals(lines, input.discountCents ?? 0);
    const paidCents = input.paymentStatus === "paid"
      ? totals.totalCents
      : input.paymentStatus === "unpaid"
        ? 0
        : Math.min(input.paidCents ?? totals.totalCents, totals.totalCents);
    const paymentStatus = input.paymentStatus ?? paymentStatusFor(paidCents, totals.totalCents);
    const soldAt = input.soldAt ? new Date(input.soldAt) : new Date();

    const sale = await salesStorage.createDirectSale(
      {
        leadId: lead.id,
        repId: actor.rep.id,
        visitId: input.visitId ?? null,
        kind: "direct",
        status: "completed",
        currency,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        paymentStatus,
        paymentMethod: input.paymentMethod ?? null,
        paidCents,
        paidAt: paymentStatus === "paid" ? soldAt : null,
        soldAt,
        notes: input.notes ?? null,
      },
      lines,
    );

    // A sale is the strongest signal a lead can send — promote and mark customer.
    // Any status other than customer moves — including inactive: a shop that
    // just bought is not inactive.
    if (lead.status !== "customer") {
      await storage.updateSalesLead(lead.id, { status: "customer" });
    }

    res.status(201).json(sale);

    // Mirror into the CRM after responding — the rep should not wait on it, and
    // a failure is recorded in sales_sync_events with the retry path already in
    // place on the dashboard.
    syncSaleToXphere(sale.sale.id).catch((err) => console.error("[sale] xphere mirror:", err));
  });

  router.patch("/sales/:id/payment", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const existing = await salesStorage.getSale(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Sale not found" });
    if (!isManagerOrAdmin(actor) && existing.sale.repId !== actor.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (existing.sale.status === "cancelled") {
      return res.status(400).json({ message: "Sale is cancelled" });
    }
    const input = xpotSalePaymentSchema.parse(req.body);
    const total = existing.sale.totalCents;
    const paidCents = input.paymentStatus === "paid"
      ? total
      : input.paymentStatus === "unpaid"
        ? 0
        : Math.min(input.paidCents ?? existing.sale.paidCents, total);
    const paymentStatus = input.paymentStatus ?? paymentStatusFor(paidCents, total);
    const updated = await salesStorage.updateSale(existing.sale.id, {
      paidCents,
      paymentStatus,
      paymentMethod: input.paymentMethod === undefined ? existing.sale.paymentMethod : input.paymentMethod,
      paidAt: paymentStatus === "paid" ? (existing.sale.paidAt ?? new Date()) : null,
    });
    res.json(await salesStorage.getSale(updated!.id));
  });

  // Cancel a direct sale. Settlement sales are tied to stock movements — they
  // are corrected with a consignment adjustment, not by cancelling the bill.
  router.post("/sales/:id/cancel", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const existing = await salesStorage.getSale(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Sale not found" });
    if (!isManagerOrAdmin(actor) && existing.sale.repId !== actor.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (existing.sale.status === "cancelled") return res.json(existing);
    if (existing.sale.kind === "consignment_settlement") {
      return res.status(400).json({ message: "Settlement sales cannot be cancelled. Record a stock adjustment on the consignment instead." });
    }
    const { reason } = xpotSaleCancelSchema.parse(req.body ?? {});
    await salesStorage.updateSale(existing.sale.id, {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelReason: reason ?? null,
    });
    res.json(await salesStorage.getSale(existing.sale.id));
  });

  return router;
}
