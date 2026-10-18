import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

// The check-in endpoint end to end, against every migration: how the geofence
// decision reaches the client (the outside_geofence payload the Dashboard and
// check-in screen read to ask for a reason) and what is stored on the visit.

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

const { createVisitsRouter } = await import("../server/routes/xpot/visits.js");
const { createAuthRouter } = await import("../server/routes/xpot/auth.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId: "checkin-rep", email: "checkin-rep@x.test", firstName: "Check", isAdmin: false };
    next();
  });
  server.use("/api/xpot", createVisitsRouter());
  server.use("/api/xpot", createAuthRouter());
  return server;
}

async function request(method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app().listen(0, async () => {
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

// The shop sits at 42.300, -71.500 with the default 150 m radius.
const AT_SHOP = { lat: 42.3003, lng: -71.5001, gpsAccuracyMeters: 12 };
// About 2.2 km north: a computer locating by Wi-Fi.
const FAR_AWAY = { lat: 42.32, lng: -71.5, gpsAccuracyMeters: 1800 };

let leadId: number;

beforeEach(async () => {
  await q(`TRUNCATE sales_visits, sales_lead_locations, sales_leads, organization_memberships, organizations, sales_reps, sales_app_settings, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('checkin-rep', '+15550000177', 'Check')`);
  const repId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('checkin-rep', 'Check Rep', 'rep', true) RETURNING id`)).id;
  const organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Check Team', 'check-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [organizationId, repId]);
  leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status)
    VALUES ($1, 'Corner Barber', $2, 'prospect') RETURNING id`, [organizationId, repId])).id;
  await q(`INSERT INTO sales_lead_locations (lead_id, address_line_1, lat, lng, is_primary, geofence_radius_meters)
    VALUES ($1, '1 Main St', '42.300', '-71.500', true, 150)`, [leadId]);
});

const visitCount = async () => (await one(`SELECT count(*)::int AS count FROM sales_visits`)).count;

test("/me tells the client the organization's check-in rules", async () => {
  const me = await request("GET", "/api/xpot/me");
  expect(me.status).toBe(200);
  expect(me.body.checkInRules).toEqual({ requiresGps: true, allowManualOverride: true, defaultGeofenceRadiusMeters: 150 });
});

test("a check-in at the shop is valid", async () => {
  const response = await request("POST", "/api/xpot/visits/check-in", { leadId, ...AT_SHOP });
  expect(response.status).toBe(201);
  expect(response.body.visit).toMatchObject({ status: "in_progress", validationStatus: "valid", manualOverrideReason: null });
});

test("outside the radius without a reason is refused with what the client needs to ask for one", async () => {
  const response = await request("POST", "/api/xpot/visits/check-in", { leadId, ...FAR_AWAY });
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    code: "outside_geofence",
    allowedRadiusMeters: 150,
    accuracyMeters: 1800,
    overrideAllowed: true,
  });
  expect(response.body.distanceMeters).toBeGreaterThan(2000);
  expect(response.body.distanceMeters).toBeLessThan(2400);
  expect(await visitCount()).toBe(0);
});

test("outside the radius with a reason starts the visit as a manual override and keeps the reason", async () => {
  const reason = "I'm on site, the device location is imprecise";
  const response = await request("POST", "/api/xpot/visits/check-in", { leadId, ...FAR_AWAY, manualOverrideReason: reason });
  expect(response.status).toBe(201);
  expect(response.body.visit).toMatchObject({ validationStatus: "manual_override", manualOverrideReason: reason, gpsAccuracyMeters: 1800 });
  expect(response.body.visit.distanceFromTargetMeters).toBeGreaterThan(2000);
});

test("with overrides switched off, a reason no longer gets past the radius", async () => {
  await request("GET", "/api/xpot/me"); // creates the settings row
  await q(`UPDATE sales_app_settings SET allow_manual_override = false`);
  const response = await request("POST", "/api/xpot/visits/check-in", { leadId, ...FAR_AWAY, manualOverrideReason: "please" });
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ code: "outside_geofence", overrideAllowed: false });
  expect(await visitCount()).toBe(0);
});

test("a computer without location checks in with a reason as a manual override", async () => {
  const response = await request("POST", "/api/xpot/visits/check-in", { leadId, manualOverrideReason: "Checking in from a computer without location" });
  expect(response.status).toBe(201);
  expect(response.body.visit).toMatchObject({ validationStatus: "manual_override", checkInLat: null, checkInLng: null });
});

test("a second check-in while a visit is open is refused", async () => {
  expect((await request("POST", "/api/xpot/visits/check-in", { leadId, ...AT_SHOP })).status).toBe(201);
  const second = await request("POST", "/api/xpot/visits/check-in", { leadId, ...AT_SHOP });
  expect(second.status).toBe(409);
  expect(await visitCount()).toBe(1);
});
