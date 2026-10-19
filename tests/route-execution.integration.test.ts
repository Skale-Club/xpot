import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

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

const { startVisitTransaction, finishVisitTransaction } = await import("../server/visit-workflow.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

const ids = {} as {
  rep: number; org: number; route: number;
  leadA: number; leadKnown: number; leadAdHoc: number;
  candB: number; candC: number; candX: number;
  stop1: number; stop2: number; stop3: number;
};

const checkIn = (leadId: number, plannedVisitId?: number) => startVisitTransaction({
  repId: ids.rep,
  leadId,
  plannedVisitId,
  values: {
    status: "in_progress",
    checkedInAt: new Date(),
    checkInLat: "42.3100",
    checkInLng: "-71.4000",
    distanceFromTargetMeters: null,
    gpsAccuracyMeters: null,
    validationStatus: "gps_unavailable",
  },
});

const checkOut = (visit: { id: number; leadId: number }) => finishVisitTransaction({
  visitId: visit.id,
  leadId: visit.leadId,
  status: "completed",
  checkedOutAt: new Date(),
  durationSeconds: 900,
  updateLeadLastVisit: true,
});

beforeAll(async () => {
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('exec-rep', '+15550000777', 'Exec')`);
  ids.rep = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('exec-rep', 'Exec Rep', 'rep', true) RETURNING id`)).id;
  ids.org = (await one(`INSERT INTO organizations (name, slug) VALUES ('Exec Team', 'exec-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [ids.org, ids.rep]);
  const lead = async (name: string, placeId: string | null, lat: string | null) => {
    const id = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status, google_place_id)
      VALUES ($1, $2, $3, 'lead', $4) RETURNING id`, [ids.org, name, ids.rep, placeId])).id as number;
    if (lat) await q(`INSERT INTO sales_lead_locations (lead_id, address_line_1, lat, lng, is_primary) VALUES ($1, '1 Main St', $2, '-71.4000', true)`, [id, lat]);
    return id;
  };
  ids.leadA = await lead("Visited Barber", "place-a", "42.3000");
  // An existing CRM business that is also stop 2's discovered place.
  ids.leadKnown = await lead("Known Barber", "place-b", "42.3050");
  // The opportunity on the street: not on the route at all.
  ids.leadAdHoc = await lead("Street Opportunity", "place-x", "42.3100");

  const job = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location) VALUES ($1, 'completed', 'Framingham, MA') RETURNING id`, [ids.rep])).id;
  const run = (await one(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location)
    VALUES ($1, $2, 'completed', 'barbershop', 'barber shop', 'Framingham, MA') RETURNING id`, [job, ids.rep])).id;
  const candidate = async (name: string, placeId: string, status: string, leadId: number | null, lat: string) =>
    (await one(`INSERT INTO prospecting_candidates (job_id, run_id, rep_id, lead_id, status, source_id, google_place_id, name, lat, lng)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, '-71.4000') RETURNING id`, [job, run, ids.rep, leadId, status, placeId, name, lat])).id as number;
  const candA = await candidate("Visited Barber", "place-a", "visited", ids.leadA, "42.3000");
  ids.candB = await candidate("Known Barber", "place-b", "discovered", null, "42.3050");
  ids.candC = await candidate("Next Barber", "place-c", "discovered", null, "42.3500");
  // Found by discovery, never routed: the street opportunity itself.
  ids.candX = await candidate("Street Opportunity", "place-x", "discovered", null, "42.3100");

  ids.route = (await one(`INSERT INTO prospecting_routes (rep_id, job_id, name, route_date, status, planned_start_at, started_at, start_lat, start_lng, default_visit_minutes)
    VALUES ($1, $2, 'Today', to_char(NOW(), 'YYYY-MM-DD'), 'in_progress', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', '42.3000', '-71.4000', 20) RETURNING id`, [ids.rep, job])).id;
  const visitA = (await one(`INSERT INTO sales_visits (rep_id, lead_id, status, source, checked_in_at, checked_out_at)
    VALUES ($1, $2, 'completed', 'prospecting-route', NOW() - INTERVAL '50 minutes', NOW() - INTERVAL '30 minutes') RETURNING id`, [ids.rep, ids.leadA])).id;
  const stop = async (position: number, status: string, candidateId: number, leadId: number | null, visitId: number | null, name: string, lat: string) =>
    (await one(`INSERT INTO prospecting_route_stops (route_id, candidate_id, lead_id, visit_id, position, status, name, lat, lng, estimated_arrival_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '-71.4000', NOW()) RETURNING id`, [ids.route, candidateId, leadId, visitId, position, status, name, lat])).id as number;
  ids.stop1 = await stop(1, "completed", candA, ids.leadA, visitA, "Visited Barber", "42.3000");
  ids.stop2 = await stop(2, "planned", ids.candB, null, null, "Known Barber", "42.3050");
  ids.stop3 = await stop(3, "planned", ids.candC, null, null, "Next Barber", "42.3500");
});

