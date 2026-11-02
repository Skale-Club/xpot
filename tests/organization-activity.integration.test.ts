// An organization's Overview counts the work done on ITS companies (GET /organizations/:id/activity), not the sum of
// what its members did in every organization. Against the real migrations (PGlite): an owner of two organizations gets
// each one's own visits and sales, and a sale by someone who is not on the team still counts for the organization
// whose company it was.

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

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

const { createOrganizationsRouter } = await import("../server/routes/xpot/organizations.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

let phoneSeq = 0;
async function seedPerson(id: string, opts: { role?: "rep" | "admin"; isAdmin?: boolean; modules?: string[] } = {}) {
  phoneSeq += 1;
  await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $3, $4)`, [id, `+1555800${String(phoneSeq).padStart(4, "0")}`, id, opts.isAdmin ?? false]);
  return (await one(
    `INSERT INTO sales_reps (user_id, display_name, role, is_active, modules) VALUES ($1, $2, $3, true, $4) RETURNING id`,
    [id, id, opts.role ?? "rep", opts.modules ?? ["visits", "tags"]],
  )).id as number;
}

function appFor(userId: string, isAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin };
    next();
  });
  app.use("/api/xpot", createOrganizationsRouter());
  return app;
}

async function get(app: express.Express, path: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        resolve({ status: response.status, body: await response.json() });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const since = () => encodeURIComponent(daysAgo(30).toISOString());

beforeEach(async () => {
  await q(`TRUNCATE sales_sync_events, xphere_integrations, sales_tasks, sales_opportunities_local, sales_sales, sales_visits, sales_leads,
    organization_audit_log, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company')`);
});

describe("GET /organizations/:id/activity", () => {
  it("counts the work on the organization's own companies, whoever did it", async () => {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    const tomas = await seedPerson("tomas");
    const kevin = await seedPerson("kevin", { modules: ["tags"] });
    const coast = (await one(`INSERT INTO organizations (name, slug) VALUES ('Coastline', 'coast') RETURNING id`)).id;
    const lind = (await one(`INSERT INTO organizations (name, slug) VALUES ('Lindgren', 'lind') RETURNING id`)).id;
    // Tomas owns both; Kevin is only Lindgren's, and only uses Tags.
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin'), ($3, $2, 'admin'), ($3, $4, 'member')`, [coast, tomas, lind, kevin]);
    const taqueria = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Taqueria', $2) RETURNING id`, [coast, tomas])).id;
    const hardware = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Hardware', $2) RETURNING id`, [lind, kevin])).id;
    const visit = (repId: number, leadId: number, status: string) =>
      q(`INSERT INTO sales_visits (rep_id, lead_id, status, checked_in_at, checked_out_at) VALUES ($1, $2, $3, $4, $4)`, [repId, leadId, status, daysAgo(2)]);
    const sale = (organizationId: number, leadId: number, repId: number, cents: number) =>
      q(`INSERT INTO sales_sales (organization_id, lead_id, rep_id, total_cents, sold_at, status) VALUES ($1, $2, $3, $4, $5, 'completed')`, [organizationId, leadId, repId, cents, daysAgo(1)]);
    for (let i = 0; i < 3; i++) await visit(tomas, taqueria, "completed");
    await visit(tomas, taqueria, "in_progress");
    await visit(kevin, hardware, "completed");
    await sale(coast, taqueria, tomas, 39900);
    await sale(lind, hardware, kevin, 14900);

    const coastline = await get(appFor("tomas"), `/api/xpot/organizations/${coast}/activity?since=${since()}`);
    expect(coastline.status).toBe(200);
    expect(coastline.body.metrics).toMatchObject({ visits: 4, finishedVisits: 3, salesCount: 1, salesTotalCents: 39900 });
    expect(coastline.body.reps.map((r: any) => r.displayName)).toEqual(["tomas"]);

    // Lindgren gets its own: Kevin's visit and sale (he only uses Tags, and still worked its company), not Tomas's.
    const lindgren = await get(appFor("tomas"), `/api/xpot/organizations/${lind}/activity?since=${since()}`);
    expect(lindgren.body.metrics).toMatchObject({ visits: 1, finishedVisits: 1, salesCount: 1, salesTotalCents: 14900 });
    expect(lindgren.body.reps.map((r: any) => [r.displayName, r.visits, r.salesCount])).toEqual([["kevin", 1, 1]]);

    // The platform sees the same numbers.
    const platform = await get(appFor("boss", true), `/api/xpot/organizations/${lind}/activity?since=${since()}`);
    expect(platform.body.metrics.salesTotalCents).toBe(14900);
  });
});
