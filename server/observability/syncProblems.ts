import { inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { salesLeads, salesOpportunitiesLocal, salesReps, salesSales, salesTasks, salesVisits } from "#shared/schema.js";
import { RETRYABLE_SYNC_ENTITIES, type SyncProblem } from "#shared/system-health.js";

/**
 * Admin › Status › CRM sync: records whose latest attempt to reach Xphere (or
 * GoHighLevel, legacy) failed or needs review, with the company they are about
 * and a link to it. A record retried successfully drops off: only the newest
 * attempt per provider and record counts. The retry itself is POST
 * /api/xpot/sync/retry, the same one the Dashboard uses.
 */

export const SYNC_PROBLEMS_LIMIT = 50;

type LatestAttempt = {
  id: number;
  provider: string;
  entity_type: string;
  entity_id: string;
  status: SyncProblem["status"];
  last_error: string | null;
  attempt_count: number;
  at: Date | string | null;
};

type Subject = { name: string | null; leadId: number | null; repId: number | null };

/** Where a record opens: companies and what belongs to one (sale, task, opportunity) open on the company; a visit on its own page. */
export function syncProblemHref(entityType: string, entityId: string, subject: Subject | undefined): string | null {
  if (entityType === "sales_visit") return `/visits/${entityId}`;
  if (!subject) return null;
  if (entityType === "sales_lead") return `/leads/${entityId}`;
  return subject.leadId ? `/leads/${subject.leadId}` : null;
}

const ids = (rows: LatestAttempt[], type: string) =>
  rows.filter((row) => row.entity_type === type).map((row) => Number(row.entity_id)).filter((id) => Number.isInteger(id) && id > 0);

export async function listSyncProblems(limit = SYNC_PROBLEMS_LIMIT): Promise<SyncProblem[]> {
  const result = await db.execute(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (provider, entity_type, entity_id)
        id, provider, entity_type, entity_id, status, last_error, attempt_count,
        coalesce(last_attempt_at, created_at) AS at
      FROM sales_sync_events
      ORDER BY provider, entity_type, entity_id, id DESC
    ) latest
    WHERE status IN ('failed', 'needs_review')
    ORDER BY at DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `);
  const rows = ((result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as LatestAttempt[];
  if (!rows.length) return [];

  const [leads, visits, sales, tasks, opportunities] = await Promise.all([
    ids(rows, "sales_lead").length
      ? db.select({ id: salesLeads.id, name: salesLeads.name, repId: salesLeads.ownerRepId }).from(salesLeads).where(inArray(salesLeads.id, ids(rows, "sales_lead")))
      : [],
    ids(rows, "sales_visit").length
      ? db.select({ id: salesVisits.id, leadId: salesVisits.leadId, repId: salesVisits.repId, name: salesLeads.name })
        .from(salesVisits).leftJoin(salesLeads, sql`${salesLeads.id} = ${salesVisits.leadId}`).where(inArray(salesVisits.id, ids(rows, "sales_visit")))
      : [],
    ids(rows, "sales_sale").length
      ? db.select({ id: salesSales.id, leadId: salesSales.leadId, repId: salesSales.repId, name: salesLeads.name })
        .from(salesSales).leftJoin(salesLeads, sql`${salesLeads.id} = ${salesSales.leadId}`).where(inArray(salesSales.id, ids(rows, "sales_sale")))
      : [],
    ids(rows, "sales_task").length
      ? db.select({ id: salesTasks.id, leadId: salesTasks.leadId, repId: salesTasks.repId, name: salesTasks.title }).from(salesTasks).where(inArray(salesTasks.id, ids(rows, "sales_task")))
      : [],
    ids(rows, "sales_opportunity").length
      ? db.select({ id: salesOpportunitiesLocal.id, leadId: salesOpportunitiesLocal.leadId, repId: salesOpportunitiesLocal.repId, name: salesOpportunitiesLocal.title })
        .from(salesOpportunitiesLocal).where(inArray(salesOpportunitiesLocal.id, ids(rows, "sales_opportunity")))
      : [],
  ]);

  const subjects = new Map<string, Subject>();
  for (const lead of leads) subjects.set(`sales_lead:${lead.id}`, { name: lead.name, leadId: lead.id, repId: lead.repId ?? null });
  for (const visit of visits) subjects.set(`sales_visit:${visit.id}`, { name: visit.name ?? null, leadId: visit.leadId, repId: visit.repId });
  for (const sale of sales) subjects.set(`sales_sale:${sale.id}`, { name: sale.name ?? null, leadId: sale.leadId, repId: sale.repId });
  for (const task of tasks) subjects.set(`sales_task:${task.id}`, { name: task.name, leadId: task.leadId ?? null, repId: task.repId });
  for (const opp of opportunities) subjects.set(`sales_opportunity:${opp.id}`, { name: opp.name, leadId: opp.leadId, repId: opp.repId });

  const repIds = Array.from(new Set(Array.from(subjects.values()).flatMap((s) => (s.repId ? [s.repId] : []))));
  const reps = repIds.length
    ? await db.select({ id: salesReps.id, name: salesReps.displayName }).from(salesReps).where(inArray(salesReps.id, repIds))
    : [];
  const repName = new Map(reps.map((rep) => [rep.id, rep.name]));

  return rows.map((row) => {
    const subject = subjects.get(`${row.entity_type}:${row.entity_id}`);
    return {
      id: row.id,
      provider: row.provider,
      entityType: row.entity_type,
      entityId: String(row.entity_id),
      entityName: subject?.name ?? null,
      href: syncProblemHref(row.entity_type, String(row.entity_id), subject),
      repName: subject?.repId ? repName.get(subject.repId) ?? null : null,
      status: row.status,
      lastError: row.last_error,
      attemptCount: row.attempt_count,
      at: row.at ? new Date(row.at).toISOString() : null,
      retryable: RETRYABLE_SYNC_ENTITIES.includes(row.entity_type),
    };
  });
}
