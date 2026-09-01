import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import { salesStorage } from "../../storage-sales.js";
import { getLLMClient } from "../../lib/ai.js";
import { requireXpotUser, isManagerOrAdmin, type XpotActor } from "./middleware.js";
import { syncInterestToXphere } from "./xphere-sync.js";
import {
  salesVisitActions,
  type SalesVisitAction,
  type SalesVisitActionType,
} from "#shared/schema.js";
import {
  buildActionPrompt,
  describeAction,
  extractJson,
  parseActions,
  visitAnalysisSchema,
  type ActionContext,
  type VisitAction,
} from "#shared/visit-actions.js";

// Voice capture: the rep talks, the model proposes, the rep confirms.
//
// Nothing here writes stock or money directly. Applying an action calls the
// exact same salesStorage operation the manual dialogs call, so there is one
// code path for "I left 30 keychains" whether it was typed or spoken.

export function createVisitActionsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  async function loadVisit(req: any, res: any) {
    const visitId = Number(req.params.id);
    if (!Number.isFinite(visitId) || visitId <= 0) {
      res.status(400).json({ message: "Invalid visit id" });
      return null;
    }
    const actor = req.xpotActor as XpotActor;
    const visit = await storage.getSalesVisit(visitId);
    if (!visit) {
      res.status(404).json({ message: "Visit not found" });
      return null;
    }
    if (!isManagerOrAdmin(actor) && visit.repId !== actor.rep.id) {
      res.status(403).json({ message: "Access denied" });
      return null;
    }
    return visit;
  }

  // GET /visits/:id/actions
  router.get("/visits/:id/actions", async (req, res) => {
    const visit = await loadVisit(req, res);
    if (!visit) return;
    res.json(await listActions(visit.id));
  });

  // POST /visits/:id/analyze — step 2 of the audio pipeline.
  //
  // Upload+transcription (POST /visits/:id/audio) stays fast and separate; this
  // is the slow half. Splitting them is what keeps a five-minute recording from
  // spending the whole serverless budget in one request.
  router.post("/visits/:id/analyze", async (req, res) => {
    const visit = await loadVisit(req, res);
    if (!visit) return;
    const actor = (req as any).xpotActor as XpotActor;

    const note = await storage.getSalesVisitNote(visit.id);
    const transcript = (req.body?.transcript as string | undefined)?.trim() || note?.audioTranscription?.trim();
    if (!transcript) {
      return res.status(400).json({ message: "No transcription to analyse yet." });
    }

    const ai = await getLLMClient();
    if (!ai) {
      return res.status(503).json({ message: "No AI provider configured. Add one in Admin › Integrations." });
    }

    const lead = await storage.getSalesLead(visit.leadId);
    const [products, consignments, existing] = await Promise.all([
      salesStorage.listProducts(),
      salesStorage.listConsignments({ leadId: visit.leadId, status: "active" }),
      listActions(visit.id),
    ]);

    const context: ActionContext = {
      leadName: lead?.name ?? `Lead #${visit.leadId}`,
      products: products.map((p) => ({
        id: p.id, name: p.name, kind: p.kind, consignable: p.consignable,
        basePriceCents: p.basePriceCents, unitLabel: p.unitLabel,
      })),
      consignments: consignments.map((c) => ({
        id: c.consignment.id,
        productId: c.consignment.productId,
        productName: c.product?.name ?? `Product #${c.consignment.productId}`,
        quantityOnHand: c.consignment.quantityOnHand,
        unitPriceCents: c.consignment.unitPriceCents,
      })),
      // A rep who records twice must not get the same deposit twice.
      existing: existing
        .filter((a) => a.status === "proposed" || a.status === "applied")
        .map((a) => ({ type: a.type, summary: describeAction(a.payload as unknown as VisitAction) })),
    };

    let analysis;
    try {
      const completion = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: "user", content: buildActionPrompt(transcript, context) }],
        temperature: 0.1,
      });
      const parsed = visitAnalysisSchema.safeParse(extractJson(completion.choices[0]?.message?.content));
      if (!parsed.success) {
        return res.status(502).json({ message: "The AI reply could not be read. Try again." });
      }
      analysis = parsed.data;
    } catch (err) {
      console.error("[analyze] provider error:", err);
      return res.status(502).json({ message: "The AI provider did not respond." });
    }

    // Note fields — same shape the old single-step analysis wrote.
    await storage.upsertSalesVisitNote({
      visitId: visit.id,
      createdByRepId: actor.rep.id,
      audioTranscription: transcript,
      ...(analysis.summary ? { summary: analysis.summary } : {}),
      ...(analysis.outcome ? { outcome: analysis.outcome } : {}),
      ...(analysis.nextStep ? { nextStep: analysis.nextStep } : {}),
      ...(analysis.sentiment ? { sentiment: analysis.sentiment } : {}),
      ...(analysis.objections ? { objections: analysis.objections } : {}),
      ...(analysis.competitorMentioned ? { competitorMentioned: analysis.competitorMentioned } : {}),
      ...(analysis.followUpRequired !== undefined ? { followUpRequired: analysis.followUpRequired } : {}),
    });

    const actions = parseActions(analysis.actions);
    const created = actions.length
      ? await db.insert(salesVisitActions).values(actions.map((action) => ({
          visitId: visit.id,
          leadId: visit.leadId,
          repId: actor.rep.id,
          type: action.type as SalesVisitActionType,
          payload: action as unknown as Record<string, unknown>,
          evidence: action.evidence ?? null,
          confidence: action.confidence != null ? Math.round(action.confidence * 100) : null,
        }))).returning()
      : [];

    res.json({
      analysis: { ...analysis, actions: undefined },
      visitStatus: analysis.visitStatus ?? null,
      actions: created,
      // How many the model produced but the contract rejected — worth knowing.
      dropped: analysis.actions.length - actions.length,
    });
  });

  // PATCH /visits/:id/actions/:actionId — edit the proposal or discard it.
  router.patch("/visits/:id/actions/:actionId", async (req, res) => {
    const visit = await loadVisit(req, res);
    if (!visit) return;
    const input = z.object({
      payload: z.record(z.string(), z.unknown()).optional(),
      status: z.enum(["proposed", "dismissed"]).optional(),
    }).parse(req.body);

    const [action] = await db
      .select().from(salesVisitActions)
      .where(and(eq(salesVisitActions.id, Number(req.params.actionId)), eq(salesVisitActions.visitId, visit.id)));
    if (!action) return res.status(404).json({ message: "Action not found" });
    if (action.status === "applied") {
      return res.status(400).json({ message: "This action was already applied." });
    }

    const [updated] = await db
      .update(salesVisitActions)
      .set({
        ...(input.payload ? { payload: { ...action.payload, ...input.payload } } : {}),
        ...(input.status ? { status: input.status } : {}),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(salesVisitActions.id, action.id))
      .returning();
    res.json(updated);
  });

  // POST /visits/:id/actions/apply — the confirmation step.
  //
  // Actions run in the order they were proposed, and each one sees the state
  // the previous left behind: a deposit followed by a settlement in the same
  // recording has to settle against the stock the deposit just added.
  router.post("/visits/:id/actions/apply", async (req, res) => {
    const visit = await loadVisit(req, res);
    if (!visit) return;
    const actor = (req as any).xpotActor as XpotActor;
    const input = z.object({ actionIds: z.array(z.number().int().positive()).optional() }).parse(req.body ?? {});

    const conditions = [eq(salesVisitActions.visitId, visit.id), eq(salesVisitActions.status, "proposed")];
    if (input.actionIds?.length) conditions.push(inArray(salesVisitActions.id, input.actionIds));
    const pending = await db
      .select().from(salesVisitActions)
      .where(and(...conditions))
      .orderBy(asc(salesVisitActions.id));

    const results: { id: number; ok: boolean; resultRef?: string; error?: string }[] = [];
    for (const action of pending) {
      try {
        const resultRef = await applyAction(action, { repId: actor.rep.id, visitId: visit.id, leadId: visit.leadId });
        await db.update(salesVisitActions)
          .set({ status: "applied", resultRef, error: null, appliedAt: new Date(), updatedAt: new Date() })
          .where(eq(salesVisitActions.id, action.id));
        results.push({ id: action.id, ok: true, resultRef });
      } catch (err) {
        const message = (err as Error).message || "Could not apply";
        // A failure is recorded on its own row and does not stop the others —
        // one bad line must not cost the rep the rest of the visit.
        await db.update(salesVisitActions)
          .set({ status: "failed", error: message, updatedAt: new Date() })
          .where(eq(salesVisitActions.id, action.id));
        results.push({ id: action.id, ok: false, error: message });
      }
    }

    res.json({
      applied: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      actions: await listActions(visit.id),
    });
  });

  return router;
}

