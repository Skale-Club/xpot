import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

// Importing a Google place that is already a company in the organization
// (sales_leads_org_google_place_unique, migration 0049). The Dashboard and
// check-in searches import a picked Google result when they cannot see a
// saved match, and they only see a page of the rep's companies, so the
// server has to be the one that knows the place is already saved.

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

// Creating a lead mirrors it to Xphere in the background; keep that offline.
vi.mock("../server/routes/xpot/helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/routes/xpot/helpers.js")>()),
  syncLeadToXphere: vi.fn(async () => {}),
}));

const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

function app(userId: string) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: "Rep", isAdmin: false };
    next();
  });
  server.use("/api/xpot", createLeadsRouter());
  return server;
}

async function request(userId: string, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app(userId).listen(0, async () => {
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

const place = (googlePlaceId: string) => ({
  name: "Downtown Barber",
  source: "google_places",
  status: "prospect",
  googlePlaceId,
  primaryLocation: { label: "Main", addressLine1: "33 E Pine St", city: "Orlando", state: "FL", lat: 28.5418, lng: -81.3779, isPrimary: true },
});

let organizationId: number;

beforeEach(async () => {
  await q(`TRUNCATE sales_lead_locations, sales_leads, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Place Team', 'place-team') RETURNING id`)).id;
  for (const [userId, phone, role] of [["rep-a", "+15550000191", "admin"], ["rep-b", "+15550000192", "member"]]) {
    await q(`INSERT INTO users (id, phone, first_name) VALUES ($1, $2, 'Rep')`, [userId, phone]);
    const repId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ($1, $1, 'rep', true) RETURNING id`, [userId])).id;
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, $3)`, [organizationId, repId, role]);
  }
});

const leadCount = async () => (await one(`SELECT count(*)::int AS count FROM sales_leads`)).count;

test("importing a Google place creates the company once", async () => {
  const created = await request("rep-a", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  expect(created.status).toBe(201);
  expect(created.body.lead).toMatchObject({ name: "Downtown Barber", googlePlaceId: "ChIJ-downtown-barber" });
});

test("importing a place that is already the rep's company returns that company", async () => {
  const first = await request("rep-a", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  const again = await request("rep-a", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  expect(again.status).toBe(200);
  expect(again.body).toMatchObject({ existing: true, lead: { id: first.body.lead.id } });
  expect(await leadCount()).toBe(1);
});

test("a place saved by a rep the importer cannot see is refused clearly, not with a 500", async () => {
  await request("rep-a", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  const other = await request("rep-b", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  expect(other.status).toBe(409);
  expect(other.body).toMatchObject({ code: "lead_exists" });
  expect(other.body.lead).toBeUndefined();
  expect(await leadCount()).toBe(1);
});

test("companies without a Google place are never merged", async () => {
  const { googlePlaceId: _drop, ...manual } = place("unused");
  expect((await request("rep-a", "POST", "/api/xpot/leads", manual)).status).toBe(201);
  expect((await request("rep-a", "POST", "/api/xpot/leads", manual)).status).toBe(201);
  expect(await leadCount()).toBe(2);
});

// The check-in search asks GET /leads?search= for the rep's companies (useLeadLookup).
const lookup = async (userId: string, search: string) =>
  (await request(userId, "GET", `/api/xpot/leads?limit=8&search=${encodeURIComponent(search)}`)).body.map((lead: { name: string }) => lead.name);

test("the company lookup matches the sector, the street and the city, as the local search did", async () => {
  await request("rep-a", "POST", "/api/xpot/leads", { ...place("ChIJ-downtown-barber"), industry: "Barber shop" });
  expect(await lookup("rep-a", "downtown")).toEqual(["Downtown Barber"]);
  expect(await lookup("rep-a", "barber shop")).toEqual(["Downtown Barber"]);
  expect(await lookup("rep-a", "33 E Pine")).toEqual(["Downtown Barber"]);
  expect(await lookup("rep-a", "orlando")).toEqual(["Downtown Barber"]);
  expect(await lookup("rep-a", "tampa")).toEqual([]);
});

test("the company lookup never shows another rep's companies", async () => {
  await request("rep-a", "POST", "/api/xpot/leads", place("ChIJ-downtown-barber"));
  expect(await lookup("rep-b", "downtown")).toEqual([]);
  expect(await lookup("rep-b", "orlando")).toEqual([]);
});
