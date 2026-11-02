import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// The "Open deals" tile of Team results and the Deals list it opens count the same deals, for the platform's owner and
// for an Organization's owner. And whoever sees a teammate's deal in that list can save it: the person's own deal, the
// platform's, and the owner of the Organization the company belongs to, as for tasks, sales and consignments.

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

const { createTeamResultsRouter } = await import("../server/routes/xpot/teamActivity.js");
const { createOpportunitiesRouter } = await import("../server/routes/xpot/opportunities.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

type Person = "boss" | "owner" | "mate" | "reseller" | "outsider";
const ADMINS: Person[] = ["boss"];

async function request(as: Person, method: string, path: string, body?: unknown) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId: as, email: `${as}@x.test`, firstName: as, isAdmin: ADMINS.includes(as) };
    next();
  });
  server.use("/api/xpot", createTeamResultsRouter());
  server.use("/api/xpot", createOpportunitiesRouter());
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: { "content-type": "application/json", "x-xpot-view": "manage" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        resolve({ status: response.status, body: text ? JSON.parse(text) : null });
      } catch (error) {
        reject(error);
      } finally {
        listener.close();
      }
    });
  });
}

const deals = new Map<string, number>();

beforeAll(async () => {
  const reps: Record<string, number> = {};
  for (const [index, person] of (["boss", "owner", "mate", "reseller", "outsider"] as Person[]).entries()) {
    await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $1, $3)`, [person, `+1555000${index + 41}00`, ADMINS.includes(person)]);
    // The reseller only uses Tags: not a field rep, so Team results does not count their deals.
    reps[person] = (await one(
      `INSERT INTO sales_reps (user_id, display_name, role, is_active, modules) VALUES ($1, $1, $2, true, $3) RETURNING id`,
      [person, ADMINS.includes(person) ? "admin" : "rep", person === "reseller" ? ["tags"] : ["visits", "tags"]],
    )).id;
  }
  const teamA = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team A', 'team-a') RETURNING id`)).id;
  const teamB = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team B', 'team-b') RETURNING id`)).id;
  await q(
    `INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $3, 'admin'), ($1, $4, 'member'), ($1, $5, 'member'), ($2, $6, 'admin')`,
    [teamA, teamB, reps.owner, reps.mate, reps.reseller, reps.outsider],
  );
  const shopA = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'shop A', $2, 'lead') RETURNING id`, [teamA, reps.mate])).id;
  const shopB = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'shop B', $2, 'lead') RETURNING id`, [teamB, reps.outsider])).id;
  const deal = async (key: string, leadId: number, rep: Person, status = "open") => {
    deals.set(key, (await one(`INSERT INTO sales_opportunities_local (lead_id, rep_id, title, status) VALUES ($1, $2, $3, $4) RETURNING id`, [leadId, reps[rep], key, status])).id);
  };
  await deal("boss deal", shopA, "boss");
  await deal("mate deal", shopA, "mate");
  await deal("mate won", shopA, "mate", "won");
  await deal("reseller deal", shopA, "reseller");
  await deal("outsider deal", shopB, "outsider");
});

const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id).sort();
const SINCE = "/api/xpot/team-results?days=30";

test("the platform's Open deals number and the list it opens are the same deals", async () => {
  const tile = (await request("boss", "GET", SINCE)).body.metrics.openOpportunities;
  // boss, mate and outsider are field reps with an open deal each; the Tags-only reseller's and the won one are not counted.
  expect(tile).toBe(3);
  const list = await request("boss", "GET", "/api/xpot/opportunities?status=open&all=true");
  expect(list.status).toBe(200);
  expect(list.body).toHaveLength(tile);
  expect(ids(list.body)).toEqual([deals.get("boss deal"), deals.get("mate deal"), deals.get("outsider deal")].sort());
  // Without the flag (the old call) the list was only the platform's own, under a number that counted everyone's.
  expect(ids((await request("boss", "GET", "/api/xpot/opportunities?status=open")).body)).toEqual([deals.get("boss deal")]);
});

test("an owner's Open deals number and list are the team's, not another organization's", async () => {
  const tile = (await request("owner", "GET", SINCE)).body.metrics.openOpportunities;
  const list = await request("owner", "GET", "/api/xpot/opportunities?status=open&all=true");
  expect(list.status).toBe(200);
  expect(ids(list.body)).toEqual([deals.get("mate deal")]);
  expect(list.body).toHaveLength(tile);
});

test("a rep never gets the team's list by asking for it", async () => {
  const list = await request("mate", "GET", "/api/xpot/opportunities?status=open&all=true");
  expect(ids(list.body)).toEqual([deals.get("mate deal")]);
});

test("an owner saves a teammate's deal, as they do their tasks and sales", async () => {
  const saved = await request("owner", "PATCH", `/api/xpot/opportunities/${deals.get("mate deal")}`, { title: "renamed by the owner", value: 1500 });
  expect(saved.status).toBe(200);
  expect(await one(`SELECT title, value FROM sales_opportunities_local WHERE id = $1`, [deals.get("mate deal")])).toEqual({ title: "renamed by the owner", value: 1500 });
});

test("who may still not: a teammate, another organization's owner, a reseller", async () => {
  const before = await one(`SELECT title FROM sales_opportunities_local WHERE id = $1`, [deals.get("outsider deal")]);
  // A member of Team A on a deal of Team B, and Team A's owner on Team B's company.
  expect((await request("mate", "PATCH", `/api/xpot/opportunities/${deals.get("outsider deal")}`, { title: "nope" })).status).toBe(403);
  expect((await request("owner", "PATCH", `/api/xpot/opportunities/${deals.get("outsider deal")}`, { title: "nope" })).status).toBe(403);
  // Team B's owner on Team A's company, and a plain member on a colleague's deal.
  expect((await request("outsider", "PATCH", `/api/xpot/opportunities/${deals.get("boss deal")}`, { title: "nope" })).status).toBe(403);
  expect((await request("reseller", "PATCH", `/api/xpot/opportunities/${deals.get("mate deal")}`, { title: "nope" })).status).toBe(403);
  expect(await one(`SELECT title FROM sales_opportunities_local WHERE id = $1`, [deals.get("outsider deal")])).toEqual(before);
});

test("the person and the platform still save their own and anyone's", async () => {
  expect((await request("mate", "PATCH", `/api/xpot/opportunities/${deals.get("mate deal")}`, { value: 2000 })).status).toBe(200);
  expect((await request("boss", "PATCH", `/api/xpot/opportunities/${deals.get("outsider deal")}`, { status: "won" })).status).toBe(200);
});
