import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage.js";
import { requireXpotManager } from "./middleware.js";
import { getGHLPipelines } from "../../integrations/ghl.js";

export function createAdminRouter() {
  const router = Router();
  router.use(requireXpotManager);

  router.get("/admin/overview", async (_req, res) => {
    const [reps, leads, visits, opportunities, tasks, syncEvents] = await Promise.all([
      storage.listSalesReps(),
      storage.listSalesLeads(),
      storage.listSalesVisits(),
      storage.listSalesOpportunities(),
      storage.listSalesTasks(),
      storage.listSalesSyncEvents(),
    ]);
    const latestSyncByEntity = new Map<string, (typeof syncEvents)[number]>();
    for (const event of syncEvents) {
      const key = `${event.entityType}:${event.entityId}`;
      if (!latestSyncByEntity.has(key)) {
        latestSyncByEntity.set(key, event);
      }
    }

    res.json({
      reps,
      metrics: {
        activeReps: reps.filter((rep) => rep.isActive).length,
        leads: leads.length,
        visitsInProgress: visits.filter((visit) => visit.status === "in_progress").length,
        completedVisits: visits.filter((visit) => visit.status === "completed").length,
        openOpportunities: opportunities.filter((item) => item.status === "open").length,
        pipelineValue: opportunities.filter((item) => item.status === "open").reduce((sum, item) => sum + (item.value || 0), 0),
        pendingTasks: tasks.filter((item) => item.status === "pending").length,
        syncIssues: Array.from(latestSyncByEntity.values()).filter((item) => item.status !== "synced").length,
      },
      latestSyncEvents: syncEvents.slice(0, 10),
    });
  });

  router.get("/admin/reps", async (_req, res) => {
    res.json(await storage.listSalesReps());
  });

  router.post("/admin/reps", async (req, res) => {
    const input = z.object({
      userId: z.string().min(1),
      displayName: z.string().min(1),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      team: z.string().optional().nullable(),
      role: z.enum(["rep", "manager", "admin"]).default("rep"),
      vcardId: z.number().int().positive().optional().nullable(),
      ghlUserId: z.string().optional().nullable(),
      isActive: z.boolean().default(true),
    }).parse(req.body);

    const rep = await storage.upsertSalesRep(input);
    res.status(201).json(rep);
  });

  router.get("/admin/sync-events", async (_req, res) => {
    res.json(await storage.listSalesSyncEvents());
  });

  router.get("/admin/recent-visits", async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(25, Math.max(1, Number(req.query.pageSize) || 5));
    const repId = req.query.repId ? Number(req.query.repId) : undefined;
    if (repId !== undefined && (!Number.isInteger(repId) || repId <= 0)) {
      return res.status(400).json({ message: "repId must be a positive integer" });
    }
    const offset = (page - 1) * pageSize;
    const result = await storage.listRecentSalesVisits(pageSize, offset, { repId });
    res.json({ ...result, page, pageSize });
  });

  router.get("/admin/ghl/pipelines", async (_req, res) => {
    const integration = await storage.getIntegrationSettings("gohighlevel");
    if (!integration?.isEnabled || !integration.apiKey || !integration.locationId) {
      return res.status(400).json({ message: "GHL integration not configured" });
    }

    const result = await getGHLPipelines(integration.apiKey, integration.locationId);
    if (!result.success) {
      return res.status(502).json({ message: result.message || "Failed to fetch pipelines" });
    }

    res.json(result);
  });

  return router;
}
