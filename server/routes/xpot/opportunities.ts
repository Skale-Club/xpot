import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";
import { syncOpportunityToGhl } from "./helpers.js";
import { xpotOpportunityCreateSchema, xpotOpportunityUpdateSchema } from "#shared/xpot.js";
import { getGHLPipelines } from "../../integrations/ghl.js";

export function createOpportunitiesRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/opportunities/pipelines", async (_req, res) => {
    const integration = await storage.getIntegrationSettings("gohighlevel");
    console.log("[pipelines] integration:", JSON.stringify({ isEnabled: integration?.isEnabled, hasKey: !!integration?.apiKey, hasLocation: !!integration?.locationId }));
    if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
      return res.json({ pipelines: [], _reason: !integration ? "not found" : !integration.isEnabled ? "disabled" : !integration.apiKey ? "no apiKey" : "no locationId" });
    }
    const result = await getGHLPipelines(integration.apiKey, integration.locationId);
    console.log("[pipelines] GHL result:", JSON.stringify({ success: result.success, count: result.pipelines?.length, message: result.message }));
    res.json({ pipelines: result.pipelines ?? [], _error: result.success ? undefined : result.message });
  });

  router.get("/opportunities", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const status = typeof req.query.status === "string"
      ? z.enum(["open", "won", "lost", "archived"]).parse(req.query.status)
      : undefined;
    const opportunities = await storage.listSalesOpportunities({
      repId: actor!.user.isAdmin && req.query.all === "true" ? undefined : actor!.rep.id,
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
      opportunity: (await storage.listSalesOpportunities()).find((item) => item.id === opportunity.id),
      ghl: syncResult,
      message: syncMessage,
    });
  });

  router.patch("/opportunities/:id", async (req, res) => {
    const opportunityId = Number(req.params.id);
    const input = xpotOpportunityUpdateSchema.parse(req.body);
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
      opportunity: (await storage.listSalesOpportunities()).find((item) => item.id === opportunityId),
      ghl: syncResult,
    });
  });

  return router;
}
