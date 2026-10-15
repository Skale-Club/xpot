import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

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

// The heuristic optimizer keeps this test offline and deterministic.
delete process.env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID;

const { createProspectingRouter } = await import("../server/routes/xpot/prospecting.js");
const { createAuthRouter } = await import("../server/routes/xpot/auth.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

function app(isAdmin: boolean) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId: "route-rep", email: "route-rep@x.test", firstName: "Route", isAdmin };
    next();
  });
  server.use("/api/xpot", createProspectingRouter());
  server.use("/api/xpot", createAuthRouter());
  return server;
}

async function request(method: string, path: string, body?: unknown, options: { admin?: boolean } = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app(options.admin ?? false).listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        resolve({ status: response.status, body: text ? JSON.parse(text) : null });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

let seed: { repId: number; jobId: number; leadId: number; linked: number; placeA: number; placeB: number; unselected: number; visited: number };

beforeEach(async () => {
  await q(`TRUNCATE prospecting_route_stops, prospecting_routes, prospecting_candidates, prospecting_runs, prospecting_jobs,
    sales_visits, sales_lead_locations, sales_leads, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('route-rep', '+15550000124', 'Route')`);
  const repId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('route-rep', 'Route Rep', 'rep', true) RETURNING id`)).id;
  const organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Route Team', 'route-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [organizationId, repId]);
  const leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status, google_place_id)
    VALUES ($1, 'Known Barber', $2, 'prospect', 'place-known') RETURNING id`, [organizationId, repId])).id;
  await q(`INSERT INTO sales_lead_locations (lead_id, address_line_1, lat, lng, is_primary) VALUES ($1, '1 Main St', '42.300', '-71.500', true)`, [leadId]);

  const jobId = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location) VALUES ($1, 'completed', 'Framingham, MA') RETURNING id`, [repId])).id;
  const otherJobId = (await one(`INSERT INTO prospecting_jobs (rep_id, status, location) VALUES ($1, 'completed', 'Natick, MA') RETURNING id`, [repId])).id;
  const runId = (await one(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location)
    VALUES ($1, $2, 'completed', 'barbershop', 'barber shop', 'Framingham, MA') RETURNING id`, [jobId, repId])).id;
  const otherRunId = (await one(`INSERT INTO prospecting_runs (job_id, rep_id, status, niche, query, location)
    VALUES ($1, $2, 'completed', 'barbershop', 'barber shop', 'Natick, MA') RETURNING id`, [otherJobId, repId])).id;
  const candidate = async (job: number, run: number, status: string, name: string, placeId: string, lat: string, leadId: number | null = null) =>
    (await one(`INSERT INTO prospecting_candidates (job_id, run_id, rep_id, lead_id, status, source_id, google_place_id, name, lat, lng, score)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, '-71.510', 70) RETURNING id`, [job, run, repId, leadId, status, placeId, name, lat])).id as number;
  seed = {
    repId,
    jobId,
    leadId,
    linked: await candidate(jobId, runId, "discovered", "Known Barber", "place-known", "42.300", leadId),
    placeA: await candidate(jobId, runId, "discovered", "New Barber", "place-new", "42.310"),
    // The same business found again by a second job.
    placeB: await candidate(otherJobId, otherRunId, "discovered", "New Barber", "place-new", "42.310"),
    unselected: await candidate(otherJobId, otherRunId, "discovered", "Not On Route", "place-unselected", "42.315"),
    visited: await candidate(jobId, runId, "visited", "Visited Barber", "place-visited", "42.320"),
  };
});

