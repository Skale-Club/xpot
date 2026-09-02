import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin } from "./middleware.js";
import { syncOpportunityToGhl } from "./helpers.js";
import { xpotOpportunityCreateSchema, xpotOpportunityUpdateSchema } from "#shared/xpot.js";
import { getGHLPipelines } from "../../integrations/ghl.js";

export function createOpportunitiesRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/opportunities/pipelines", async (_req, res) => {
    // SEG-10: this used to log whether a key/locationId was configured on every
    // call. It leaked configuration posture into production logs for no gain.
    const integration = await storage.getIntegrationSettings("gohighlevel");
    if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
      return res.json({ pipelines: [], _reason: !integration ? "not found" : !integration.isEnabled ? "disabled" : !integration.apiKey ? "no apiKey" : "no locationId" });
    }
    const result = await getGHLPipelines(integration.apiKey, integration.locationId);
    res.json({ pipelines: result.pipelines ?? [], _error: result.success ? undefined : result.message });
  });

  router.get("/opportunities", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const status = typeof req.query.status === "string"
      ? z.enum(["open", "won", "lost", "archived"]).parse(req.query.status)
      : undefined;
    const opportunities = await storage.listSalesOpportunities({
      // SEG-08: same "who sees everything" rule as leads/visits/tasks.
      repId: isManagerOrAdmin(actor!) && req.query.all === "true" ? undefined : actor!.rep.id,
      status,
    });

    const result = await Promise.all(opportunities.map(async (item) => ({
      ...item,
      lead: await storage.getSalesLead(item.leadId),
    })));
    res.json(result);
  });

  router.post("/opportunities", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const input = xpotOpportunityCreateSchema.parse(req.body);

    const opportunity = await storage.createSalesOpportunity({
      ...input,
      repId: actor!.rep.id,
      status: "open",
      syncStatus: "pending",
    });

    let syncMessage: string | null = null;
    const syncResult = await syncOpportunityToGhl(opportunity.id);
    if (!syncResult.synced) {
      syncMessage = syncResult.message || "Opportunity saved locally";
      await storage.updateSalesOpportunity(opportunity.id, { syncStatus: "needs_review" });
      await storage.createSalesSyncEvent({
        entityType: "sales_opportunity",
        entityId: String(opportunity.id),
        status: "needs_review",
        payload: { opportunityId: opportunity.id },
        lastError: syncMessage,
        lastAttemptAt: new Date(),
      });
    }

    res.status(201).json({
      opportunity: await storage.getSalesOpportunity(opportunity.id),
      ghl: syncResult,
      message: syncMessage,
    });
  });

  router.patch("/opportunities/:id", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const opportunityId = Number(req.params.id);
    if (!Number.isFinite(opportunityId) || opportunityId <= 0) {
      return res.status(400).json({ message: "Invalid opportunity id" });
    }
    const input = xpotOpportunityUpdateSchema.parse(req.body);

    // SEG-03: no ownership check here meant any rep could rewrite another
    // rep's deal — value, stage, status — and the handler then pushed that
    // unauthorised edit straight to GoHighLevel.
    const existing = await storage.getSalesOpportunity(opportunityId);
    if (!existing) {
      return res.status(404).json({ message: "Opportunity not found" });
    }
    if (!isManagerOrAdmin(actor!) && existing.repId !== actor!.rep.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updated = await storage.updateSalesOpportunity(opportunityId, {
      ...input,
      syncStatus: "pending",
    });

    if (!updated) {
      return res.status(404).json({ message: "Opportunity not found" });
    }

    const syncResult = await syncOpportunityToGhl(opportunityId);
    if (!syncResult.synced) {
      await storage.updateSalesOpportunity(opportunityId, { syncStatus: "needs_review" });
      await storage.createSalesSyncEvent({
        entityType: "sales_opportunity",
        entityId: String(opportunityId),
        status: "needs_review",
        payload: { opportunityId },
        lastError: syncResult.message,
        lastAttemptAt: new Date(),
      });
    }

    res.json({
      opportunity: await storage.getSalesOpportunity(opportunityId),
      ghl: syncResult,
    });
  });

  return router;
}
