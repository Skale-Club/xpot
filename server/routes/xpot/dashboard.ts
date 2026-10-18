import { Router } from "express";
import { storage } from "../../storage.js";
import { requireXpotUser, ensureXpotRep } from "./middleware.js";
import { isFinishedVisitStatus } from "#shared/visit-status.js";

function localDateKey(date: Date, timezoneOffset?: number) {
  if (timezoneOffset !== undefined) {
    const shifted = new Date(date.getTime() - timezoneOffset * 60_000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function visitDate(visit: { checkedInAt?: Date | string | null; scheduledAt?: Date | string | null; createdAt?: Date | string | null }) {
  const value = visit.checkedInAt ?? visit.scheduledAt ?? visit.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dueTime(task: { dueAt?: Date | string | null }) {
  if (!task.dueAt) return Number.POSITIVE_INFINITY;
  const value = new Date(task.dueAt).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function createDashboardRouter() {
  const router = Router();
  router.use(requireXpotUser);

  router.get("/dashboard", async (req, res) => {
    const actor = (req as any).xpotActor as Awaited<ReturnType<typeof ensureXpotRep>>;
    const requestedOffset = typeof req.query.timezoneOffset === "string" ? Number(req.query.timezoneOffset) : NaN;
    const timezoneOffset = Number.isFinite(requestedOffset) && Math.abs(requestedOffset) <= 14 * 60 ? requestedOffset : undefined;
    const [visits, opportunities, tasks, leads] = await Promise.all([
      storage.listSalesVisits({ repId: actor!.rep.id }),
      storage.listSalesOpportunities({ repId: actor!.rep.id }),
      storage.listSalesTasks({ repId: actor!.rep.id }),
      storage.listSalesLeads({ ownerRepId: actor!.rep.id }),
    ]);

    const activeVisit = visits.find((visit) => visit.status === "in_progress") || null;
    const completedVisits = visits.filter((visit) => isFinishedVisitStatus(visit.status));
    const openOpportunities = opportunities.filter((item) => item.status === "open");
    const pendingTasks = tasks
      .filter((item) => item.status === "pending" || item.status === "in_progress")
      .sort((a, b) => dueTime(a) - dueTime(b));
    const todayKey = localDateKey(new Date(), timezoneOffset);
    const now = new Date();
    const shiftedNow = timezoneOffset === undefined ? now : new Date(now.getTime() - timezoneOffset * 60_000);
    const startOfToday = timezoneOffset === undefined
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()) + timezoneOffset * 60_000;
    const startOfTomorrow = startOfToday + 86_400_000;
    const overdueTasks = pendingTasks.filter((item) => dueTime(item) < startOfToday);
    const tasksToday = pendingTasks.filter((item) => {
      const due = dueTime(item);
      return due >= startOfToday && due < startOfTomorrow;
    });
    const todayVisits = visits.filter((visit) => {
      const date = visitDate(visit);
      return date ? localDateKey(date, timezoneOffset) === todayKey : false;
    });
    const visitActivity = new Map<string, { visits: number; completed: number }>();

    for (const visit of visits) {
      const date = visitDate(visit);
      if (!date) continue;
      const key = localDateKey(date, timezoneOffset);
      const daily = visitActivity.get(key) ?? { visits: 0, completed: 0 };
      daily.visits += 1;
      if (isFinishedVisitStatus(visit.status)) daily.completed += 1;
      visitActivity.set(key, daily);
    }

    const visitActivityDaily = Array.from({ length: 60 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (59 - index));
      const key = localDateKey(date, timezoneOffset);
      return { date: key, ...(visitActivity.get(key) ?? { visits: 0, completed: 0 }) };
    });

    res.json({
      metrics: {
        visitsToday: todayVisits.length,
        completedVisitsToday: todayVisits.filter((visit) => isFinishedVisitStatus(visit.status)).length,
        remainingVisitsToday: todayVisits.filter((visit) => visit.status === "planned" || visit.status === "in_progress").length,
        completedVisits: completedVisits.length,
        activeVisit,
        openOpportunities: openOpportunities.length,
        pipelineValue: openOpportunities.reduce((sum, item) => sum + (item.value || 0), 0),
        pendingTasks: pendingTasks.length,
        tasksToday: tasksToday.length,
        overdueTasks: overdueTasks.length,
        assignedLeads: leads.length,
      },
      visitActivityDaily,
      recentVisits: await Promise.all(completedVisits
        .sort((a, b) => new Date(b.checkedOutAt ?? b.checkedInAt ?? b.createdAt ?? 0).getTime() - new Date(a.checkedOutAt ?? a.checkedInAt ?? a.createdAt ?? 0).getTime())
        .slice(0, 4)
        .map(async (visit) => ({
        ...visit,
        lead: await storage.getSalesLead(visit.leadId),
        note: await storage.getSalesVisitNote(visit.id),
      }))),
      openOpportunities: await Promise.all(openOpportunities.slice(0, 5).map(async (item) => ({
        ...item,
        lead: await storage.getSalesLead(item.leadId),
      }))),
      pendingTasks: pendingTasks.slice(0, 5),
      tasksToday: tasksToday.slice(0, 6).map((task) => ({
        ...task,
        lead: task.leadId ? leads.find((lead) => lead.id === task.leadId) ?? null : null,
      })),
      overdueTasks: overdueTasks.slice(0, 4).map((task) => ({
        ...task,
        lead: task.leadId ? leads.find((lead) => lead.id === task.leadId) ?? null : null,
      })),
    });
  });

  return router;
}
