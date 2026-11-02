// Visits › Manage › Overview (GET /api/xpot/admin/team-activity): what the field
// team did in a period, in total and per person. Only people who use Visits are
// counted (Tags-only resellers are not field reps), and only living accounts.
// Visits, finished visits, location exceptions and sales are counted in the
// period; visits in progress, open opportunities and pending tasks are "now".

import { Router } from "express";
import { and, eq, gte, inArray, isNotNull, sql, type AnyColumn } from "drizzle-orm";
import { db } from "../../db.js";
import { isPlatformAdmin, requireXpotUser, type XpotActor } from "./middleware.js";
import { managedOrganizationIds } from "../../organizations/service.js";
import { organizationMemberships, salesOpportunitiesLocal, salesReps, salesSales, salesTasks, salesVisits } from "#shared/schema.js";
import { VISIT_OUTCOME_STATUSES } from "#shared/visit-status.js";
import {
  LOCATION_EXCEPTION_STATUSES,
  countsTowardTeam,
  inTeamTable,
  type TeamActivityResponse,
  type TeamActivityRow,
} from "#shared/teamActivity.js";

import { teamActivitySince } from "#shared/teamActivity.js";
export { teamActivitySince };

const toIso = (value: unknown): string | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * What the field team did since `since`. `repIds` narrows it to these people. `organizationId` counts the work done on
 * that organization's companies instead, by whoever did it: the numbers follow the company visited or sold to, not the
 * team the person belongs to, so an owner of two organizations (or a rep serving another's companies) never gets the
 * other's totals, and the total matches the people's own pages.
 */
export async function teamActivity(since: Date, repIds?: readonly number[], organizationId?: number): Promise<TeamActivityResponse> {
  const ofOrganization = (leadId: AnyColumn) => (organizationId === undefined ? undefined : sql`${leadId} IN (SELECT id FROM sales_leads WHERE organization_id = ${organizationId})`);
  const [people, visits, sales, lastVisit, lastSale, inProgress, opportunities, tasks] = await Promise.all([
    db.select({
      id: salesReps.id,
      displayName: salesReps.displayName,
      role: salesReps.role,
      modules: salesReps.modules,
      isActive: salesReps.isActive,
      blockedAt: salesReps.blockedAt,
      deletedAt: salesReps.deletedAt,
    }).from(salesReps).where(repIds ? inArray(salesReps.id, repIds.length ? [...repIds] : [-1]) : undefined),
    db.select({
      repId: salesVisits.repId,
      visits: sql<number>`count(*)::int`,
      finished: sql<number>`(count(*) filter (where ${inArray(salesVisits.status, [...VISIT_OUTCOME_STATUSES])}))::int`,
      exceptions: sql<number>`(count(*) filter (where ${inArray(salesVisits.validationStatus, [...LOCATION_EXCEPTION_STATUSES])}))::int`,
    }).from(salesVisits).where(and(gte(salesVisits.checkedInAt, since), ofOrganization(salesVisits.leadId))).groupBy(salesVisits.repId),
    db.select({
      repId: salesSales.repId,
      count: sql<number>`count(*)::int`,
      totalCents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int`,
      currency: sql<string>`max(${salesSales.currency})`,
    }).from(salesSales).where(and(eq(salesSales.status, "completed"), gte(salesSales.soldAt, since), ofOrganization(salesSales.leadId))).groupBy(salesSales.repId),
    db.select({
      repId: salesVisits.repId,
      at: sql<Date | string | null>`max(greatest(${salesVisits.checkedInAt}, ${salesVisits.checkedOutAt}))`,
    }).from(salesVisits).where(and(isNotNull(salesVisits.checkedInAt), ofOrganization(salesVisits.leadId))).groupBy(salesVisits.repId),
    db.select({
      repId: salesSales.repId,
      at: sql<Date | string | null>`max(${salesSales.soldAt})`,
    }).from(salesSales).where(and(eq(salesSales.status, "completed"), ofOrganization(salesSales.leadId))).groupBy(salesSales.repId),
    db.select({ repId: salesVisits.repId, n: sql<number>`count(*)::int` })
      .from(salesVisits).where(and(eq(salesVisits.status, "in_progress"), ofOrganization(salesVisits.leadId))).groupBy(salesVisits.repId),
    db.select({
      repId: salesOpportunitiesLocal.repId,
      n: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${salesOpportunitiesLocal.value}), 0)::float`,
    }).from(salesOpportunitiesLocal).where(and(eq(salesOpportunitiesLocal.status, "open"), ofOrganization(salesOpportunitiesLocal.leadId))).groupBy(salesOpportunitiesLocal.repId),
    db.select({ repId: salesTasks.repId, n: sql<number>`count(*)::int` })
      .from(salesTasks).where(and(eq(salesTasks.status, "pending"), organizationId === undefined ? undefined : eq(salesTasks.organizationId, organizationId))).groupBy(salesTasks.repId),
  ]);

  const byRep = <T extends { repId: number | null }>(rows: T[]) => new Map(rows.map((row) => [row.repId, row]));
  const visitsBy = byRep(visits);
  const salesBy = byRep(sales);
  const lastVisitBy = byRep(lastVisit);
  const lastSaleBy = byRep(lastSale);

  const rows: TeamActivityRow[] = [];
  const counted = new Set<number>();
  for (const person of people) {
    const v = visitsBy.get(person.id);
    const s = salesBy.get(person.id);
    // Living people with Visits count toward the totals, whether or not they get a row. An organization's own numbers
    // count every living account that worked its companies (a reseller's sale of one is a sale of the organization),
    // and only those who did something get a row (the Team tab lists the rest).
    const worked = Boolean(v || s);
    if (organizationId === undefined ? !countsTowardTeam(person) : !(!person.deletedAt && person.isActive && !person.blockedAt && worked)) continue;
    counted.add(person.id);
    if (organizationId === undefined ? !inTeamTable(person, worked) : false) continue;
    const times = [lastVisitBy.get(person.id)?.at, lastSaleBy.get(person.id)?.at].map(toIso).filter((t): t is string => !!t).sort();
    rows.push({
      repId: person.id,
      displayName: person.displayName,
      role: person.role,
      visits: v?.visits ?? 0,
      finishedVisits: v?.finished ?? 0,
      locationExceptions: v?.exceptions ?? 0,
      salesCount: s?.count ?? 0,
      salesTotalCents: s?.totalCents ?? 0,
      lastActivityAt: times.at(-1) ?? null,
    });
  }
  // Most active first; the idle reps sink to the bottom, by name.
  rows.sort((a, b) => b.visits - a.visits || b.salesTotalCents - a.salesTotalCents || a.displayName.localeCompare(b.displayName));

  const sum = <T extends { repId: number | null }>(list: T[], pick: (row: T) => number) =>
    list.reduce((total, row) => total + (row.repId != null && counted.has(row.repId) ? pick(row) : 0), 0);
  const currencies = new Set(sales.filter((s) => counted.has(s.repId)).map((s) => s.currency || "USD"));

  return {
    since: since.toISOString(),
    metrics: {
      activeReps: people.filter((p) => counted.has(p.id) && p.role === "rep").length,
      visits: sum(visits, (r) => r.visits),
      finishedVisits: sum(visits, (r) => r.finished),
      locationExceptions: sum(visits, (r) => r.exceptions),
      salesCount: sum(sales, (r) => r.count),
      salesTotalCents: sum(sales, (r) => r.totalCents),
      // One currency in practice; when several mix, the total is still shown in the first.
      currency: Array.from(currencies)[0] ?? "USD",
      visitsInProgress: sum(inProgress, (r) => r.n),
      openOpportunities: sum(opportunities, (r) => r.n),
      pipelineValue: sum(opportunities, (r) => r.value),
      pendingTasks: sum(tasks, (r) => r.n),
    },
    reps: rows,
  };
}

/**
 * GET /team-results?since=<ISO>|days=N: the same numbers as the platform's Team results, for whoever runs a team.
 * The platform sees everyone; an owner or a partner sees the people of the organizations they run, and nobody
 * else gets in. (The platform's own copy stays at /admin/team-activity.)
 */
export function createTeamResultsRouter() {
  const router = Router();
  router.get("/team-results", requireXpotUser, async (req, res) => {
    const actor = (req as any).xpotActor as XpotActor;
    const since = teamActivitySince(req.query);
    if (!since) return res.status(400).json({ message: "Choose a period of up to 400 days." });
    if (isPlatformAdmin(actor)) return res.json(await teamActivity(since));
    const managed = await managedOrganizationIds(actor);
    if (!managed?.length) return res.status(403).json({ code: "access_denied", message: "Access denied" });
    const members = await db.selectDistinct({ repId: organizationMemberships.repId }).from(organizationMemberships)
      .where(and(inArray(organizationMemberships.organizationId, managed), eq(organizationMemberships.isActive, true)));
    res.json(await teamActivity(since, members.map((member) => member.repId)));
  });
  return router;
}
