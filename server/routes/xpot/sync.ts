import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin } from "./middleware.js";
import { syncLeadToGhl, syncOpportunityToGhl, syncTaskToGhl, syncVisitToGhl } from "./helpers.js";

export function createSyncRouter() {
  const router = Router();
  router.use(requireXpotUser);

  // POST /sync/flush — rep syncs own data only; manager/admin can sync all
  router.post("/sync/flush", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const repId = actor!.rep.id;
    const canSyncAll = isManagerOrAdmin(actor!);

    const allLeads = await storage.listSalesLeads(canSyncAll ? {} : { ownerRepId: repId });
    const allOpportunities = await storage.listSalesOpportunities();
    const allTasks = await storage.listSalesTasks();

    // Never sync prospects
    const leadsToSync = allLeads.filter((l) => !l.ghlContactId && l.status !== "prospect");
    const oppsToSync = canSyncAll
      ? allOpportunities.filter((o) => o.syncStatus !== "synced")
      : allOpportunities.filter((o) => o.syncStatus !== "synced" && o.repId === repId);
    const tasksToSync = canSyncAll
      ? allTasks.filter((t) => !t.ghlTaskId && t.status === "pending")
      : allTasks.filter((t) => !t.ghlTaskId && t.status === "pending" && t.repId === repId);

    const [leadResults, oppResults, taskResults] = await Promise.all([
      Promise.all(leadsToSync.map((l) => syncLeadToGhl(l.id))),
      Promise.all(oppsToSync.map((o) => syncOpportunityToGhl(o.id))),
      Promise.all(tasksToSync.map((t) => syncTaskToGhl(t.id))),
    ]);

    res.json({
      leadsProcessed: leadResults.length,
      leadsSynced: leadResults.filter((r) => r.synced).length,
      opportunitiesProcessed: oppResults.length,
      opportunitiesSynced: oppResults.filter((r) => r.synced).length,
      tasksProcessed: taskResults.length,
      tasksSynced: taskResults.filter((r) => r.synced).length,
    });
  });

  // GET /sync/status — recent sync events for the acting rep (manager sees all)
  router.get("/sync/status", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const events = isManagerOrAdmin(actor!)
      ? await storage.listSalesSyncEvents(limit)
      : await storage.listSalesSyncEventsForRep(actor!.rep.id, limit);
    const failedCount = events.filter((e) => e.status === "failed").length;
    res.json({ events, failedCount });
  });

  // POST /sync/retry — retry a failed entity by type + id
  router.post("/sync/retry", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const { entityType, entityId } = req.body as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) {
      return res.status(400).json({ message: "entityType and entityId are required" });
    }

    switch (entityType) {
      case "sales_visit": {
        const visit = await storage.getSalesVisit(Number(entityId));
        if (!visit || (!isManagerOrAdmin(actor!) && visit.repId !== actor!.rep.id)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const result = await syncVisitToGhl(Number(entityId));
        return res.json(result);
      }
      case "sales_lead": {
        const lead = await storage.getSalesLead(Number(entityId));
        if (!lead || (!isManagerOrAdmin(actor!) && lead.ownerRepId !== actor!.rep.id)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const result = await syncLeadToGhl(Number(entityId));
        return res.json(result);
      }
      default:
        return res.status(400).json({ message: `Unsupported entityType: ${entityType}` });
    }
  });

  return router;
}
