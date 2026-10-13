import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  organizationMemberships,
  salesLeads,
  salesOpportunitiesLocal,
  salesReps,
  salesTasks,
  type SalesTask,
  type SalesTaskStatus,
} from "#shared/schema.js";
import type { XpotTaskCreateInput, XpotTaskUpdateInput } from "#shared/xpot.js";
import {
  activeOrganizationIds,
  canManageOrganizationForActor,
  canViewOrganizationForActor,
  managedOrganizationIds,
  organizationIdForRep,
} from "../organizations/service.js";
import { isManagerOrAdmin, type XpotActor } from "../routes/xpot/middleware.js";
import { syncTaskToGhl } from "../routes/xpot/helpers.js";
import { syncTaskToXphere } from "../routes/xpot/xphere-sync.js";

export type TaskSource = "manual" | "voice" | "mcp" | "automation" | "integration";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type EnrichedTask = SalesTask & {
  lead: { id: number; name: string } | null;
  assignee: { id: number; displayName: string; email: string | null } | null;
  opportunity: { id: number; title: string } | null;
};

export class TaskServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type TaskListFilters = {
  status?: SalesTaskStatus;
  statuses?: SalesTaskStatus[];
  repId?: number;
  leadId?: number;
  priority?: TaskPriority;
  search?: string;
  all?: boolean;
  limit?: number;
};

type CreateContext = {
  actor: XpotActor;
  source: TaskSource;
  input: XpotTaskCreateInput;
};

async function assertAssignee(organizationId: number, repId: number) {
  const [membership] = await db.select({ repId: organizationMemberships.repId })
    .from(organizationMemberships)
    .where(and(
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.repId, repId),
      eq(organizationMemberships.isActive, true),
    ));
  if (!membership) throw new TaskServiceError("The assignee is not active in this Organization.", 400);
}

async function resolveOrganization(actor: XpotActor, input: Pick<XpotTaskCreateInput, "leadId" | "visitId" | "opportunityId">) {
  let organizationId: number | undefined;
  if (input.leadId) {
    const lead = await storage.getSalesLead(input.leadId);
    if (!lead) throw new TaskServiceError("Lead not found", 404);
    organizationId = lead.organizationId;
  }
  if (input.visitId) {
    const visit = await storage.getSalesVisit(input.visitId);
    if (!visit) throw new TaskServiceError("Visit not found", 404);
    const lead = await storage.getSalesLead(visit.leadId);
    if (!lead) throw new TaskServiceError("Visit lead not found", 404);
    if (input.leadId && visit.leadId !== input.leadId) throw new TaskServiceError("Visit does not belong to the selected lead.");
    organizationId ??= lead.organizationId;
    if (organizationId !== lead.organizationId) throw new TaskServiceError("Task links must belong to the same Organization.");
  }
  if (input.opportunityId) {
    const opportunity = await storage.getSalesOpportunity(input.opportunityId);
    if (!opportunity) throw new TaskServiceError("Opportunity not found", 404);
    const lead = await storage.getSalesLead(opportunity.leadId);
    if (!lead) throw new TaskServiceError("Opportunity lead not found", 404);
    if (input.leadId && opportunity.leadId !== input.leadId) throw new TaskServiceError("Opportunity does not belong to the selected lead.");
    organizationId ??= lead.organizationId;
    if (organizationId !== lead.organizationId) throw new TaskServiceError("Task links must belong to the same Organization.");
  }
  organizationId ??= await organizationIdForRep(actor.rep.id);
  if (!(await canViewOrganizationForActor(actor, organizationId))) throw new TaskServiceError("Access denied", 403);
  return organizationId;
}

async function canManageTask(actor: XpotActor, task: SalesTask) {
  if (isManagerOrAdmin(actor)) return true;
  // Unit-test and pre-organization compatibility. Migration 0035 backfills
  // every production task before making this field mandatory.
  if (!task.organizationId) return task.repId === actor.rep.id;
  if (!(await canViewOrganizationForActor(actor, task.organizationId))) return false;
  return task.repId === actor.rep.id || canManageOrganizationForActor(actor, task.organizationId);
}

