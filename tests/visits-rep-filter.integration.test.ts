// The visits history filtered by seller (BACKLOG UXR-21): GET /visits?repId=
// narrows the list to one person, for a manager in management mode only (the
// history's "Seller" filter and People's "Their visits"). Anyone else keeps
// their own visits whatever the parameter says.

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

const { createVisitsRouter } = await import("../server/routes/xpot/visits.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

async function list(userId: string, query = "", headers: Record<string, string> = {}) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin: false };
    next();
  });
  server.use("/api/xpot", createVisitsRouter());
  return new Promise<{ status: number; reps: number[] }>((resolve, reject) => {
    const listening = server.listen(0, async () => {
      const { port } = listening.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/xpot/visits${query}`, { headers });
        const body = await response.json();
        resolve({ status: response.status, reps: Array.isArray(body) ? body.map((visit: any) => visit.repId).sort() : [] });
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

beforeAll(async () => {
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('vf-boss', '+15550000401', 'Bo'), ('vf-ana', '+15550000402', 'Ana'), ('vf-bia', '+15550000403', 'Bia')`);
  await q(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('vf-boss', 'Bo Boss', 'manager', true)`);
  ana = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('vf-ana', 'Ana Rep', 'rep', true) RETURNING id`)).id;
  bia = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('vf-bia', 'Bia Rep', 'rep', true) RETURNING id`)).id;
  const organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Filter Team', 'filter-team') RETURNING id`)).id;
  // Bia runs the team Ana works in (a Rep Admin): visits have no organization, so that does not widen hers.
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'admin')`, [organizationId, ana, bia]);
  const leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Corner Barber', $2, 'lead') RETURNING id`, [organizationId, ana])).id;
  await q(`INSERT INTO sales_visits (lead_id, rep_id, status, checked_in_at) VALUES ($1, $2, 'completed', NOW()), ($1, $2, 'sale_made', NOW()), ($1, $3, 'completed', NOW())`, [leadId, ana, bia]);
});

describe("GET /visits?repId=", () => {
  it("narrows a manager's list to one seller in management mode", async () => {
    expect((await list("vf-boss")).reps).toEqual([ana, ana, bia]);
    expect((await list("vf-boss", `?repId=${ana}`)).reps).toEqual([ana, ana]);
    expect((await list("vf-boss", `?repId=${bia}`)).reps).toEqual([bia]);
  });

  it("ignores a value that is not a person id", async () => {
    expect((await list("vf-boss", "?repId=abc")).reps).toEqual([ana, ana, bia]);
    expect((await list("vf-boss", "?repId=-3")).reps).toEqual([ana, ana, bia]);
  });

  it("is not honoured outside management mode, nor for a rep", async () => {
    // The app's management mode sends "manage"; a manager's list stays everyone's.
    expect((await list("vf-boss", `?repId=${ana}`, { "X-Xpot-View": "manage" })).reps).toEqual([ana, ana]);
    // A Rep Admin in management mode keeps their own visits: the filter is a platform manager's.
    expect((await list("vf-bia", `?repId=${ana}`, { "X-Xpot-View": "manage" })).reps).toEqual([bia]);
    expect((await list("vf-bia", "", { "X-Xpot-View": "manage" })).reps).toEqual([bia]);
    // Viewing as a rep, the manager sees their own visits (none) whatever the filter.
    expect((await list("vf-boss", `?repId=${ana}`, { "X-Xpot-View": "rep" })).reps).toEqual([]);
    // A rep cannot read someone else's history through it.
    expect((await list("vf-bia", `?repId=${ana}`)).reps).toEqual([bia]);
  });
});
