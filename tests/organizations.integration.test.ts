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
const { ensureOrganizationForRep } = await import("../server/organizations/service.js");

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
  it("creates a default Organization even when an import actor is not a user", async () => {
    const repId = await seedRep("new-rep");
    const organizationId = await ensureOrganizationForRep(repId, "service-import");
    const membership = await one(`SELECT role, is_active FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [organizationId, repId]);
    expect(membership).toEqual({ role: "admin", is_active: true });
  });

  it("only the platform admin can create Organizations with an initial Rep Admin", async () => {
    await seedRep("admin", "admin", true);
    const leftoverManagerId = await seedRep("manager", "manager");
    const repId = await seedRep("rep-a");

    const createdByAdmin = await request(appFor("admin", true), "POST", "/api/xpot/organizations", { name: "North Team", repAdminId: repId });
    expect(createdByAdmin.status).toBe(201);
    expect((await q(`SELECT role FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [createdByAdmin.body.id, repId]))[0]).toEqual({ role: "admin" });

    // A leftover role=manager row is a plain rep: it cannot create one, even for itself.
    const createdByManager = await request(appFor("manager"), "POST", "/api/xpot/organizations", { name: "South Team", repAdminId: leftoverManagerId });
    expect(createdByManager.status).toBe(403);
    expect(await q(`SELECT id FROM organizations WHERE name = 'South Team'`)).toEqual([]);
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
    // People join through platform management (People, or Organizations for a platform admin), not a Rep Admin.
    expect((await request(app, "POST", `/api/xpot/organizations/${own}/members`, { repId: outsiderId, membershipRole: "member" })).status).toBe(403);
    expect((await request(app, "POST", `/api/xpot/organizations/${own}/members`, { repId: outsiderId, membershipRole: "admin" })).status).toBe(403);
    await addMembership(own, memberId, "member");
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

describe("renaming an organization", () => {
  it("its owner can change the name and nothing else; an employee and an outsider cannot", async () => {
    const ownerId = await seedRep("owner");
    const employeeId = await seedRep("employee");
    await seedRep("outsider");
    const organization = await seedOrganization("Old name", "old-name");
    await addMembership(organization, ownerId, "admin");
    await addMembership(organization, employeeId, "member");
    const path = `/api/xpot/organizations/${organization}`;

    const renamed = await request(appFor("owner"), "PATCH", path, { name: "Skale Club" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Skale Club");
    expect((await request(appFor("owner"), "PATCH", path, { name: "Skale Club", isActive: false })).status).toBe(403);
    expect((await request(appFor("owner"), "PATCH", path, { printsOwnPieces: true })).status).toBe(403);
    expect((await request(appFor("employee"), "PATCH", path, { name: "Mine now" })).status).toBe(403);
    expect((await request(appFor("outsider"), "PATCH", path, { name: "Mine now" })).status).toBe(403);
    expect((await one(`SELECT name, is_active FROM organizations WHERE id = $1`, [organization]))).toEqual({ name: "Skale Club", is_active: true });
  });
});

describe("one company: migration 0081", () => {
  const migration = readFileSync(join(process.cwd(), "migrations", "0081_one_company_skale_club.sql"), "utf8");
  const insertLead = async (name: string, organizationId: number, repId: number, place: string) =>
    (await one(`INSERT INTO sales_leads (name, organization_id, owner_rep_id, google_place_id) VALUES ($1, $2, $3, $4) RETURNING id`, [name, organizationId, repId, place])).id as number;

  it("moves the owners' workspaces into Skale Club and leaves a seller's alone", async () => {
    const company = (await one(`SELECT id FROM organizations WHERE slug = 'xpot-company'`)).id as number;
    const vanildo = await seedRep("vanildo", "admin", true);
    await q(`UPDATE sales_reps SET display_name = 'Vanildo Jr' WHERE id = $1`, [vanildo]);
    await q(`UPDATE users SET first_name = 'Skale', last_name = 'Club' WHERE id = 'vanildo'`);
    const leila = await seedRep("leila", "admin", true);
    await q(`UPDATE sales_reps SET display_name = 'Leila Vala' WHERE id = $1`, [leila]);
    const seller = await seedRep("seller");
    const hisOrg = await seedOrganization("Vanildo Jr", `legacy-rep-${vanildo}`);
    const herOrg = await seedOrganization("Leila Vala", `rep-${leila}`);
    const sellerOrg = await seedOrganization("Seller", `rep-${seller}`);
    await addMembership(hisOrg, vanildo, "admin");
    await addMembership(herOrg, leila, "admin");
    await addMembership(sellerOrg, seller, "admin");
    const hisLead = await insertLead("His customer", hisOrg, vanildo, "place-1");
    const herLead = await insertLead("Her customer", herOrg, leila, "place-2");
    const sellerLead = await insertLead("Seller customer", sellerOrg, seller, "place-3");

    await pg.client.exec(migration);

    expect((await q(`SELECT slug, name FROM organizations ORDER BY id`))).toEqual([
      { slug: "xpot-company", name: "Skale Club" },
      { slug: `rep-${seller}`, name: "Seller" },
    ]);
    expect(await q(`SELECT rep_id, role FROM organization_memberships WHERE organization_id = $1 ORDER BY rep_id`, [company]))
      .toEqual([{ rep_id: vanildo, role: "admin" }, { rep_id: leila, role: "admin" }]);
    expect((await one(`SELECT organization_id FROM sales_leads WHERE id = $1`, [hisLead])).organization_id).toBe(company);
    expect((await one(`SELECT organization_id FROM sales_leads WHERE id = $1`, [herLead])).organization_id).toBe(company);
    expect((await one(`SELECT organization_id FROM sales_leads WHERE id = $1`, [sellerLead])).organization_id).toBe(sellerOrg);
    expect(await one(`SELECT first_name, last_name FROM users WHERE id = 'vanildo'`)).toEqual({ first_name: "Vanildo", last_name: "Jr" });
    expect(await one(`SELECT first_name FROM users WHERE id = 'seller'`)).toEqual({ first_name: "seller" });
    expect((await one(`SELECT detail FROM organization_audit_log WHERE action = 'organizations_merged'`)).detail.merged).toHaveLength(2);
  });

  it("fails as a whole when a customer cannot move, changing nothing", async () => {
    const vanildo = await seedRep("vanildo", "admin", true);
    const leila = await seedRep("leila", "admin", true);
    const hisOrg = await seedOrganization("Vanildo Jr", `legacy-rep-${vanildo}`);
    const herOrg = await seedOrganization("Leila Vala", `rep-${leila}`);
    await addMembership(hisOrg, vanildo, "admin");
    await addMembership(herOrg, leila, "admin");
    await insertLead("Same place", hisOrg, vanildo, "place-1");
    await insertLead("Same place", herOrg, leila, "place-1");

    await expect(pg.client.exec(`BEGIN; ${migration} COMMIT;`)).rejects.toThrow(/sales_leads_org_google_place_unique/);
    await pg.client.exec("ROLLBACK");

    expect((await q(`SELECT slug FROM organizations ORDER BY id`)).map((row) => row.slug)).toEqual(["xpot-company", `legacy-rep-${vanildo}`, `rep-${leila}`]);
  });
});
