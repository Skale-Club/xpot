import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));
const google = vi.hoisted(() => ({ enabled: false }));

vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(dir, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

vi.mock("../server/routes/xpot/google.js", () => ({ resolveGoogleApiKey: async () => google.enabled ? "test-key" : undefined }));

const { finishVisitTransaction, generateDailyRoute, markRouteStopInProgress, markVisitRouteStop, startRouteVisit, updateRouteStop } = await import("../server/daily-routes.js");
const { saveVisitSummaryTransaction } = await import("../server/visit-summary.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

beforeAll(() => expect(pg.client).toBeTruthy());

beforeEach(async () => {
  google.enabled = false;
  vi.unstubAllGlobals();
  await q(`TRUNCATE sales_user_notifications, sales_route_generation_attempts, sales_daily_route_stops, sales_daily_routes,
    sales_visit_notes, sales_visits, sales_lead_locations, sales_leads, organization_memberships, organizations, sales_reps, users
    RESTART IDENTITY CASCADE`);
});

async function seedRoute() {
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('rep-route', '+15550001111', 'Route')`);
  const rep = await one(`INSERT INTO sales_reps (user_id, display_name, is_active) VALUES ('rep-route', 'Route Rep', true) RETURNING id`);
  const organization = await one(`INSERT INTO organizations (name, slug) VALUES ('Route Org', 'route-org') RETURNING id`);
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [organization.id, rep.id]);
  const lead = await one(`INSERT INTO sales_leads (organization_id, owner_rep_id, name, industry, status)
    VALUES ($1, $2, 'Sharp Barbers', 'Barbershops', 'prospect') RETURNING id`, [organization.id, rep.id]);
  const location = await one(`INSERT INTO sales_lead_locations (lead_id, address_line_1, city, state, lat, lng, is_primary)
    VALUES ($1, '10 Main St', 'Framingham', 'MA', '42.2793', '-71.4162', true) RETURNING id`, [lead.id]);
  const route = await one(`INSERT INTO sales_daily_routes
    (organization_id, rep_id, route_date, timezone, industry, city, start_time, duration_minutes, status, generation_stage, idempotency_key)
    VALUES ($1, $2, '2026-10-12', 'America/New_York', 'Barbershops', 'Framingham', '09:00', 240, 'queued', 'queued', $3)
    RETURNING id, version`, [organization.id, rep.id, "route-key"]);
  await q(`INSERT INTO sales_route_generation_attempts (route_id, version, idempotency_key, status)
    VALUES ($1, $2, 'route-key', 'queued')`, [route.id, route.version]);
  return { repId: rep.id as number, leadId: lead.id as number, locationId: location.id as number, routeId: route.id as number };
}

describe("daily route persistence", () => {
  it("builds a ready route from saved prospects when the paid provider is unavailable", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);

    const route = await one(`SELECT status, generation_stage FROM sales_daily_routes WHERE id = $1`, [seeded.routeId]);
    const stops = await q(`SELECT lead_id, location_id, status FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const attempt = await one(`SELECT status, credit_units FROM sales_route_generation_attempts WHERE route_id = $1`, [seeded.routeId]);
    const notification = await one(`SELECT type FROM sales_user_notifications WHERE rep_id = $1`, [seeded.repId]);

    expect(route).toMatchObject({ status: "ready", generation_stage: "ready" });
    expect(stops).toEqual([{ lead_id: seeded.leadId, location_id: seeded.locationId, status: "planned" }]);
    expect(attempt).toMatchObject({ status: "ready", credit_units: 0 });
    expect(notification.type).toBe("daily_route_ready");
  });

  it("keeps one route per rep and day at the database boundary", async () => {
    const seeded = await seedRoute();
    await expect(q(`INSERT INTO sales_daily_routes
      (organization_id, rep_id, route_date, timezone, industry, city, start_time, duration_minutes, idempotency_key)
      SELECT organization_id, rep_id, route_date, timezone, industry, city, start_time, duration_minutes, 'another-key'
      FROM sales_daily_routes WHERE id = $1`, [seeded.routeId])).rejects.toThrow();
  });

  it("moves a route stop through check-in, summary and route completion", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);
    const stop = await one(`SELECT id FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const visit = await one(`INSERT INTO sales_visits (rep_id, lead_id, location_id, status, checked_in_at)
      VALUES ($1, $2, $3, 'in_progress', now()) RETURNING id`, [seeded.repId, seeded.leadId, seeded.locationId]);

    await markRouteStopInProgress(stop.id, visit.id);
    expect((await one(`SELECT status FROM sales_daily_routes WHERE id = $1`, [seeded.routeId])).status).toBe("active");
    await markVisitRouteStop(visit.id, "summary_pending");
    expect((await one(`SELECT status FROM sales_daily_route_stops WHERE id = $1`, [stop.id])).status).toBe("summary_pending");
    await markVisitRouteStop(visit.id, "visited");
    expect((await one(`SELECT status FROM sales_daily_routes WHERE id = $1`, [seeded.routeId])).status).toBe("completed");
  });

  it("never assigns another representative's lead to the generated route", async () => {
    const seeded = await seedRoute();
    const otherUser = await one(`INSERT INTO users (id, phone, first_name) VALUES ('other-route', '+15550002222', 'Other') RETURNING id`);
    const otherRep = await one(`INSERT INTO sales_reps (user_id, display_name, is_active) VALUES ($1, 'Other Rep', true) RETURNING id`, [otherUser.id]);
    const organization = await one(`SELECT organization_id FROM sales_daily_routes WHERE id = $1`, [seeded.routeId]);
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [organization.organization_id, otherRep.id]);
    await q(`INSERT INTO sales_leads (organization_id, owner_rep_id, name, industry, status, google_place_id)
      VALUES ($1, $2, 'Shared Place', 'Barbershops', 'prospect', 'place-shared-123')`, [organization.organization_id, otherRep.id]);

    google.enabled = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes("computeRoutes")
        ? { routes: [{ legs: [{ duration: "300s" }], polyline: { encodedPolyline: "route-line" } }] }
        : { places: [{ id: "place-shared-123", displayName: { text: "Shared Place" }, formattedAddress: "20 Main St, Framingham, MA", location: { latitude: 42.28, longitude: -71.42 }, userRatingCount: 50 }] },
    ), { status: 200, headers: { "Content-Type": "application/json" } })));

    await generateDailyRoute(seeded.routeId);
    const stop = await one(`SELECT l.owner_rep_id FROM sales_daily_route_stops s JOIN sales_leads l ON l.id = s.lead_id
      WHERE s.route_id = $1 ORDER BY s.sequence LIMIT 1`, [seeded.routeId]);
    expect(stop.owner_rep_id).toBe(seeded.repId);
  });

  it("resumes from a persisted paid-provider checkpoint without calling Google again", async () => {
    const seeded = await seedRoute();
    const checkpoint = {
      places: [{
        placeId: "checkpoint-place-123",
        name: "Checkpoint Barber",
        address: "30 Main St, Framingham, MA",
        industry: "Barbershops",
        lat: 42.281,
        lng: -71.421,
        reviewCount: 40,
      }],
      placesCreditUnits: 1,
    };
    await q(`UPDATE sales_route_generation_attempts
      SET provider_payload = $1, provider_completed_at = now(), credit_units = 1
      WHERE route_id = $2`, [JSON.stringify(checkpoint), seeded.routeId]);
    google.enabled = true;
    const providerCall = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("places.googleapis.com")) throw new Error("completed Places request must not be repeated");
      return new Response(JSON.stringify({ routes: [{ legs: [{ duration: "180s" }], polyline: { encodedPolyline: "route-line" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", providerCall);

    await generateDailyRoute(seeded.routeId);

    expect(providerCall.mock.calls.some(([url]) => String(url).includes("places.googleapis.com"))).toBe(false);
    expect((await one(`SELECT status FROM sales_daily_routes WHERE id = $1`, [seeded.routeId])).status).toBe("ready");
  });

  it("creates one visit and claims the stop atomically", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);
    const stop = await one(`SELECT id FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const input = {
      repId: seeded.repId,
      leadId: seeded.leadId,
      locationId: seeded.locationId,
      stopId: stop.id as number,
      validationStatus: "valid" as const,
      checkedInAt: new Date("2026-10-12T14:00:00.000Z"),
    };

    await startRouteVisit(input);
    await expect(startRouteVisit(input)).rejects.toMatchObject({ code: "route_stop_unavailable" });

    expect((await one(`SELECT count(*)::int AS count FROM sales_visits WHERE rep_id = $1`, [seeded.repId])).count).toBe(1);
    expect((await one(`SELECT status FROM sales_daily_route_stops WHERE id = $1`, [stop.id])).status).toBe("in_progress");
  });

  it("finishes the visit and advances its route stop in the same transaction", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);
    const stop = await one(`SELECT id FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const visit = await startRouteVisit({
      repId: seeded.repId,
      leadId: seeded.leadId,
      locationId: seeded.locationId,
      stopId: stop.id,
      validationStatus: "valid",
      checkedInAt: new Date("2026-10-12T14:00:00.000Z"),
    });
    await finishVisitTransaction({
      visitId: visit.id,
      leadId: seeded.leadId,
      status: "completed",
      checkedOutAt: new Date("2026-10-12T14:20:00.000Z"),
      durationSeconds: 1200,
      routeStopStatus: "summary_pending",
      updateLeadLastVisit: true,
    });
    expect((await one(`SELECT status FROM sales_visits WHERE id = $1`, [visit.id])).status).toBe("completed");
    expect((await one(`SELECT status FROM sales_daily_route_stops WHERE id = $1`, [stop.id])).status).toBe("summary_pending");
  });

  it("reorders two stops without violating the unique route sequence", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);
    const first = await one(`SELECT * FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const second = await one(`INSERT INTO sales_daily_route_stops
      (route_id, version, sequence, lead_id, location_id, name_snapshot, status)
      VALUES ($1, $2, 2, $3, $4, 'Second stop', 'planned') RETURNING id`,
      [seeded.routeId, first.version, seeded.leadId, seeded.locationId]);

    await expect(updateRouteStop(seeded.repId, first.id, { sequence: 2 })).resolves.toMatchObject({ sequence: 2 });
    expect((await one(`SELECT sequence FROM sales_daily_route_stops WHERE id = $1`, [second.id])).sequence).toBe(1);
  });

  it("saves contact, task, summary and route completion idempotently", async () => {
    const seeded = await seedRoute();
    await generateDailyRoute(seeded.routeId);
    const stop = await one(`SELECT id FROM sales_daily_route_stops WHERE route_id = $1`, [seeded.routeId]);
    const visit = await startRouteVisit({ repId: seeded.repId, leadId: seeded.leadId, locationId: seeded.locationId, stopId: stop.id, validationStatus: "valid", checkedInAt: new Date() });
    await finishVisitTransaction({ visitId: visit.id, leadId: seeded.leadId, status: "completed", checkedOutAt: new Date(), durationSeconds: 300, routeStopStatus: "summary_pending", updateLeadLastVisit: true });
    const input = {
      attendeeName: "Anthony",
      summary: "Asked for a proposal",
      outcome: "Interested",
      nextStep: "Return Friday",
      followUpRequired: true,
      quickTask: { title: "Bring proposal", priority: "high" as const, type: "return_visit" as const },
    };

    await saveVisitSummaryTransaction({ repId: seeded.repId, visitId: visit.id, leadId: seeded.leadId, input });
    await saveVisitSummaryTransaction({ repId: seeded.repId, visitId: visit.id, leadId: seeded.leadId, input });

    expect((await one(`SELECT count(*)::int AS count FROM sales_tasks WHERE visit_id = $1`, [visit.id])).count).toBe(1);
    expect((await one(`SELECT count(*)::int AS count FROM sales_lead_contacts WHERE lead_id = $1 AND name = 'Anthony'`, [seeded.leadId])).count).toBe(1);
    expect((await one(`SELECT status FROM sales_daily_routes WHERE id = $1`, [seeded.routeId])).status).toBe("completed");
  });
});
