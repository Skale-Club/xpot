import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// "Add person": an owner (or the platform) adds someone by name and phone. Same
// in-memory Postgres as organizations.integration.test.ts.

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
const { organizationIdForRep } = await import("../server/organizations/service.js");
const { runsATeam } = await import("../shared/organizations.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

let phoneSeed = 0;
const nextPhone = () => `+1508555${String(1000 + phoneSeed++)}`;

async function seedRep(id: string, options: { admin?: boolean; phone?: string; active?: boolean; modules?: string[] } = {}) {
  const phone = options.phone ?? nextPhone();
  await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $3, $4)`, [id, phone, id, !!options.admin]);
  const modules = options.modules ?? ["visits", "tags"];
  const repId = (await one(
    `INSERT INTO sales_reps (user_id, display_name, role, is_active, modules) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [id, id, options.admin ? "admin" : "rep", options.active ?? true, modules],
  )).id as number;
  return { repId, phone };
}

async function seedOrganization(name: string, slug: string) {
  return (await one(`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`, [name, slug])).id as number;
}

async function addMembership(organizationId: number, repId: number, role: "admin" | "member") {
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, $3)`, [organizationId, repId, role]);
}

/** What /api/xpot/me tells the client for someone's organizations, as far as runsATeam reads it. */
async function organizationsOf(repId: number) {
  return (await q(
    `SELECT o.slug, m.role AS "membershipRole",
            (SELECT count(*)::int FROM organization_memberships c WHERE c.organization_id = o.id) AS "memberCount",
            (SELECT min(c.rep_id) FROM organization_memberships c WHERE c.organization_id = o.id) AS "soleMemberRepId"
       FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.rep_id = $1 AND m.is_active AND m.blocked_at IS NULL`, [repId]))
    .map((row) => ({ membershipRole: row.membershipRole, personal: /^rep-(\d+)$/.test(row.slug) && row.memberCount === 1 && row.soleMemberRepId === Number(row.slug.slice(4)) }));
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

const people = (organizationId: number) => `/api/xpot/organizations/${organizationId}/people`;
const membershipOf = (organizationId: number, repId: number) =>
  one(`SELECT role, is_active FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2`, [organizationId, repId]);

beforeAll(async () => {
  expect(pg.client).toBeTruthy();
});

beforeEach(async () => {
  await q(`TRUNCATE organization_audit_log, organization_memberships, organizations, sales_reps, users RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company')`);
});

