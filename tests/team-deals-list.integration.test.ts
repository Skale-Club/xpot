// The deals behind "Open deals" in Team results: a Rep Admin in management mode opens the pipeline and finds the
// team's deals (the organizations' members, on the organizations' companies), as many open ones as the tile counts.
// With management mode off the same person has only their own deals, "My work".

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

const { createOpportunitiesRouter } = await import("../server/routes/xpot/opportunities.js");
const { teamActivity } = await import("../server/routes/xpot/teamActivity.js");
const { managedOrganizationIds, teamMembers } = await import("../server/organizations/service.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

async function deals(userId: string, headers: Record<string, string> = {}) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin: false };
    next();
  });
  server.use("/api/xpot", createOpportunitiesRouter());
  return new Promise<Array<{ repId: number; status: string }>>((resolve, reject) => {
    const listening = server.listen(0, async () => {
      const { port } = listening.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/xpot/opportunities`, { headers });
        resolve(await response.json());
      } catch (error) {
        reject(error);
      } finally {
        listening.close();
      }
    });
  });
}

let ana: number;
let bia: number;
let biaActor: any;

beforeAll(async () => {
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('td-ana', '+15550000501', 'Ana'), ('td-bia', '+15550000502', 'Bia')`);
  ana = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('td-ana', 'Ana Rep', 'rep', true) RETURNING id`)).id;
  bia = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('td-bia', 'Bia Rep', 'rep', true) RETURNING id`)).id;
  const team = (await one(`INSERT INTO organizations (name, slug) VALUES ('Deal Team', 'deal-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'admin')`, [team, ana, bia]);
  const lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Corner Barber', $2, 'lead') RETURNING id`, [team, ana])).id;
  const other = (await one(`INSERT INTO organizations (name, slug) VALUES ('Far Team', 'far-team') RETURNING id`)).id;
  const farLead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Far Bakery', $2, 'lead') RETURNING id`, [other, ana])).id;
  await q(
    `INSERT INTO sales_opportunities_local (lead_id, rep_id, title, value, status) VALUES
      ($1, $2, 'Ana one', 1000, 'open'), ($1, $2, 'Ana two', 500, 'open'), ($1, $3, 'Bia one', 300, 'open'),
      ($1, $2, 'Ana won', 900, 'won'), ($4, $2, 'Ana far', 700, 'open')`,
    [lead, ana, bia, farLead],
  );
  biaActor = { user: { id: "td-bia", isAdmin: false }, rep: { id: bia, role: "rep" } };
});

describe("GET /opportunities for a Rep Admin", () => {
  it("lists the team's deals in management mode, as many open ones as Team results counts", async () => {
    const listed = await deals("td-bia", { "X-Xpot-View": "manage" });
    const open = listed.filter((deal) => deal.status === "open");
    // The team's open deals: Ana's two and Bia's one. Ana's deal on another organization's company is not theirs.
    expect(open.map((deal) => deal.repId).sort()).toEqual([ana, ana, bia]);
    expect(listed).toHaveLength(4);

    const managed = (await managedOrganizationIds(biaActor)) ?? [];
    const members = await teamMembers(managed);
    const result = await teamActivity(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), Array.from(members.keys()), undefined, managed);
    expect(result.metrics.openOpportunities).toBe(open.length);
    expect(result.metrics.pipelineValue).toBe(1800);
  });

  it("lists only their own deals with management mode off", async () => {
    expect((await deals("td-bia", { "X-Xpot-View": "rep" })).map((deal) => deal.repId)).toEqual([bia]);
    expect((await deals("td-bia")).map((deal) => deal.repId)).toEqual([bia]);
  });

  it("never gives a rep their teammates' deals", async () => {
    expect((await deals("td-ana", { "X-Xpot-View": "manage" })).every((deal) => deal.repId === ana)).toBe(true);
  });
});
