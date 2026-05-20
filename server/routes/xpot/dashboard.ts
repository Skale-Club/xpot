import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";

export function createDashboardRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/dashboard", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const [visits, opportunities, tasks, leads] = await Promise.all([
      storage.listSalesVisits({ repId: actor!.rep.id }),
      storage.listSalesOpportunities({ repId: actor!.rep.id }),
      storage.listSalesTasks({ repId: actor!.rep.id }),
      storage.listSalesLeads({ ownerRepId: actor!.rep.id }),
    ]);

    const activeVisit = visits.find((visit) => visit.status === "in_progress") || null;
    const completedVisits = visits.filter((visit) => visit.status === "completed");
    const openOpportunities = opportunities.filter((item) => item.status === "open");
    const pendingTasks = tasks.filter((item) => item.status === "pending");

    res.json({
      metrics: {
        visitsToday: visits.filter((visit) => {
          const createdAt = visit.createdAt ? new Date(visit.createdAt) : null;
          const today = new Date();
          return createdAt
            && createdAt.getFullYear() === today.getFullYear()
            && createdAt.getMonth() === today.getMonth()
            && createdAt.getDate() === today.getDate();
        }).length,
        completedVisits: completedVisits.length,
        activeVisit,
        openOpportunities: openOpportunities.length,
        pipelineValue: openOpportunities.reduce((sum, item) => sum + (item.value || 0), 0),
        pendingTasks: pendingTasks.length,
        assignedLeads: leads.length,
      },
      recentVisits: await Promise.all(visits.slice(0, 5).map(async (visit) => ({
        ...visit,
        lead: await storage.getSalesLead(visit.leadId),
        note: await storage.getSalesVisitNote(visit.id),
      }))),
      openOpportunities: await Promise.all(openOpportunities.slice(0, 5).map(async (item) => ({
        ...item,
        lead: await storage.getSalesLead(item.leadId),
      }))),
      pendingTasks: pendingTasks.slice(0, 5),
    });
  });

  return router;
}
