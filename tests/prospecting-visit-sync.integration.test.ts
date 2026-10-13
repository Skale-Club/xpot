import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, expect, test, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const directory = join(process.cwd(), "migrations");
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(directory, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { db } = await import("../server/db.js");
const { markProspectingVisitCheckedIn, markProspectingVisitFinished } = await import("../server/prospecting/visit-sync.js");
const { retryFailedProspectingRuns } = await import("../server/prospecting/queue.js");
const { sql } = await import("drizzle-orm");

afterAll(async () => pg.client?.close());

test("a planned visit drives its linked prospecting route through completion", async () => {
  const rows = (await db.execute(sql`
    WITH new_user AS (
      INSERT INTO users (id, phone, first_name) VALUES ('route-rep', '+15550000123', 'Route')
    ), new_rep AS (
      INSERT INTO sales_reps (user_id, display_name, role, is_active)
      VALUES ('route-rep', 'Route Rep', 'rep', true) RETURNING id
    ), new_organization AS (
      INSERT INTO organizations (name, slug) VALUES ('Route Team', 'route-team') RETURNING id
    ), new_membership AS (
      INSERT INTO organization_memberships (organization_id, rep_id, role)
      SELECT new_organization.id, new_rep.id, 'admin'
      FROM new_organization, new_rep
      RETURNING organization_id, rep_id
    ), new_lead AS (
      INSERT INTO sales_leads (organization_id, name, owner_rep_id)
      SELECT organization_id, 'Cold Business', rep_id FROM new_membership RETURNING id, owner_rep_id
    ), new_job AS (
      INSERT INTO prospecting_jobs (rep_id, status, location)
      SELECT id, 'completed', 'Framingham, MA' FROM new_rep RETURNING id, rep_id
    ), new_run AS (
      INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location)
      SELECT id, rep_id, 'completed', 'barbershop', 'barber shop', 'Framingham, MA' FROM new_job
      RETURNING id, job_id, rep_id
    ), new_candidate AS (
      INSERT INTO prospecting_candidates (job_id, run_id, rep_id, lead_id, status, name, lat, lng)
      SELECT new_run.job_id, new_run.id, new_run.rep_id, new_lead.id, 'scheduled', 'Cold Business', '42.30', '-71.50'
      FROM new_run, new_lead RETURNING id, job_id, run_id, lead_id, rep_id
    ), new_visit AS (
      INSERT INTO sales_visits (rep_id, lead_id, status, scheduled_at, source)
      SELECT rep_id, lead_id, 'planned', NOW(), 'prospecting-route' FROM new_candidate
      RETURNING id, lead_id, rep_id
    ), new_route AS (
      INSERT INTO prospecting_routes (rep_id, job_id, name, route_date, status, planned_start_at, start_lat, start_lng)
      SELECT new_visit.rep_id, new_job.id, 'Today route', '2026-10-12', 'published', NOW(), '42.30', '-71.50'
      FROM new_visit, new_job RETURNING id
    )
    INSERT INTO prospecting_route_stops (route_id, candidate_id, lead_id, visit_id, position, name, lat, lng)
    SELECT new_route.id, new_candidate.id, new_visit.lead_id, new_visit.id, 1, 'Cold Business', '42.30', '-71.50'
    FROM new_route, new_candidate, new_visit
    RETURNING visit_id, route_id, candidate_id,
      (SELECT job_id FROM new_candidate) AS job_id,
      (SELECT run_id FROM new_candidate) AS run_id,
      (SELECT rep_id FROM new_candidate) AS rep_id
  `)).rows as Array<{ visit_id: number; route_id: number; candidate_id: number; job_id: number; run_id: number; rep_id: number }>;
  const linked = rows[0];

  await markProspectingVisitCheckedIn(linked.visit_id);
  expect((await db.execute(sql`SELECT status FROM prospecting_route_stops WHERE visit_id = ${linked.visit_id}`)).rows[0]).toEqual({ status: "checked_in" });
  expect((await db.execute(sql`SELECT status FROM prospecting_routes WHERE id = ${linked.route_id}`)).rows[0]).toEqual({ status: "in_progress" });

  await markProspectingVisitFinished(linked.visit_id, false);
  expect((await db.execute(sql`SELECT status FROM prospecting_route_stops WHERE visit_id = ${linked.visit_id}`)).rows[0]).toEqual({ status: "completed" });
  expect((await db.execute(sql`SELECT status FROM prospecting_routes WHERE id = ${linked.route_id}`)).rows[0]).toEqual({ status: "completed" });
  expect((await db.execute(sql`SELECT status FROM prospecting_candidates WHERE id = ${linked.candidate_id}`)).rows[0]).toEqual({ status: "visited" });

  await db.execute(sql`
    UPDATE prospecting_runs SET status = 'failed', engine_job_id = 'failed-engine-job', progress = 50,
      result_count = 7, error_message = 'network', started_at = NOW(), completed_at = NOW()
    WHERE id = ${linked.run_id}
  `);
  await db.execute(sql`
    UPDATE prospecting_jobs SET status = 'failed', error_message = 'network', completed_at = NOW()
    WHERE id = ${linked.job_id}
  `);
  await db.execute(sql`UPDATE prospecting_runs SET created_at = NOW() - INTERVAL '2 days' WHERE id = ${linked.run_id}`);
  expect(await retryFailedProspectingRuns(linked.job_id, linked.rep_id)).toBe(1);
  // A retried search rejoins the back of the line with a fresh 24-hour allowance.
  expect((await db.execute(sql`
    SELECT created_at > NOW() - INTERVAL '1 minute' AS fresh FROM prospecting_runs WHERE id = ${linked.run_id}
  `)).rows[0]).toEqual({ fresh: true });
  expect((await db.execute(sql`
    SELECT status, engine_job_id, progress, result_count, error_message, started_at, completed_at
    FROM prospecting_runs WHERE id = ${linked.run_id}
  `)).rows[0]).toEqual({
    status: "queued",
    engine_job_id: null,
    progress: 0,
    result_count: 0,
    error_message: null,
    started_at: null,
    completed_at: null,
  });
  expect((await db.execute(sql`SELECT status, error_message, completed_at FROM prospecting_jobs WHERE id = ${linked.job_id}`)).rows[0])
    .toEqual({ status: "queued", error_message: null, completed_at: null });
});