async function enrich(rows: SalesTask[]): Promise<EnrichedTask[]> {
  if (!rows.length) return [];
  if (typeof (db as any).select !== "function") {
    return rows.map((row) => ({ ...row, lead: null, assignee: null, opportunity: null }));
  }
  const leadIds = Array.from(new Set(rows.flatMap((row) => row.leadId ? [row.leadId] : [])));
  const repIds = Array.from(new Set(rows.map((row) => row.repId)));
  const opportunityIds = Array.from(new Set(rows.flatMap((row) => row.opportunityId ? [row.opportunityId] : [])));
  const [leads, reps, opportunities] = await Promise.all([
    leadIds.length ? db.select({ id: salesLeads.id, name: salesLeads.name }).from(salesLeads).where(inArray(salesLeads.id, leadIds)) : [],
    db.select({ id: salesReps.id, displayName: salesReps.displayName, email: salesReps.email }).from(salesReps).where(inArray(salesReps.id, repIds)),
    opportunityIds.length ? db.select({ id: salesOpportunitiesLocal.id, title: salesOpportunitiesLocal.title }).from(salesOpportunitiesLocal).where(inArray(salesOpportunitiesLocal.id, opportunityIds)) : [],
  ]);
  const leadById = new Map(leads.map((item) => [item.id, item]));
  const repById = new Map(reps.map((item) => [item.id, item]));
  const opportunityById = new Map(opportunities.map((item) => [item.id, item]));
  return rows.map((row) => ({
    ...row,
    lead: row.leadId ? leadById.get(row.leadId) ?? null : null,
    assignee: repById.get(row.repId) ?? null,
    opportunity: row.opportunityId ? opportunityById.get(row.opportunityId) ?? null : null,
  }));
}

function syncInBackground(taskId: number) {
  Promise.allSettled([syncTaskToGhl(taskId), syncTaskToXphere(taskId)])
    .then((results) => results.forEach((result) => {
      if (result.status === "rejected") console.error(`[task:${taskId}] integration sync failed:`, result.reason);
    }));
}

export async function listTasks(actor: XpotActor, filters: TaskListFilters = {}): Promise<EnrichedTask[]> {
  if (typeof (db as any).select !== "function") {
    const rows = await storage.listSalesTasks({
      repId: filters.all && isManagerOrAdmin(actor) ? filters.repId : filters.repId ?? actor.rep.id,
      leadId: filters.leadId,
      status: filters.status ?? (filters.statuses?.length === 1 ? filters.statuses[0] : undefined),
    });
    const selected = rows.filter((task) =>
      (!filters.statuses?.length || filters.statuses.includes(task.status))
      && (!filters.priority || task.priority === filters.priority)
      && (!filters.search || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(filters.search.toLowerCase()))
    );
    return enrich(selected.slice(0, filters.limit ?? 250));
  }
  const conditions = [];
  const organizationIds = await activeOrganizationIds(actor);
  const manageableIds = await managedOrganizationIds(actor);
  if (organizationIds) {
    if (!organizationIds.length) return [];
    conditions.push(inArray(salesTasks.organizationId, organizationIds));
  }

  if (filters.repId) {
    conditions.push(eq(salesTasks.repId, filters.repId));
    if (filters.repId !== actor.rep.id && manageableIds !== null) {
      if (!manageableIds.length) return [];
      conditions.push(inArray(salesTasks.organizationId, manageableIds));
    }
  } else if (!filters.all) {
    conditions.push(eq(salesTasks.repId, actor.rep.id));
  } else if (manageableIds !== null) {
    conditions.push(manageableIds.length
      ? or(eq(salesTasks.repId, actor.rep.id), inArray(salesTasks.organizationId, manageableIds))!
      : eq(salesTasks.repId, actor.rep.id));
  }
  if (filters.status) conditions.push(eq(salesTasks.status, filters.status));
  if (filters.statuses?.length) conditions.push(inArray(salesTasks.status, filters.statuses));
  if (filters.leadId) conditions.push(eq(salesTasks.leadId, filters.leadId));
  if (filters.priority) conditions.push(eq(salesTasks.priority, filters.priority));
  if (filters.search?.trim()) {
    const query = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(salesTasks.title, query), ilike(salesTasks.description, query))!);
  }
  const rows = await db.select().from(salesTasks)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(salesTasks.dueAt), desc(salesTasks.createdAt))
    .limit(Math.min(Math.max(filters.limit ?? 250, 1), 500));
  return enrich(rows);
}

