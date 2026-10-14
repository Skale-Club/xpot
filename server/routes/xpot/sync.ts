import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep, isManagerOrAdmin, listsEveryone } from "./middleware.js";
import { syncLeadToGhl, syncLeadToXphere, syncOpportunityToGhl, syncTaskToGhl, syncVisitToGhl } from "./helpers.js";
import { syncSaleToXphere, syncTaskToXphere } from "./xphere-sync.js";
import { salesStorage } from "../../storage-sales.js";

const SYNC_BATCH_SIZE = 200;
const SYNC_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export function createSyncRouter() {
  const router = Router();
  router.use(requireXpotUser);

  // POST /sync/flush — rep syncs own data only; manager/admin can sync all
  router.post("/sync/flush", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const repId = actor!.rep.id;
    const canSyncAll = listsEveryone(req, actor!);

    const allLeads = await storage.listSalesLeads(canSyncAll
      ? { limit: SYNC_BATCH_SIZE }
      : { ownerRepId: repId, limit: SYNC_BATCH_SIZE });
    const allOpportunities = await storage.listSalesOpportunities(canSyncAll
      ? { limit: SYNC_BATCH_SIZE }
      : { repId, limit: SYNC_BATCH_SIZE });
    const allTasks = await storage.listSalesTasks(canSyncAll
      ? { limit: SYNC_BATCH_SIZE }
      : { repId, limit: SYNC_BATCH_SIZE });

    // Never sync prospects
    const leadsToSync = allLeads.filter((l) => !l.ghlContactId && l.status !== "prospect").slice(0, SYNC_BATCH_SIZE);
    const oppsToSync = allOpportunities.filter((o) => o.syncStatus !== "synced").slice(0, SYNC_BATCH_SIZE);
    const visibleTasks = allTasks.slice(0, SYNC_BATCH_SIZE);
    const tasksToSync = allTasks.filter((t) => !t.ghlTaskId && t.status === "pending").slice(0, SYNC_BATCH_SIZE);

    const [leadResults, oppResults, taskResults, xphereTaskResults] = await Promise.all([
      mapWithConcurrency(leadsToSync, (lead) => syncLeadToGhl(lead.id)),
      mapWithConcurrency(oppsToSync, (opportunity) => syncOpportunityToGhl(opportunity.id)),
      mapWithConcurrency(tasksToSync, (task) => syncTaskToGhl(task.id)),
      mapWithConcurrency(visibleTasks, (task) => syncTaskToXphere(task.id)),
    ]);

    res.json({
      leadsProcessed: leadResults.length,
      leadsSynced: leadResults.filter((r) => r.synced).length,
      opportunitiesProcessed: oppResults.length,
      opportunitiesSynced: oppResults.filter((r) => r.synced).length,
      tasksProcessed: taskResults.length,
      tasksSynced: taskResults.filter((r) => r.synced).length,
      xphereTasksProcessed: xphereTaskResults.length,
      xphereTasksSynced: xphereTaskResults.filter((r) => r.synced).length,
    });
  });

  // GET /sync/status — recent sync events for the acting rep (manager sees all)
  router.get("/sync/status", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const events = listsEveryone(req, actor!)
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
        // A lead goes to Xphere when it is created and to GHL on a flush, and a
        // failure of either is logged as "sales_lead": retry whichever hasn't landed.
        const results: { synced: boolean; message?: string }[] = [];
        if (!lead.xphereRef) results.push(await syncLeadToXphere(lead.id));
        if (!lead.ghlContactId && lead.status !== "prospect") results.push(await syncLeadToGhl(lead.id));
        return res.json({ synced: results.every((r) => r.synced), results });
      }
      case "sales_sale": {
        // Sales reach the CRM through the Xphere mirror; a failure lands in
        // sales_sync_events like any other and the dashboard offers a retry.
        const sale = await salesStorage.getSale(Number(entityId));
        if (!sale || (!isManagerOrAdmin(actor!) && sale.sale.repId !== actor!.rep.id)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const result = await syncSaleToXphere(Number(entityId));
        return res.json(result);
      }
      case "sales_task": {
        const task = await storage.getSalesTask(Number(entityId));
        if (!task || (!isManagerOrAdmin(actor!) && task.repId !== actor!.rep.id)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const [ghl, xphere] = await Promise.all([syncTaskToGhl(task.id), syncTaskToXphere(task.id)]);
        return res.json({ synced: ghl.synced || xphere.synced, results: { ghl, xphere } });
      }
      default:
        return res.status(400).json({ message: `Unsupported entityType: ${entityType}` });
    }
  });

  return router;
}
