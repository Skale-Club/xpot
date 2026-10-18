// People as the one place for people, the trimmed Organizations workspace and
// the Visits overview, against the real migrations (PGlite):
//   GET /admin/team-activity      period numbers + one row per field rep
//   GET /admin/reps/:id/organizations   a person's memberships, by name
//   GET /admin/xphere/:userId     one person's Xphere connection + last sync
//   GET /organizations            personal workspaces are flagged
//   POST /organizations/:id/members   an org admin adds existing people only

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

const { createAdminRouter } = await import("../server/routes/xpot/admin.js");
const { createOrganizationsRouter } = await import("../server/routes/xpot/organizations.js");
const { ensureOrganizationForRep } = await import("../server/organizations/service.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

let phoneSeq = 0;
async function seedPerson(id: string, opts: { role?: "rep" | "manager" | "admin"; isAdmin?: boolean; modules?: string[]; active?: boolean; blocked?: boolean } = {}) {
  phoneSeq += 1;
  await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $3, $4)`, [id, `+1555700${String(phoneSeq).padStart(4, "0")}`, id, opts.isAdmin ?? false]);
  return (await one(
    `INSERT INTO sales_reps (user_id, display_name, role, is_active, modules, blocked_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [id, id, opts.role ?? "rep", opts.active ?? true, opts.modules ?? ["visits", "tags"], opts.blocked ? new Date() : null],
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
  app.use("/api/xpot", createAdminRouter());
  return app;
}

async function request(app: express.Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
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

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
let company = 0;

beforeEach(async () => {
  await q(`TRUNCATE sales_sync_events, xphere_integrations, sales_tasks, sales_opportunities_local, sales_sales, sales_visits, sales_leads,
    organization_audit_log, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  company = (await one(`INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company') RETURNING id`)).id;
});

describe("GET /admin/team-activity", () => {
  async function seedField() {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    const ana = await seedPerson("ana");
    const tagsOnly = await seedPerson("tina", { modules: ["tags"] });
    const idle = await seedPerson("ivo", { modules: ["visits"] });
    const blocked = await seedPerson("bia", { active: false, blocked: true });
    const manager = await seedPerson("mara", { role: "manager" });
    const lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Shop', $2) RETURNING id`, [company, ana])).id;
    const visit = (repId: number, at: Date, status: string, validation = "valid") =>
      q(`INSERT INTO sales_visits (rep_id, lead_id, status, checked_in_at, checked_out_at, validation_status) VALUES ($1, $2, $3, $4, $5, $6)`,
        [repId, lead, status, at, status === "in_progress" ? null : at, validation]);
    await visit(ana, daysAgo(1), "sale_made");
    await visit(ana, daysAgo(2), "in_progress", "outside_geofence");
    await visit(ana, daysAgo(3), "no_answer", "manual_override");
    await visit(ana, daysAgo(60), "completed");
    await visit(tagsOnly, daysAgo(1), "completed", "outside_geofence");
    await visit(blocked, daysAgo(1), "completed");
    // A planned visit has not happened: not counted.
    await q(`INSERT INTO sales_visits (rep_id, lead_id, status, scheduled_at) VALUES ($1, $2, 'planned', $3)`, [ana, lead, daysAgo(1)]);
    const sale = (repId: number, cents: number, at: Date, status = "completed") =>
      q(`INSERT INTO sales_sales (organization_id, lead_id, rep_id, total_cents, sold_at, status) VALUES ($1, $2, $3, $4, $5, $6)`, [company, lead, repId, cents, at, status]);
    await sale(ana, 5000, daysAgo(1));
    await sale(ana, 2500, daysAgo(40));
    await sale(ana, 9999, daysAgo(1), "cancelled");
    await sale(tagsOnly, 7000, daysAgo(1));
    await sale(manager, 1200, daysAgo(2));
    await q(`INSERT INTO sales_tasks (organization_id, rep_id, title) VALUES ($1, $2, 'Call back'), ($1, $3, 'Tags thing')`, [company, ana, tagsOnly]);
    await q(`INSERT INTO sales_opportunities_local (lead_id, rep_id, title, value) VALUES ($1, $2, 'Deal', 300)`, [lead, ana]);
    return { ana, tagsOnly, idle, blocked, manager };
  }

  it("counts the period for living Visits people only, with a row per field rep", async () => {
    const { ana, idle, manager } = await seedField();
    const res = await request(appFor("boss", true), "GET", "/api/xpot/admin/team-activity?days=30");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toMatchObject({
      // ana and ivo; the manager uses Visits but is not a field rep; tina is Tags-only; bia is blocked.
      activeReps: 2,
      visits: 3,
      finishedVisits: 2,
      locationExceptions: 2,
      salesCount: 2,
      salesTotalCents: 6200,
      visitsInProgress: 1,
      openOpportunities: 1,
      pipelineValue: 300,
      pendingTasks: 1,
    });
    const rows = res.body.reps as any[];
    expect(rows.map((r) => r.repId)).toEqual([ana, manager, idle]);
    expect(rows[0]).toMatchObject({ displayName: "ana", visits: 3, finishedVisits: 2, locationExceptions: 2, salesCount: 1, salesTotalCents: 5000 });
    expect(new Date(rows[0].lastActivityAt).getTime()).toBeGreaterThan(daysAgo(1.1).getTime());
    expect(rows[2]).toMatchObject({ displayName: "ivo", visits: 0, salesTotalCents: 0, lastActivityAt: null });
  });

  it("narrows to the period asked for", async () => {
    await seedField();
    const since = daysAgo(1.5).toISOString();
    const res = await request(appFor("boss", true), "GET", `/api/xpot/admin/team-activity?since=${encodeURIComponent(since)}`);
    expect(res.status).toBe(200);
    expect(res.body.since).toBe(since);
    expect(res.body.metrics).toMatchObject({ visits: 1, finishedVisits: 1, locationExceptions: 0, salesTotalCents: 5000 });
    // Two years back is not a period this screen offers.
    expect((await request(appFor("boss", true), "GET", "/api/xpot/admin/team-activity?days=900")).status).toBe(400);
  });

  it("is for managers", async () => {
    await seedField();
    expect((await request(appFor("mara"), "GET", "/api/xpot/admin/team-activity")).status).toBe(200);
    expect((await request(appFor("ana"), "GET", "/api/xpot/admin/team-activity")).status).toBe(403);
  });
});

describe("People › Organizations", () => {
  it("lists a person's memberships by name, with their role and the personal workspace marked", async () => {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    const ana = await seedPerson("ana");
    const personal = await ensureOrganizationForRep(ana);
    const north = (await one(`INSERT INTO organizations (name, slug) VALUES ('North', 'north') RETURNING id`)).id;
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [north, ana]);

    const res = await request(appFor("boss", true), "GET", `/api/xpot/admin/reps/${ana}/organizations`);
    expect(res.status).toBe(200);
    const byName = [...res.body].sort((a: any, b: any) => a.name.localeCompare(b.name));
    expect(byName.map((m: any) => [m.name, m.role, m.personal])).toEqual([["ana", "admin", true], ["North", "member", false]]);
    expect(byName[0].organizationId).toBe(personal);
    expect((await request(appFor("boss", true), "GET", `/api/xpot/admin/reps/9999/organizations`)).status).toBe(404);
  });

  it("an org admin neither adds people nor creates accounts; platform management adds existing people", async () => {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    const lead = await seedPerson("lia");
    const other = await seedPerson("otto");
    const team = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team', 'team') RETURNING id`)).id;
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [team, lead]);

    const app = appFor("lia");
    // Adding someone makes this their newest Organization, where their new companies land: not a Rep Admin's call.
    expect((await request(app, "POST", `/api/xpot/organizations/${team}/members`, { repId: other })).status).toBe(403);
    expect((await one(`SELECT count(*)::int AS n FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [team, other])).n).toBe(0);
    const created = await request(app, "POST", `/api/xpot/organizations/${team}/members`, { displayName: "New Person", phone: "+15557009999" });
    expect(created.status).toBe(403);
    expect((await one(`SELECT count(*)::int AS n FROM users WHERE phone = '+15557009999'`)).n).toBe(0);

    expect((await request(appFor("boss", true), "POST", `/api/xpot/organizations/${team}/members`, { repId: other })).status).toBe(201);
  });
});

describe("GET /organizations personal workspaces", () => {
  it("flags the automatic one-person workspace until someone else joins", async () => {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    const ana = await seedPerson("ana");
    const bob = await seedPerson("bob");
    const personal = await ensureOrganizationForRep(ana);
    const shared = await ensureOrganizationForRep(bob);
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [shared, ana]);
    const named = (await one(`INSERT INTO organizations (name, slug) VALUES ('North', 'north') RETURNING id`)).id;

    const res = await request(appFor("boss", true), "GET", "/api/xpot/organizations");
    expect(res.status).toBe(200);
    const byId = new Map(res.body.map((o: any) => [o.id, o]));
    expect(byId.get(personal)).toMatchObject({ personal: true, memberCount: 1 });
    expect(byId.get(shared)).toMatchObject({ personal: false, memberCount: 2 });
    expect(byId.get(named)).toMatchObject({ personal: false, memberCount: 0 });
    expect(byId.get(company)).toMatchObject({ personal: false });

    // A rep's own list carries the flag too.
    const mine = await request(appFor("ana"), "GET", "/api/xpot/organizations");
    expect(mine.body.map((o: any) => [o.id, o.personal]).sort()).toEqual([[personal, true], [shared, false]].sort());
  });
});

describe("GET /admin/xphere/:userId", () => {
  it("shows one person's connection, masked token, and their last sync", async () => {
    await seedPerson("boss", { role: "admin", isAdmin: true });
    await seedPerson("mara", { role: "manager" });
    const ana = await seedPerson("ana");
    const lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Shop', $2) RETURNING id`, [company, ana])).id;

    const empty = await request(appFor("boss", true), "GET", "/api/xpot/admin/xphere/ana");
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ repId: ana, apiKeySet: false, isEnabled: false, inboundApiKey: null, lastSync: null });

    await q(`INSERT INTO xphere_integrations (user_id, inbound_api_key, api_key, is_enabled) VALUES ('ana', 'xpot_abc123', 'xph_secret', true)`);
    await q(`INSERT INTO sales_sync_events (entity_type, entity_id, status, last_error, last_attempt_at) VALUES ('sales_lead', $1, 'failed', 'Xphere returned HTTP 401', now())`, [String(lead)]);
    const res = await request(appFor("boss", true), "GET", "/api/xpot/admin/xphere/ana");
    expect(res.body).toMatchObject({ apiKeySet: true, isEnabled: true, inboundApiKey: "xpot_abc123" });
    expect(res.body.apiKey).toBeUndefined();
    expect(res.body.lastSync).toMatchObject({ status: "failed", error: "Xphere returned HTTP 401" });

    expect((await request(appFor("mara"), "GET", "/api/xpot/admin/xphere/ana")).status).toBe(403);
    expect((await request(appFor("boss", true), "GET", "/api/xpot/admin/xphere/nobody")).status).toBe(404);
  });
});
