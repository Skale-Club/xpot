import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";

export function createMetricsRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/metrics", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [visits, opportunities, tasks] = await Promise.all([
      storage.listSalesVisits({ repId: actor!.rep.id }),
      storage.listSalesOpportunities({ repId: actor!.rep.id }),
      storage.listSalesTasks({ repId: actor!.rep.id }),
    ]);

    const visitsByDay: Record<string, { completed: number; total: number }> = {};
    const opportunitiesByDay: Record<string, { created: number; won: number; value: number }> = {};
    const tasksByDay: Record<string, { created: number; completed: number }> = {};

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      visitsByDay[dateKey] = { completed: 0, total: 0 };
      opportunitiesByDay[dateKey] = { created: 0, won: 0, value: 0 };
      tasksByDay[dateKey] = { created: 0, completed: 0 };
    }

    visits.forEach((visit) => {
      if (!visit.createdAt) return;
      const dateKey = new Date(visit.createdAt).toISOString().split("T")[0];
      if (visitsByDay[dateKey]) {
        visitsByDay[dateKey].total++;
        if (visit.status === "completed") {
          visitsByDay[dateKey].completed++;
        }
      }
    });

    opportunities.forEach((opp) => {
      if (!opp.createdAt) return;
      const dateKey = new Date(opp.createdAt).toISOString().split("T")[0];
      if (opportunitiesByDay[dateKey]) {
        opportunitiesByDay[dateKey].created++;
        if (opp.status === "won") {
          opportunitiesByDay[dateKey].won++;
          opportunitiesByDay[dateKey].value += opp.value || 0;
        }
      }
    });

    tasks.forEach((task) => {
      if (!task.createdAt) return;
      const dateKey = new Date(task.createdAt).toISOString().split("T")[0];
      if (tasksByDay[dateKey]) {
        tasksByDay[dateKey].created++;
        if (task.status === "completed") {
          tasksByDay[dateKey].completed++;
        }
      }
    });

    const totalVisits = Object.values(visitsByDay).reduce((sum, d) => sum + d.completed, 0);
    const totalOpportunities = Object.values(opportunitiesByDay).reduce((sum, d) => sum + d.won, 0);
    const totalPipeline = Object.values(opportunitiesByDay).reduce((sum, d) => sum + d.value, 0);
    const totalTasks = Object.values(tasksByDay).reduce((sum, d) => sum + d.completed, 0);

    res.json({
      period: { days, startDate: startDate.toISOString(), endDate: new Date().toISOString() },
      visits: visitsByDay,
      opportunities: opportunitiesByDay,
      tasks: tasksByDay,
      totals: {
        visits: totalVisits,
        opportunities: totalOpportunities,
        pipelineValue: totalPipeline,
        tasksCompleted: totalTasks,
      },
    });
  });

  return router;
}