test("checking in from the search lands on the business's open route stop", async () => {
  const visit = await checkIn(ids.leadKnown);
  expect(visit).toBeTruthy();
  expect(await one(`SELECT status, lead_id, visit_id FROM prospecting_route_stops WHERE id = $1`, [ids.stop2]))
    .toEqual({ status: "checked_in", lead_id: ids.leadKnown, visit_id: visit!.id });
  expect(await one(`SELECT status, lead_id FROM prospecting_candidates WHERE id = $1`, [ids.candB]))
    .toEqual({ status: "scheduled", lead_id: ids.leadKnown });
  // No extra stop: it was already on the route.
  expect((await q(`SELECT id FROM prospecting_route_stops WHERE route_id = $1`, [ids.route])).length).toBe(3);

  await checkOut(visit!);
  expect((await one(`SELECT status FROM prospecting_route_stops WHERE id = $1`, [ids.stop2])).status).toBe("completed");
  expect((await one(`SELECT status FROM prospecting_candidates WHERE id = $1`, [ids.candB])).status).toBe("visited");
});

test("an opportunity off the plan joins the running route and re-times what is ahead", async () => {
  const before = Date.now();
  const visit = await checkIn(ids.leadAdHoc);
  const stops = await q(`SELECT id, position, status, origin, visit_id, estimated_arrival_at FROM prospecting_route_stops
    WHERE route_id = $1 ORDER BY position`, [ids.route]);
  expect(stops.map((stop) => [stop.position, stop.origin, stop.status])).toEqual([
    [1, "planned", "completed"],
    [2, "planned", "completed"],
    [3, "ad_hoc", "checked_in"],
    [4, "planned", "planned"],
  ]);
  expect(stops[2].visit_id).toBe(visit!.id);
  // The stop still ahead now arrives after the extra 20-minute visit and the drive.
  expect(stops[3].id).toBe(ids.stop3);
  expect(new Date(stops[3].estimated_arrival_at).getTime()).toBeGreaterThan(before + 20 * 60 * 1000);

  await checkOut(visit!);
  expect((await one(`SELECT status FROM prospecting_route_stops WHERE visit_id = $1`, [visit!.id])).status).toBe("completed");
  // Discovery found this business too; visited in person, it is not routed again.
  expect(await one(`SELECT status, lead_id FROM prospecting_candidates WHERE id = $1`, [ids.candX]))
    .toEqual({ status: "visited", lead_id: ids.leadAdHoc });
  expect((await one(`SELECT status FROM prospecting_routes WHERE id = $1`, [ids.route])).status).toBe("in_progress");
});

test("a stop's planned visit is started, not duplicated, and the last one closes the route", async () => {
  const leadC = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status, google_place_id)
    VALUES ($1, 'Next Barber', $2, 'lead', 'place-c') RETURNING id`, [ids.org, ids.rep])).id;
  const planned = (await one(`INSERT INTO sales_visits (rep_id, lead_id, status, source, scheduled_at)
    VALUES ($1, $2, 'planned', 'prospecting-route', NOW()) RETURNING id`, [ids.rep, leadC])).id;
  await q(`UPDATE prospecting_route_stops SET lead_id = $1, visit_id = $2 WHERE id = $3`, [leadC, planned, ids.stop3]);

  const visit = await checkIn(leadC);
  expect(visit!.id).toBe(planned);
  expect((await q(`SELECT id FROM sales_visits WHERE lead_id = $1`, [leadC])).length).toBe(1);

  await checkOut(visit!);
  expect((await one(`SELECT status FROM prospecting_routes WHERE id = $1`, [ids.route])).status).toBe("completed");
});

test("with no route running, an ad-hoc visit stays a plain visit", async () => {
  const visit = await checkIn(ids.leadAdHoc);
  expect(await q(`SELECT id FROM prospecting_route_stops WHERE visit_id = $1`, [visit!.id])).toEqual([]);
  await checkOut(visit!);
});

test("a route from an earlier day does not take today's ad-hoc visit, even if restarted today", async () => {
  // A late check-in on one of its old stops set started_at to today.
  const stale = (await one(`INSERT INTO prospecting_routes (rep_id, name, route_date, status, planned_start_at, started_at, start_lat, start_lng)
    VALUES ($1, 'Days ago', to_char(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), 'in_progress', NOW() - INTERVAL '3 days', NOW() - INTERVAL '10 minutes', '42.3000', '-71.4000') RETURNING id`, [ids.rep])).id;
  const visit = await checkIn(ids.leadAdHoc);
  expect(await q(`SELECT id FROM prospecting_route_stops WHERE route_id = $1`, [stale])).toEqual([]);
  expect(await q(`SELECT id FROM prospecting_route_stops WHERE visit_id = $1`, [visit!.id])).toEqual([]);
  await checkOut(visit!);
});