test("a completed search automatically becomes an optimized route", async () => {
  const { processNextAutomaticRoute } = await import("../server/prospecting/auto-route.js");
  const result = await processNextAutomaticRoute();
  expect(result?.route).toMatchObject({ jobId: seed.jobId, status: "published" });
  expect(Number(result?.route.startLng)).toBeCloseTo(-71.51);
  const firstStop = await one(`SELECT lat, lng, travel_duration_seconds FROM prospecting_route_stops WHERE route_id = $1 ORDER BY position LIMIT 1`, [result?.route.id]);
  expect(Number(result?.route.startLat)).toBeCloseTo(Number(firstStop.lat));
  expect(Number(result?.route.startLng)).toBeCloseTo(Number(firstStop.lng));
  expect(firstStop.travel_duration_seconds).toBe(0);
  expect((await one(`SELECT route_planning_status, route_error_message FROM prospecting_jobs WHERE id = $1`, [seed.jobId])))
    .toEqual({ route_planning_status: "ready", route_error_message: null });
  expect((await one(`SELECT count(*)::int AS count FROM prospecting_route_stops WHERE route_id = $1`, [result?.route.id])).count).toBe(2);
  const stops = await q(`SELECT lead_id FROM prospecting_route_stops WHERE route_id = $1 ORDER BY position`, [result?.route.id]);
  expect(stops.every((stop) => Number.isInteger(stop.lead_id))).toBe(true);
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits`)).count).toBe(2);
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [seed.placeA])).lead_id).toEqual(expect.any(Number));
});

test("a legacy ready job with a draft route is recovered and published automatically", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", {
    ...routeBody(),
    jobId: seed.jobId,
    routeDate: todayUtc(),
  });
  expect(created.body.route.status).toBe("draft");
  await q(`UPDATE prospecting_jobs SET route_planning_status = 'ready' WHERE id = $1`, [seed.jobId]);

  const { processNextAutomaticRoute } = await import("../server/prospecting/auto-route.js");
  const result = await processNextAutomaticRoute();
  expect(result?.route).toMatchObject({ id: created.body.route.id, status: "published" });
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits WHERE source = 'prospecting-route'`)).count).toBe(2);
});

// The automation only picks up routes dated today or later (UTC). A fixed date
// here passed on the day it was written and failed every day after.
const todayUtc = () => new Date().toISOString().slice(0, 10);

const routeBody = () => ({
  routeDate: "2026-10-13",
  plannedStartAt: "2026-10-13T13:00:00.000Z",
  leadIds: [seed.leadId],
  candidateIds: [seed.linked, seed.placeA, seed.placeB, seed.visited],
});

test("a published legacy automatic route removes the origin drive from its work window", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", {
    ...routeBody(),
    jobId: seed.jobId,
    routeDate: todayUtc(),
  });
  const routeId = created.body.route.id;
  expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "published" })).status).toBe(200);
  await q(`UPDATE prospecting_jobs SET route_planning_status = 'ready' WHERE id = $1`, [seed.jobId]);
  const firstBefore = await one(`SELECT id, estimated_arrival_at FROM prospecting_route_stops WHERE route_id = $1 ORDER BY position LIMIT 1`, [routeId]);
  await q(`UPDATE prospecting_route_stops
    SET estimated_arrival_at = estimated_arrival_at + interval '60 minutes'
    WHERE route_id = $1`, [routeId]);
  await q(`UPDATE prospecting_route_stops SET travel_duration_seconds = 3600, travel_distance_meters = 50000 WHERE id = $1`, [firstBefore.id]);
  await q(`UPDATE prospecting_routes SET total_duration_seconds = total_duration_seconds + 3600, total_distance_meters = total_distance_meters + 50000 WHERE id = $1`, [routeId]);
  await q(`UPDATE prospecting_jobs SET route_planning_status = 'failed' WHERE id <> $1`, [seed.jobId]);

  const { processNextAutomaticRoute } = await import("../server/prospecting/auto-route.js");
  const rebuilt = await processNextAutomaticRoute();
  expect(rebuilt?.route).toMatchObject({ status: "published", jobId: seed.jobId });
  expect(rebuilt?.route.id).not.toBe(routeId);
  expect((await one(`SELECT count(*)::int AS count FROM prospecting_routes WHERE id = $1`, [routeId])).count).toBe(0);
  const firstRebuilt = await one(`SELECT travel_duration_seconds, travel_distance_meters FROM prospecting_route_stops WHERE route_id = $1 ORDER BY position LIMIT 1`, [rebuilt?.route.id]);
  expect(firstRebuilt.travel_duration_seconds).toBe(0);
  expect(firstRebuilt.travel_distance_meters).toBe(0);
});

test("a route visits each business once and never a visited one", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(created.status).toBe(201);
  const stops = created.body.stops as Array<{ leadId: number | null; candidateId: number | null; name: string }>;
  expect(stops).toHaveLength(2);
  expect(stops.filter((stop) => stop.leadId === seed.leadId)).toHaveLength(1);
  expect(stops.filter((stop) => stop.name === "New Barber")).toHaveLength(1);
  expect(stops.some((stop) => stop.candidateId === seed.visited)).toBe(false);
});