describe("POST /organizations/:id/people", () => {
  it("an owner adds a new phone: an account is made and the person joins as an employee", async () => {
    const owner = await seedRep("owner", { modules: ["tags"] });
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");

    const phone = "+1 (508) 555-0199";
    const added = await request(appFor("owner"), "POST", people(team), { phone, firstName: "Ana", lastName: "Souza" });
    expect(added.status).toBe(201);
    expect(added.body.createdAccount).toBe(true);

    const account = await one(
      `SELECT u.phone, u.is_admin, r.id, r.display_name, r.role, r.is_active, r.modules FROM users u JOIN sales_reps r ON r.user_id = u.id WHERE u.phone = $1`,
      ["+15085550199"],
    );
    expect(account).toMatchObject({ is_admin: false, display_name: "Ana Souza", role: "rep", is_active: true, modules: ["tags"] });
    expect(await membershipOf(team, account.id)).toEqual({ role: "member", is_active: true });
    // No workspace of their own: their records land in the team.
    expect(await q(`SELECT 1 FROM organizations WHERE slug = $1`, [`rep-${account.id}`])).toEqual([]);
    expect(await organizationIdForRep(account.id)).toBe(team);

    const log = await one(`SELECT action, detail FROM organization_audit_log WHERE organization_id = $1 AND target_rep_id = $2`, [team, account.id]);
    expect(log.action).toBe("member_added");
    expect(log.detail).toMatchObject({ role: "member", source: "phone", createdAccount: true });
  });

  it("an owner adds someone who sells alone: they join, and their empty workspace stops being where new records land", async () => {
    const owner = await seedRep("owner");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    const solo = await seedRep("solo");
    const workspace = await seedOrganization("solo", `rep-${solo.repId}`);
    await addMembership(workspace, solo.repId, "admin");

    const added = await request(appFor("owner"), "POST", people(team), { phone: solo.phone, firstName: "Solo" });
    expect(added.status).toBe(201);
    expect(added.body.createdAccount).toBe(false);
    expect(await membershipOf(team, solo.repId)).toEqual({ role: "member", is_active: true });
    expect(await membershipOf(workspace, solo.repId)).toEqual({ role: "admin", is_active: false });
    expect(await organizationIdForRep(solo.repId)).toBe(team);
  });

  it("keeps the workspace of someone who sells alone when it holds their pieces", async () => {
    const owner = await seedRep("owner");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    const solo = await seedRep("solo");
    const workspace = await seedOrganization("solo", `rep-${solo.repId}`);
    await addMembership(workspace, solo.repId, "admin");
    await q(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'My customer', $2)`, [workspace, solo.repId]);

    expect((await request(appFor("owner"), "POST", people(team), { phone: solo.phone, firstName: "Solo" })).status).toBe(201);
    expect(await membershipOf(workspace, solo.repId)).toEqual({ role: "admin", is_active: true });
    // The newest membership is where new records go.
    expect(await organizationIdForRep(solo.repId)).toBe(team);
  });

  it("refuses someone who already works in another real organization", async () => {
    const owner = await seedRep("owner");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    const other = await seedOrganization("South Team", "south-team");
    const south = await seedRep("south-owner");
    const employee = await seedRep("employee");
    await addMembership(other, south.repId, "admin");
    await addMembership(other, employee.repId, "member");

    const refused = await request(appFor("owner"), "POST", people(team), { phone: employee.phone, firstName: "Emp" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("person_in_other_organization");
    expect(await membershipOf(team, employee.repId)).toBeUndefined();
    expect(await membershipOf(other, employee.repId)).toEqual({ role: "member", is_active: true });
  });

  it("refuses a platform admin, a blocked person, and someone already in the organization", async () => {
    const owner = await seedRep("owner");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    const platform = await seedRep("platform", { admin: true });
    const blocked = await seedRep("blocked");
    await q(`UPDATE sales_reps SET blocked_at = now(), is_active = false WHERE id = $1`, [blocked.repId]);
    const member = await seedRep("member");
    await addMembership(team, member.repId, "member");
    const app = appFor("owner");

    expect((await request(app, "POST", people(team), { phone: platform.phone, firstName: "P" })).body.code).toBe("person_is_platform_admin");
    expect((await request(app, "POST", people(team), { phone: blocked.phone, firstName: "B" })).body.code).toBe("person_not_active");
    const again = await request(app, "POST", people(team), { phone: member.phone, firstName: "M" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("organization_member_exists");
    expect((await request(app, "POST", people(team), { phone: "12", firstName: "X" })).status).toBe(400);
  });

  it("an employee cannot add people", async () => {
    const owner = await seedRep("owner");
    const employee = await seedRep("employee");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    await addMembership(team, employee.repId, "member");

    const refused = await request(appFor("employee"), "POST", people(team), { phone: nextPhone(), firstName: "New" });
    expect(refused.status).toBe(403);
    expect(await q(`SELECT 1 FROM users WHERE first_name IS NULL OR first_name = 'New'`)).toEqual([]);
  });

  it("another organization's owner cannot add people here", async () => {
    const owner = await seedRep("owner");
    const stranger = await seedRep("stranger");
    const team = await seedOrganization("North Team", "north-team");
    const elsewhere = await seedOrganization("South Team", "south-team");
    await addMembership(team, owner.repId, "admin");
    await addMembership(elsewhere, stranger.repId, "admin");

    const refused = await request(appFor("stranger"), "POST", people(team), { phone: nextPhone(), firstName: "New" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("organization_access_denied");
  });

  it("an owner cannot make an owner; the platform can", async () => {
    const owner = await seedRep("owner");
    const employee = await seedRep("employee");
    await seedRep("platform", { admin: true });
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    await addMembership(team, employee.repId, "member");
    const ownerApp = appFor("owner");

    // Through the new route, the old one, and the role change.
    const viaPeople = await request(ownerApp, "POST", people(team), { phone: nextPhone(), firstName: "New", membershipRole: "admin" });
    expect(viaPeople.status).toBe(403);
    expect(viaPeople.body.code).toBe("owner_grant_platform_only");
    const outsider = await seedRep("outsider");
    const viaMembers = await request(ownerApp, "POST", `/api/xpot/organizations/${team}/members`, { repId: outsider.repId, membershipRole: "admin" });
    expect(viaMembers.status).toBe(403);
    expect(viaMembers.body.code).toBe("owner_grant_platform_only");
    const viaPatch = await request(ownerApp, "PATCH", `/api/xpot/organizations/${team}/members/${employee.repId}`, { role: "admin" });
    expect(viaPatch.status).toBe(403);
    expect(viaPatch.body.code).toBe("owner_grant_platform_only");
    expect(await membershipOf(team, employee.repId)).toEqual({ role: "member", is_active: true });

    const platformApp = appFor("platform", true);
    const granted = await request(platformApp, "PATCH", `/api/xpot/organizations/${team}/members/${employee.repId}`, { role: "admin" });
    expect(granted.status).toBe(200);
    expect(await membershipOf(team, employee.repId)).toEqual({ role: "admin", is_active: true });
    expect((await request(platformApp, "POST", people(team), { phone: nextPhone(), firstName: "Second", membershipRole: "admin" })).status).toBe(201);
  });

  it("an owner still suspends and removes employees, never another owner", async () => {
    const owner = await seedRep("owner");
    const second = await seedRep("second-owner");
    const employee = await seedRep("employee");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    await addMembership(team, second.repId, "admin");
    await addMembership(team, employee.repId, "member");
    const app = appFor("owner");
    const member = (repId: number) => `/api/xpot/organizations/${team}/members/${repId}`;

    expect((await request(app, "PATCH", member(employee.repId), { blockedReason: "Paused" })).status).toBe(200);
    expect((await request(app, "PATCH", member(second.repId), { blockedReason: "Paused" })).body.code).toBe("organization_admin_change");
    expect((await request(app, "DELETE", member(second.repId))).status).toBe(403);
    expect((await request(app, "DELETE", member(owner.repId))).body.code).toBe("organization_own_access");
    expect((await request(app, "DELETE", member(employee.repId))).status).toBe(200);
  });

  it("someone selling alone adds a person, and the owner's panel appears", async () => {
    const solo = await seedRep("solo");
    const workspace = await seedOrganization("solo", `rep-${solo.repId}`);
    await addMembership(workspace, solo.repId, "admin");
    expect(runsATeam(await organizationsOf(solo.repId))).toBe(false);

    const added = await request(appFor("solo"), "POST", people(workspace), { phone: nextPhone(), firstName: "Spouse" });
    expect(added.status).toBe(201);
    expect(runsATeam(await organizationsOf(solo.repId))).toBe(true);
    const spouse = await one(`SELECT rep_id FROM organization_memberships WHERE organization_id = $1 AND role = 'member'`, [workspace]);
    expect(await organizationIdForRep(spouse.rep_id)).toBe(workspace);
  });

  it("keeps the old by-id route to the platform", async () => {
    const owner = await seedRep("owner");
    const outsider = await seedRep("outsider");
    const team = await seedOrganization("North Team", "north-team");
    await addMembership(team, owner.repId, "admin");
    await seedRep("platform", { admin: true });

    const byOwner = await request(appFor("owner"), "POST", `/api/xpot/organizations/${team}/members`, { repId: outsider.repId, membershipRole: "member" });
    expect(byOwner.status).toBe(403);
    expect(byOwner.body.code).toBe("organization_add_people");
    expect((await request(appFor("platform", true), "POST", `/api/xpot/organizations/${team}/members`, { repId: outsider.repId, membershipRole: "member" })).status).toBe(201);
  });
});
