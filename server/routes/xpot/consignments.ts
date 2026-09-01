import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { salesStorage } from "../../storage-sales.js";
import { requireXpotUser, isManagerOrAdmin, loadAccessibleLead, type XpotActor } from "./middleware.js";
import {
  xpotConsignmentDepositSchema,
  xpotConsignmentSettleSchema,
  xpotConsignmentReturnSchema,
  xpotConsignmentAdjustSchema,
  xpotConsignmentUpdateSchema,
} from "#shared/xpot.js";
import { computeSettlement } from "#shared/pricing.js";

// Consigned stock: physical goods left at an establishment, resold by them, and
// settled when the rep comes back. Every stock change is a ledger movement.
export function createConsignmentsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  async function loadOwnConsignment(req: any, res: any, id: number) {
    const actor = req.xpotActor as XpotActor;
    const row = await salesStorage.getConsignment(id);
    if (!row) {
      res.status(404).json({ message: "Consignment not found" });
      return null;
    }
    if (!isManagerOrAdmin(actor) && row.consignment.repId !== actor.rep.id) {
      res.status(403).json({ message: "Access denied" });
      return null;
    }
    return row;
  }

  async function assertVisitForLead(res: any, visitId: number | null | undefined, leadId: number): Promise<boolean> {
    if (!visitId) return true;
    const visit = await storage.getSalesVisit(visitId);
    if (!visit || visit.leadId !== leadId) {
      res.status(400).json({ message: "Visit does not belong to this lead" });
      return false;
    }
    return true;
  }

  const listQuerySchema = z.object({
    leadId: z.coerce.number().int().positive().optional(),
    repId: z.coerce.number().int().positive().optional(),
    status: z.enum(["active", "closed"]).optional(),
  });

  router.get("/consignments", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const q = listQuerySchema.parse(req.query);
    const repId = isManagerOrAdmin(actor) ? q.repId : actor.rep.id;
    res.json(await salesStorage.listConsignments({ repId, leadId: q.leadId, status: q.status }));
  });

  router.get("/consignments/:id", async (req, res) => {
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const movements = await salesStorage.listMovements(row.consignment.id);
    res.json({ ...row, movements });
  });

  // POST /consignments/deposit — leave stock at a lead. Opens the agreement on
  // first deposit; later deposits top it up.
  router.post("/consignments/deposit", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const input = xpotConsignmentDepositSchema.parse(req.body);
    const lead = await loadAccessibleLead(req, res, input.leadId);
    if (!lead) return;
    if (!(await assertVisitForLead(res, input.visitId, lead.id))) return;

    const priced = await salesStorage.priceProduct(input.productId, input.quantity);
    if (!priced) return res.status(404).json({ message: "Product not found" });
    if (!priced.product.isActive) return res.status(400).json({ message: `${priced.product.name} is no longer sold` });
    if (!priced.product.consignable) {
      return res.status(400).json({ message: `${priced.product.name} is not set up for consignment. Enable it in Admin › Products.` });
    }

    const result = await salesStorage.runDeposit({
      leadId: lead.id,
      productId: priced.product.id,
      repId: actor.rep.id,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents ?? priced.unitPriceCents,
      currency: priced.product.currency,
      settlementIntervalDays: input.settlementIntervalDays,
      visitId: input.visitId ?? null,
      notes: input.notes ?? null,
    });

    if (lead.status === "prospect") {
      await storage.updateSalesLead(lead.id, { status: "lead" });
    }

    res.status(201).json({ ...(await salesStorage.getConsignment(result.consignment.id)), movement: result.movement, opened: result.opened });
  });

  // GET /consignments/:id/settle/preview?countedRemaining=N[&restockQuantity=M][&unitPriceCents=P]
  // Same arithmetic the settle call will apply — for the dialog to show live.
  router.get("/consignments/:id/settle/preview", async (req, res) => {
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const counted = Math.max(0, Number(req.query.countedRemaining) || 0);
    const restock = Math.max(0, Number(req.query.restockQuantity) || 0);
    const unitPriceCents = req.query.unitPriceCents ? Number(req.query.unitPriceCents) : row.consignment.unitPriceCents;
    const product = await salesStorage.getProduct(row.consignment.productId);
    res.json(computeSettlement({
      onHand: row.consignment.quantityOnHand,
      countedRemaining: counted,
      unitPriceCents,
      unitCostCents: product?.costCents ?? 0,
      restockQuantity: restock,
    }));
  });

  // POST /consignments/:id/settle — the "acerto": count, bill, restock.
  router.post("/consignments/:id/settle", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const input = xpotConsignmentSettleSchema.parse(req.body);
    if (!(await assertVisitForLead(res, input.visitId, row.consignment.leadId))) return;

    try {
      const result = await salesStorage.runSettlement({
        consignmentId: row.consignment.id,
        repId: actor.rep.id,
        countedRemaining: input.countedRemaining,
        restockQuantity: input.restockQuantity,
        unitPriceCents: input.unitPriceCents,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod ?? null,
        paidCents: input.paidCents,
        visitId: input.visitId ?? null,
        notes: input.notes ?? null,
      });
      if (result.soldQuantity > 0) {
        const lead = await storage.getSalesLead(row.consignment.leadId);
        if (lead && lead.status !== "customer") await storage.updateSalesLead(lead.id, { status: "customer" });
      }
      res.json({
        ...(await salesStorage.getConsignment(row.consignment.id)),
        settlement: result.settlement,
        restock: result.restock,
        sale: result.sale,
        soldQuantity: result.soldQuantity,
        amountCents: result.amountCents,
      });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  router.post("/consignments/:id/return", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const input = xpotConsignmentReturnSchema.parse(req.body);
    if (!(await assertVisitForLead(res, input.visitId, row.consignment.leadId))) return;
    try {
      const result = await salesStorage.runReturn({
        consignmentId: row.consignment.id,
        repId: actor.rep.id,
        quantity: input.quantity,
        close: input.close,
        visitId: input.visitId ?? null,
        notes: input.notes ?? null,
      });
      res.json({ ...(await salesStorage.getConsignment(row.consignment.id)), movement: result.movement });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  router.post("/consignments/:id/adjust", async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const input = xpotConsignmentAdjustSchema.parse(req.body);
    try {
      const result = await salesStorage.runAdjustment({
        consignmentId: row.consignment.id,
        repId: actor.rep.id,
        delta: input.delta,
        visitId: input.visitId ?? null,
        notes: input.notes ?? null,
      });
      res.json({ ...(await salesStorage.getConsignment(row.consignment.id)), movement: result.movement });
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  router.post("/consignments/:id/close", async (req, res) => {
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    if (row.consignment.quantityOnHand > 0) {
      return res.status(400).json({ message: `${row.consignment.quantityOnHand} units still on record. Return or settle them first.` });
    }
    await salesStorage.closeConsignment(row.consignment.id);
    res.json(await salesStorage.getConsignment(row.consignment.id));
  });

  router.patch("/consignments/:id", async (req, res) => {
    const row = await loadOwnConsignment(req, res, Number(req.params.id));
    if (!row) return;
    const input = xpotConsignmentUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (input.unitPriceCents !== undefined) patch.unitPriceCents = input.unitPriceCents;
    if (input.settlementIntervalDays !== undefined) patch.settlementIntervalDays = input.settlementIntervalDays;
    if (input.nextVisitDueAt !== undefined) patch.nextVisitDueAt = input.nextVisitDueAt ? new Date(input.nextVisitDueAt) : null;
    if (input.notes !== undefined) patch.notes = input.notes;
    await salesStorage.updateConsignment(row.consignment.id, patch);
    res.json(await salesStorage.getConsignment(row.consignment.id));
  });

  return router;
}