test("building a draft route immediately promotes every selected stop to a CRM lead", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(created.status).toBe(201);

  const newBusiness = (created.body.stops as Array<{ name: string; leadId: number | null }>)
    .find((stop) => stop.name === "New Barber")!;
  expect(newBusiness.leadId).toEqual(expect.any(Number));
  expect(await one(`SELECT name, status, owner_rep_id FROM sales_leads WHERE id = $1`, [newBusiness.leadId])).toEqual({
    name: "New Barber",
    status: "lead",
    owner_rep_id: seed.repId,
  });
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits`)).count).toBe(0);
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [seed.placeA])).lead_id).toBe(newBusiness.leadId);
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [seed.unselected])).lead_id).toBeNull();
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [seed.visited])).lead_id).toBeNull();
});

test("a draft stop can prepare one reusable visit for direct check-in", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(created.status).toBe(201);
  const stop = (created.body.stops as Array<{ id: number; name: string; leadId: number | null; visitId: number | null }>)
    .find((item) => item.name === "New Barber")!;
  expect(stop).toMatchObject({ leadId: expect.any(Number), visitId: null });

  const first = await request("POST", `/api/xpot/prospecting/routes/${created.body.route.id}/stops/${stop.id}/prepare-check-in`, {});
  expect(first.status).toBe(201);
  expect(first.body).toEqual({ leadId: expect.any(Number), visitId: expect.any(Number) });
  expect(await one(`SELECT lead_id, visit_id FROM prospecting_route_stops WHERE id = $1`, [stop.id])).toEqual({
    lead_id: first.body.leadId,
    visit_id: first.body.visitId,
  });
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits WHERE source = 'prospecting-route'`)).count).toBe(1);

  const reused = await request("POST", `/api/xpot/prospecting/routes/${created.body.route.id}/stops/${stop.id}/prepare-check-in`, {});
  expect(reused.status).toBe(200);
  expect(reused.body).toEqual(first.body);
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits WHERE source = 'prospecting-route'`)).count).toBe(1);
});

test("route details expose saved Google rating data without a live lookup", async () => {
  await q(`UPDATE prospecting_candidates SET rating_permille = 4700, review_count = 128, phone = '+15551234567', website = 'https://new.example' WHERE id = $1`, [seed.placeA]);
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const details = await request("GET", `/api/xpot/prospecting/routes/${created.body.route.id}`);
  expect(details.status).toBe(200);
  expect(details.body.stops.find((stop: any) => stop.name === "New Barber")).toMatchObject({
    googlePlaceId: "place-new",
    rating: 4.7,
    reviewCount: 128,
    phone: "+15551234567",
    website: "https://new.example",
  });
});

test("loading a legacy draft route is read-only and publishing repairs its missing lead", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const stop = created.body.stops.find((item: any) => item.name === "New Barber");
  await q(`UPDATE prospecting_route_stops SET lead_id = NULL WHERE id = $1`, [stop.id]);
  await q(`UPDATE prospecting_candidates SET lead_id = NULL WHERE id = $1`, [stop.candidateId]);
  await q(`DELETE FROM sales_lead_locations WHERE lead_id = $1`, [stop.leadId]);
  await q(`DELETE FROM sales_leads WHERE id = $1`, [stop.leadId]);

  const details = await request("GET", `/api/xpot/prospecting/routes/${created.body.route.id}`);
  expect(details.body.stops.find((item: any) => item.id === stop.id).leadId).toBeNull();
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [stop.candidateId])).lead_id).toBeNull();

  expect((await request("PATCH", `/api/xpot/prospecting/routes/${created.body.route.id}/status`, { status: "published" })).status).toBe(200);
  const repaired = await one(`SELECT lead_id, visit_id FROM prospecting_route_stops WHERE id = $1`, [stop.id]);
  expect(repaired.lead_id).toEqual(expect.any(Number));
  expect(repaired.visit_id).toEqual(expect.any(Number));
  expect((await one(`SELECT lead_id FROM prospecting_candidates WHERE id = $1`, [stop.candidateId])).lead_id).toBe(repaired.lead_id);
});

test("a draft route can be reordered locally and drops its stale Google polyline", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const original = created.body.stops as Array<{ id: number; name: string }>;
  const reversedIds = original.map((stop) => stop.id).reverse();
  await q(`UPDATE prospecting_routes SET optimization_meta = '{"encodedPolyline":"stale-google-path","trafficAware":true}' WHERE id = $1`, [created.body.route.id]);

  const reordered = await request("PATCH", `/api/xpot/prospecting/routes/${created.body.route.id}/stops/order`, { stopIds: reversedIds });
  expect(reordered).toEqual({ status: 200, body: { reordered: true } });
  const details = await request("GET", `/api/xpot/prospecting/routes/${created.body.route.id}`);
  expect(details.body.stops.map((stop: any) => stop.id)).toEqual(reversedIds);
  expect(details.body.stops[0]).toMatchObject({ position: 1, travelDurationSeconds: 0 });
  expect(details.body.route.optimizationMeta).toMatchObject({
    manuallyReordered: true,
    distanceModel: "haversine_manual",
    trafficAware: false,
  });
  expect(details.body.route.optimizationMeta).not.toHaveProperty("encodedPolyline");
});

test("a rep can build a follow-up route after finishing, up to the daily limit", async () => {
  const finish = async (routeId: number) => {
    expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "published" })).status).toBe(200);
    expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "in_progress" })).status).toBe(200);
    expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "completed" })).status).toBe(200);
  };

  const first = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const blockedByActive = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(blockedByActive).toMatchObject({ status: 200, body: { reused: true } });
  expect(blockedByActive.body.route.id).toBe(first.body.route.id);

  await finish(first.body.route.id);
  const second = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(second.status).toBe(201);
  expect(second.body.route.id).not.toBe(first.body.route.id);

  await finish(second.body.route.id);
  const third = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(third.status).toBe(201);
  await finish(third.body.route.id);

  const fourth = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(fourth.status).toBe(429);
  expect(fourth.body.message).toContain("up to 3 routes per day");
});

test("removing an unvisited stop cancels its visit and compacts the remaining route", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const routeId = created.body.route.id;
  expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "published" })).status).toBe(200);
  const target = created.body.stops.find((stop: any) => stop.name === "New Barber");
  const targetVisit = await one(`SELECT visit_id FROM prospecting_route_stops WHERE id = $1`, [target.id]);

  const removed = await request("DELETE", `/api/xpot/prospecting/routes/${routeId}/stops/${target.id}`);
  expect(removed).toEqual({ status: 200, body: { removed: true } });
  expect((await one(`SELECT status FROM sales_visits WHERE id = $1`, [targetVisit.visit_id])).status).toBe("cancelled");
  expect((await one(`SELECT status FROM prospecting_candidates WHERE id = $1`, [target.candidateId])).status).toBe("discovered");

  const details = await request("GET", `/api/xpot/prospecting/routes/${routeId}`);
  expect(details.body.stops).toHaveLength(1);
  expect(details.body.stops[0]).toMatchObject({ position: 1, travelDistanceMeters: 0, travelDurationSeconds: 0 });
  expect(details.body.route.optimizationMeta).toMatchObject({ lastManualEdit: "stop_removed", trafficAware: false });
  expect(details.body.route.optimizationMeta).not.toHaveProperty("encodedPolyline");
});

test("preparing a plaque demo reuses the route prospect and creates no visit", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const stop = created.body.stops.find((item: any) => item.name === "New Barber");
  const prepared = await request("POST", `/api/xpot/prospecting/routes/${created.body.route.id}/stops/${stop.id}/prepare-demo`, {});
  expect(prepared.status).toBe(201);
  expect(prepared.body).toMatchObject({ leadId: stop.leadId, name: "New Barber", placeId: "place-new" });
  expect((await one(`SELECT count(*)::int AS count FROM sales_visits`)).count).toBe(0);
  expect((await one(`SELECT lead_id FROM prospecting_route_stops WHERE id = $1`, [stop.id])).lead_id).toBe(prepared.body.leadId);
});

test("cancelling a published route releases its unreached visits and businesses", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const routeId = created.body.route.id;
  const leadsBeforePublish = (await one(`SELECT count(*)::int AS count FROM sales_leads`)).count;
  expect((await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "published" })).status).toBe(200);
  expect((await one(`SELECT count(*)::int AS count FROM sales_leads`)).count).toBe(leadsBeforePublish);
  const planned = await q(`SELECT id, status FROM sales_visits WHERE source = 'prospecting-route' ORDER BY id`);
  expect(planned.map((visit) => visit.status)).toEqual(["planned", "planned"]);
  expect((await one(`SELECT status FROM prospecting_candidates WHERE id = $1`, [seed.placeA])).status).toBe("scheduled");

  const cancelled = await request("PATCH", `/api/xpot/prospecting/routes/${routeId}/status`, { status: "cancelled" });
  expect(cancelled.status).toBe(200);
  expect((await q(`SELECT status FROM sales_visits WHERE source = 'prospecting-route'`)).map((visit) => visit.status))
    .toEqual(["cancelled", "cancelled"]);
  expect((await q(`SELECT status, skip_reason FROM prospecting_route_stops WHERE route_id = $1`, [routeId])))
    .toEqual([{ status: "skipped", skip_reason: "route_cancelled" }, { status: "skipped", skip_reason: "route_cancelled" }]);
  expect((await one(`SELECT status FROM prospecting_candidates WHERE id = $1`, [seed.placeA])).status).toBe("discovered");
});

test("a malformed id is a 404, not a database error", async () => {
  expect((await request("GET", "/api/xpot/prospecting/jobs/abc")).status).toBe(404);
  expect((await request("GET", "/api/xpot/prospecting/routes/1.5")).status).toBe(404);
  expect((await request("PATCH", "/api/xpot/prospecting/routes/x/stops/1", { status: "completed" })).status).toBe(404);
});

test("stop execution is refused on a route that is not running", async () => {
  const created = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  const stop = created.body.stops[0];
  const response = await request("PATCH", `/api/xpot/prospecting/routes/${created.body.route.id}/stops/${stop.id}`, { status: "completed" });
  expect(response.status).toBe(409);
});

test("a search stuck while starting frees the global queue", async () => {
  process.env.PROSPECTING_ENGINE_URL = "http://127.0.0.1:9";
  try {
    const { tickProspectingQueueSafely } = await import("../server/prospecting/queue.js");
    const job = await one(`INSERT INTO prospecting_jobs (rep_id, status, location) VALUES ($1, 'running', 'Hudson, MA') RETURNING id`, [seed.repId]);
    const { db } = await import("../server/db.js");
    const { prospectingRuns } = await import("../shared/schema.js");
    // Through Drizzle, so started_at round-trips exactly as the worker wrote it.
    const [run] = await db.insert(prospectingRuns).values({
      jobId: job.id,
      repId: seed.repId,
      status: "starting",
      niche: "barbershop",
      query: "barber shop",
      location: "Hudson, MA",
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
    }).returning({ id: prospectingRuns.id });
    await tickProspectingQueueSafely();
    expect(await one(`SELECT status, error_message FROM prospecting_runs WHERE id = $1`, [run.id])).toEqual({
      status: "failed",
      error_message: "The prospecting engine did not confirm this search. Try again.",
    });
    expect((await one(`SELECT status FROM prospecting_jobs WHERE id = $1`, [job.id])).status).toBe("failed");
  } finally {
    delete process.env.PROSPECTING_ENGINE_URL;
  }
});

test("a selling route always ends at the last visit", async () => {
  const open = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(open.body.route.endLat).toBeNull();
  expect(open.body.route.optimizationMeta.returnHome).toBe(false);

  // Turning it on needs a saved home first.
  expect((await request("PATCH", "/api/xpot/me", { routeReturnHome: true })).status).toBe(400);
  const saved = await request("PATCH", "/api/xpot/me", { home: { address: "9 Elm St, Framingham, MA", lat: 42.28, lng: -71.42 }, routeReturnHome: true });
  expect(saved.status).toBe(200);
  expect(saved.body.rep).toMatchObject({ homeAddress: "9 Elm St, Framingham, MA", homeLat: "42.28", homeLng: "-71.42", routeReturnHome: true });

  const nextRoute = await request("POST", "/api/xpot/prospecting/routes", { ...routeBody(), routeDate: "2026-10-14" });
  expect(nextRoute.status).toBe(201);
  expect(nextRoute.body.route).toMatchObject({ endAddress: null, endLat: null, endLng: null });
  expect(nextRoute.body.route.optimizationMeta.returnHome).toBe(false);

  // Removing the home turns the return off with it.
  const cleared = await request("PATCH", "/api/xpot/me", { home: null });
  expect(cleared.body.rep).toMatchObject({ homeAddress: null, homeLat: null, routeReturnHome: false });
});

test("only the platform owner can recalculate today's route", async () => {
  const first = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  await request("PATCH", `/api/xpot/prospecting/routes/${first.body.route.id}/status`, { status: "published" });

  // A rep gets the same route back, and cannot force a second optimization.
  const again = await request("POST", "/api/xpot/prospecting/routes", routeBody());
  expect(again.status).toBe(200);
  expect(again.body.route.id).toBe(first.body.route.id);
  expect((await request("POST", "/api/xpot/prospecting/routes", { ...routeBody(), rebuild: true })).status).toBe(403);

  const rebuilt = await request("POST", "/api/xpot/prospecting/routes", { ...routeBody(), rebuild: true }, { admin: true });
  expect(rebuilt.status).toBe(201);
  expect(rebuilt.body.route.id).not.toBe(first.body.route.id);
  expect(await q(`SELECT id FROM prospecting_routes`)).toEqual([{ id: rebuilt.body.route.id }]);
  // The replaced route's planned visits left the agenda.
  expect((await q(`SELECT status FROM sales_visits WHERE source = 'prospecting-route'`)).map((visit) => visit.status))
    .toEqual(["cancelled", "cancelled"]);
});
