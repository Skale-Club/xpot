import { and, desc, eq, sql } from "drizzle-orm";
import type { db } from "../db.js";
import { prospectingJobs, prospectingRoutes } from "#shared/schema.js";
import { dailySessionCount, MAX_DAILY_PROSPECTING_SESSIONS } from "#shared/prospecting.js";

/**
 * One rep's day of prospecting, read the same way by the three paths that
 * create a route: accepting a search (service.ts), building its route
 * (auto-route.ts) and building a route by hand or from a past one
 * (routes/xpot/prospecting.ts).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ACTIVE_ROUTE_STATUSES = ["draft", "published", "in_progress"] as const;

export const isActiveRoute = (route: { status: string }) => (ACTIVE_ROUTE_STATUSES as readonly string[]).includes(route.status);

/** A search still running, or finished with its route not built yet. */
export const isPreparingJob = (job: { status: string; routePlanningStatus: string }) =>
  ["draft", "queued", "running"].includes(job.status)
  || (job.status === "completed" && ["pending", "building"].includes(job.routePlanningStatus));

/**
 * The (rep, day) lock taken around every paid step of a day: accepting a
 * search and optimizing a route. `wait: false` answers at once instead of
 * queueing behind a route being optimized (up to the Google timeout).
 */
export async function lockRepDay(tx: Tx, repId: number, routeDate: string, options: { wait: boolean }) {
  if (options.wait) {
    await tx.execute(sql`select pg_advisory_xact_lock(${repId}, hashtext(${routeDate}))`);
    return true;
  }
  const result = await tx.execute(sql`select pg_try_advisory_xact_lock(${repId}, hashtext(${routeDate})) as locked`);
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<{ locked: boolean }>;
  return Boolean(rows[0]?.locked);
}

export async function repDay(tx: Pick<typeof db, "select">, repId: number, routeDate: string) {
  const [routes, jobs] = await Promise.all([
    tx.select().from(prospectingRoutes).where(and(
      eq(prospectingRoutes.repId, repId),
      eq(prospectingRoutes.routeDate, routeDate),
    )).orderBy(desc(prospectingRoutes.createdAt)),
    tx.select({
      id: prospectingJobs.id,
      status: prospectingJobs.status,
      routePlanningStatus: prospectingJobs.routePlanningStatus,
    }).from(prospectingJobs).where(and(
      eq(prospectingJobs.repId, repId),
      sql`${prospectingJobs.filters}->>'routeDate' = ${routeDate}`,
    )),
  ]);
  return {
    routes,
    jobs,
    activeRoute: routes.find(isActiveRoute),
    preparingJobs: jobs.filter(isPreparingJob),
    /** Sessions used, leaving out the job whose own route is being built. */
    sessionsUsed: (excludeJobId?: number) => dailySessionCount({ jobs, routes, excludeJobId }),
    limitReached: (excludeJobId?: number) => dailySessionCount({ jobs, routes, excludeJobId }) >= MAX_DAILY_PROSPECTING_SESSIONS,
  };
}
