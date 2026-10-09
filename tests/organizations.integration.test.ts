import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

async function seedRep(id: string, role: "rep" | "manager" | "admin" = "rep", isAdmin = false) {
  await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $3, $4)`, [id, `+1555${id.padEnd(7, "0").slice(0, 7)}`, id, isAdmin]);
  return (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ($1, $2, $3, true) RETURNING id`, [id, id, role])).id as number;
}

async function seedOrganization(name: string, slug: string) {
  return (await one(`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`, [name, slug])).id as number;
}

async function addMembership(organizationId: number, repId: number, role: "admin" | "member") {
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, $3)`, [organizationId, repId, role]);
}

function appFor(userId: string, isAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin };
    next();
  });
  app.use("/api/xpot", createOrganizationsRouter());
  app.use("/api/xpot", createLeadsRouter());
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

beforeAll(async () => {
  expect(pg.client).toBeTruthy();
});

beforeEach(async () => {
  await q(`TRUNCATE organization_audit_log, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company')`);
});

describe("Organizations API authorization", () => {
  it("Admin and Manager can create Organizations with an initial Rep Admin", async () => {
    await seedRep("admin", "admin", true);
    const managerId = await seedRep("manager", "manager");
    const repId = await seedRep("rep-a");

    const createdByAdmin = await request(appFor("admin", true), "POST", "/api/xpot/organizations", { name: "North Team", repAdminId: repId });
    expect(createdByAdmin.status).toBe(201);
    expect((await q(`SELECT role FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [createdByAdmin.body.id, repId]))[0]).toEqual({ role: "admin" });

    const createdByManager = await request(appFor("manager"), "POST", "/api/xpot/organizations", { name: "South Team", repAdminId: managerId });
    expect(createdByManager.status).toBe(201);
  });

  it("Rep Admin manages members only in their own Organization", async () => {
    const repAdminId = await seedRep("rep-admin");
    const memberId = await seedRep("member");
    const outsiderId = await seedRep("outsider");
    const own = await seedOrganization("Own", "own");
    const other = await seedOrganization("Other", "other");
    await addMembership(own, repAdminId, "admin");
    await addMembership(other, outsiderId, "admin");
    const [otherLead] = await q(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Other customer', $2) RETURNING id`, [other, outsiderId]);

    const app = appFor("rep-admin");
    expect((await request(app, "POST", `/api/xpot/organizations/${own}/members`, { repId: memberId, membershipRole: "member" })).status).toBe(201);
    expect((await request(app, "POST", `/api/xpot/organizations/${own}/members`, { repId: outsiderId, membershipRole: "admin" })).status).toBe(403);
    expect((await request(app, "GET", `/api/xpot/organizations/${other}`)).status).toBe(403);
    expect((await request(app, "GET", `/api/xpot/leads/${otherLead.id}`)).status).toBe(403);

    expect((await request(app, "PATCH", `/api/xpot/organizations/${own}/members/${memberId}`, { blockedReason: "Paused" })).status).toBe(200);
    const membership = await one(`SELECT is_active, blocked_reason FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [own, memberId]);
    expect(membership).toEqual({ is_active: false, blocked_reason: "Paused" });
  });

  it("a regular Rep can view assigned data but cannot manage the team", async () => {
    const memberId = await seedRep("member");
    const otherId = await seedRep("other");
    const organizationId = await seedOrganization("Team", "team");
    await addMembership(organizationId, memberId, "member");
    const app = appFor("member");

    expect((await request(app, "GET", `/api/xpot/organizations/${organizationId}`)).status).toBe(200);
    expect((await request(app, "POST", `/api/xpot/organizations/${organizationId}/members`, { repId: otherId, membershipRole: "member" })).status).toBe(403);
  });
});