async function listActions(visitId: number): Promise<SalesVisitAction[]> {
  return await db
    .select().from(salesVisitActions)
    .where(eq(salesVisitActions.visitId, visitId))
    .orderBy(asc(salesVisitActions.id));
}

type ApplyCtx = { repId: number; visitId: number; leadId: number };

/**
 * Execute one confirmed action through the ordinary sales operations. Nothing
 * here reimplements stock or billing logic — it resolves what the rep meant
 * into the arguments those operations already take.
 */
async function applyAction(row: SalesVisitAction, ctx: ApplyCtx): Promise<string> {
  const action = row.payload as unknown as VisitAction;

  switch (action.type) {
    case "deposit": {
      const productId = action.productId ?? (await resolveProduct(action.productName, true));
      if (!productId) throw new Error(`No consignable product matches "${action.productName ?? "?"}". Pick one and try again.`);
      const priced = await salesStorage.priceProduct(productId, action.quantity);
      if (!priced) throw new Error("Product not found");
      if (!priced.product.consignable) throw new Error(`${priced.product.name} is not set up for consignment.`);
      const result = await salesStorage.runDeposit({
        leadId: ctx.leadId,
        productId,
        repId: ctx.repId,
        quantity: action.quantity,
        unitPriceCents: action.unitPriceCents ?? priced.unitPriceCents,
        currency: priced.product.currency,
        visitId: ctx.visitId,
        notes: action.evidence ?? null,
      });
      return `consignment:${result.consignment.id}`;
    }

    case "settlement": {
      // Read the agreement now, not when the audio was recorded: an earlier
      // action in this same batch may have just changed the stock.
      const consignment = action.consignmentId
        ? (await salesStorage.getConsignment(action.consignmentId))?.consignment
        : await resolveConsignment(ctx.leadId, action.productId ?? (await resolveProduct(action.productName, true)));
      if (!consignment) throw new Error("No open consignment to settle here.");
      if (consignment.status !== "active") throw new Error("That consignment is already closed.");

      // "He sold ten" and "four are left" are the same fact stated two ways.
      const countedRemaining = action.countedRemaining != null
        ? action.countedRemaining
        : consignment.quantityOnHand - (action.soldQuantity ?? 0);
      if (countedRemaining < 0) {
        throw new Error(`Only ${consignment.quantityOnHand} on record, but the note says ${action.soldQuantity} sold.`);
      }

      const result = await salesStorage.runSettlement({
        consignmentId: consignment.id,
        repId: ctx.repId,
        countedRemaining,
        restockQuantity: action.restockQuantity ?? undefined,
        paymentStatus: action.paid === true ? "paid" : action.paid === false ? "unpaid" : undefined,
        visitId: ctx.visitId,
        notes: action.evidence ?? null,
      });
      return result.sale ? `sale:${result.sale.sale.id}` : `consignment:${result.consignment.id}`;
    }

    case "sale": {
      const lines = [];
      let currency = "USD";
      for (const item of action.items) {
        const productId = item.productId ?? (await resolveProduct(item.description, false));
        let unitPriceCents = item.unitPriceCents ?? undefined;
        let unitCostCents = 0;
        let description = item.description;
        if (productId) {
          const priced = await salesStorage.priceProduct(productId, item.quantity ?? 1);
          if (priced) {
            unitPriceCents = unitPriceCents ?? priced.unitPriceCents;
            unitCostCents = priced.unitCostCents;
            description = priced.product.name;
            currency = priced.product.currency;
          }
        }
        if (unitPriceCents == null) {
          throw new Error(`No price for "${item.description}". Add it and apply again.`);
        }
        lines.push({
          productId: productId ?? null,
          description,
          quantity: item.quantity ?? 1,
          unitPriceCents,
          unitCostCents,
          totalCents: (item.quantity ?? 1) * unitPriceCents,
        });
      }
      const total = lines.reduce((sum, l) => sum + l.totalCents, 0);
      const paid = action.paid !== false;
      const sale = await salesStorage.createDirectSale(
        {
          leadId: ctx.leadId,
          repId: ctx.repId,
          visitId: ctx.visitId,
          kind: "direct",
          status: "completed",
          currency,
          subtotalCents: total,
          discountCents: 0,
          totalCents: total,
          paymentStatus: paid ? "paid" : "unpaid",
          paidCents: paid ? total : 0,
          paidAt: paid ? new Date() : null,
          soldAt: new Date(),
          notes: action.evidence ?? null,
        },
        lines,
      );
      const lead = await storage.getSalesLead(ctx.leadId);
      if (lead && lead.status !== "customer") await storage.updateSalesLead(ctx.leadId, { status: "customer" });
      return `sale:${sale.sale.id}`;
    }

    case "follow_up": {
      const dueAt = action.inDays != null
        ? new Date(Date.now() + action.inDays * 24 * 60 * 60 * 1000)
        : null;
      const task = await storage.createSalesTask({
        leadId: ctx.leadId,
        visitId: ctx.visitId,
        repId: ctx.repId,
        type: "follow_up",
        title: action.title,
        description: action.interest ? `Interested in: ${action.interest}` : action.evidence ?? null,
        dueAt,
        status: "pending",
      });
      if (dueAt) await storage.updateSalesLead(ctx.leadId, { nextVisitDueAt: dueAt });

      // Interest belongs in the CRM pipeline, not only in Xpot's task list.
      syncInterestToXphere({
        leadId: ctx.leadId,
        title: action.title,
        interest: action.interest ?? null,
        estimatedValueCents: action.estimatedValueCents ?? null,
        dueAt,
        evidence: action.evidence ?? null,
      }).catch((err: unknown) => console.error("[follow-up] xphere mirror:", err));

      return `task:${task.id}`;
    }
  }
}

/** Best-effort catalog match on a spoken name. Exact, then containment. */
async function resolveProduct(name: string | null | undefined, consignableOnly: boolean): Promise<number | null> {
  const needle = name?.trim().toLowerCase();
  if (!needle) return null;
  const products = (await salesStorage.listProducts()).filter((p) => !consignableOnly || p.consignable);
  const exact = products.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = products.filter((p) => {
    const n = p.name.toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
  // Two plausible matches is ambiguity, not a match — let the rep choose.
  return partial.length === 1 ? partial[0].id : null;
}

async function resolveConsignment(leadId: number, productId: number | null) {
  if (!productId) {
    const active = await salesStorage.listConsignments({ leadId, status: "active" });
    return active.length === 1 ? active[0].consignment : undefined;
  }
  return await salesStorage.getActiveConsignment(leadId, productId);
}