export async function getTask(actor: XpotActor, id: number): Promise<EnrichedTask> {
  const task = await storage.getSalesTask(id);
  if (!task) throw new TaskServiceError("Task not found", 404);
  if (!(await canManageTask(actor, task))) throw new TaskServiceError("Access denied", 403);
  return (await enrich([task]))[0];
}

export async function createTask({ actor, source, input }: CreateContext): Promise<EnrichedTask> {
  const organizationId = await resolveOrganization(actor, input);
  const repId = input.repId ?? actor.rep.id;
  if (repId !== actor.rep.id && !(await canManageOrganizationForActor(actor, organizationId))) {
    throw new TaskServiceError("Only an Organization admin can assign tasks to another rep.", 403);
  }
  await assertAssignee(organizationId, repId);

  if (input.idempotencyKey) {
    const [existing] = await db.select().from(salesTasks).where(and(
      eq(salesTasks.organizationId, organizationId),
      eq(salesTasks.source, source),
      eq(salesTasks.idempotencyKey, input.idempotencyKey),
    ));
    if (existing) return (await enrich([existing]))[0];
  }

  const task = await storage.createSalesTask({
    organizationId,
    repId,
    createdByRepId: actor.rep.id,
    leadId: input.leadId ?? null,
    visitId: input.visitId ?? null,
    opportunityId: input.opportunityId ?? null,
    type: input.type ?? "follow_up",
    priority: input.priority ?? "medium",
    source,
    idempotencyKey: input.idempotencyKey ?? null,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    status: "pending",
  });
  syncInBackground(task.id);
  return (await enrich([task]))[0];
}

export async function updateTask(actor: XpotActor, id: number, input: XpotTaskUpdateInput): Promise<EnrichedTask> {
  const existing = await storage.getSalesTask(id);
  if (!existing) throw new TaskServiceError("Task not found", 404);
  if (!(await canManageTask(actor, existing))) throw new TaskServiceError("Access denied", 403);
  if (input.repId && input.repId !== existing.repId) {
    if (!(await canManageOrganizationForActor(actor, existing.organizationId))) throw new TaskServiceError("Only an Organization admin can reassign tasks.", 403);
    await assertAssignee(existing.organizationId, input.repId);
  }
  if (input.leadId !== undefined || input.opportunityId !== undefined) {
    const organizationId = await resolveOrganization(actor, {
      leadId: input.leadId === undefined ? existing.leadId : input.leadId,
      visitId: existing.visitId,
      opportunityId: input.opportunityId === undefined ? existing.opportunityId : input.opportunityId,
    });
    if (organizationId !== existing.organizationId) throw new TaskServiceError("Task links must belong to the same Organization.");
  }

  const now = new Date();
  const status = input.status;
  const { dueAt, ...fields } = input;
  const updated = await storage.updateSalesTask(id, {
    ...fields,
    ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
    ...(status ? {
      completedAt: status === "completed" ? (existing.completedAt ?? now) : null,
      cancelledAt: status === "cancelled" ? (existing.cancelledAt ?? now) : null,
    } : {}),
  });
  if (!updated) throw new TaskServiceError("Task not found", 404);
  syncInBackground(updated.id);
  return (await enrich([updated]))[0];
}
