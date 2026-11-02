import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Team results for whoever runs a team: the platform sees everyone, an owner or a partner sees the people of the
// organizations they run (and nobody else's), a plain rep is refused.

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

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

type Person = "boss" | "owner" | "mate" | "outsider";
const ADMINS: Person[] = ["boss"];

async function request(as: Person, path: string) {
  const server = express();
  server.use((req, _res, next) => {
    (req as any).session = { userId: as, email: `${as}@x.test`, firstName: as, isAdmin: ADMINS.includes(as) };
    next();
  });
  server.use("/api/xpot", createTeamResultsRouter());
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
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

const SINCE = `/api/xpot/team-results?days=30`;

beforeAll(async () => {
  const reps: Record<string, number> = {};
  for (const [index, person] of (["boss", "owner", "mate", "outsider"] as Person[]).entries()) {
    await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $1, $3)`, [person, `+1555000${index + 31}00`, ADMINS.includes(person)]);
    reps[person] = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ($1, $1, $2, true) RETURNING id`, [person, ADMINS.includes(person) ? "admin" : "rep"])).id;
  }
  const teamA = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team A', 'team-a') RETURNING id`)).id;
  const teamB = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team B', 'team-b') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $3, 'admin'), ($1, $4, 'member'), ($2, $5, 'admin')`, [teamA, teamB, reps.owner, reps.mate, reps.outsider]);
  // Everyone but the owner has a visit this week, so each shows up in the table.
  for (const person of ["mate", "outsider", "boss"] as const) {
    const lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, $2, $3, 'lead') RETURNING id`, [person === "outsider" ? teamB : teamA, `${person} shop`, reps[person]])).id;
    await q(`INSERT INTO sales_visits (lead_id, rep_id, status, checked_in_at, checked_out_at) VALUES ($1, $2, 'completed', now(), now())`, [lead, reps[person]]);
  }
});

const names = (body: any) => (body.reps as Array<{ displayName: string }>).map((row) => row.displayName).sort();

test("the platform sees every team", async () => {
  const response = await request("boss", SINCE);
  expect(response.status).toBe(200);
  expect(names(response.body)).toEqual(["boss", "mate", "outsider", "owner"]);
});

test("an owner sees their own team and never another organization's people", async () => {
  const response = await request("owner", SINCE);
  expect(response.status).toBe(200);
  // The owner is a rep too: listed (idle) with the team, never with the other organization.
  expect(names(response.body)).toEqual(["mate", "owner"]);
  expect(names(response.body)).not.toContain("outsider");
  expect(response.body.metrics.visits).toBe(1);
});

test("a plain member of a team is refused", async () => {
  const response = await request("mate", SINCE);
  expect(response.status).toBe(403);
});

test("a period is required to be valid", async () => {
  expect((await request("owner", "/api/xpot/team-results?days=9999")).status).toBe(400);
});
