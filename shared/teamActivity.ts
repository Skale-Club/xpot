// Rules of Visits › Manage › Overview (server/routes/xpot/teamActivity.ts runs
// the queries; client/src/pages/admin/AdminOverview.tsx shows them). Kept pure
// here so both sides and the tests share one definition.

import { repModules } from "./modules.js";

/** The check-ins whose location did not match the business: outside its area, or let through with a reason. */
export const LOCATION_EXCEPTION_STATUSES = ["outside_geofence", "manual_override"] as const;

/** The periods the screen offers: today (the viewer's day) and the last 7, 30 or 90 days. */
export const TEAM_PERIODS = ["today", "7", "30", "90"] as const;
export type TeamPeriod = (typeof TEAM_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 400;

/** Where a period starts, for the viewer: today from local midnight, the others N days back from now. */
export function teamPeriodSince(period: TeamPeriod, now = new Date()): Date {
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getTime() - Number(period) * DAY_MS);
}

/**
 * Where the period starts, from the request. The client sends `since` (the
 * start of its own "today", so the day is the viewer's, not the server's);
 * `days` is the fallback for API callers. Nothing at all is the last 30 days.
 */
export function teamActivitySince(query: { since?: unknown; days?: unknown }, now = new Date()): Date | null {
  if (typeof query.since === "string" && query.since) {
    const since = new Date(query.since);
    if (Number.isNaN(since.getTime()) || since.getTime() > now.getTime() || now.getTime() - since.getTime() > MAX_DAYS * DAY_MS) return null;
    return since;
  }
  const days = query.days === undefined || query.days === "" ? 30 : Number(query.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
  return new Date(now.getTime() - days * DAY_MS);
}

type Person = { role: string; modules: readonly string[] | null; isActive: boolean; blockedAt: Date | string | null; deletedAt: Date | string | null };

/** Counted in the team's numbers: a living, active account that uses Visits (Tags-only resellers are not field reps). */
export function countsTowardTeam(person: Person): boolean {
  return !person.deletedAt && person.isActive && !person.blockedAt && repModules(person).includes("visits");
}

/**
 * Who gets a row: every counted field rep (a rep with nothing done is the row
 * a manager looks for), and managers or admins only when they did something.
 */
export function inTeamTable(person: Person, active: boolean): boolean {
  return countsTowardTeam(person) && (person.role === "rep" || active);
}

export type TeamActivityRow = {
  repId: number;
  displayName: string;
  role: string;
  visits: number;
  finishedVisits: number;
  locationExceptions: number;
  salesCount: number;
  salesTotalCents: number;
  lastActivityAt: string | null;
};

export type TeamActivityResponse = {
  since: string;
  metrics: {
    activeReps: number;
    visits: number;
    finishedVisits: number;
    locationExceptions: number;
    salesCount: number;
    salesTotalCents: number;
    currency: string;
    visitsInProgress: number;
    openOpportunities: number;
    /** Whole currency units, like the opportunities themselves. */
    pipelineValue: number;
    pendingTasks: number;
  };
  reps: TeamActivityRow[];
};
