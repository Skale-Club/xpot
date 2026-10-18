// Who cancels a Tags sale (BACKLOG UXR-31, decided): the seller who recorded
// it cancels their own, when they have the Visits module (POST /sales/:id/cancel
// sits under it); a manager cancels any. Another seller of the same team cannot.
// Against the real migrations (PGlite).

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

const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
const { requireVisitsModule, VISITS_ONLY_PATHS } = await import("../server/routes/xpot/middleware.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

async function cancel(userId: string, saleId: number) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: userId, isAdmin: false };
    next();
  });
  server.use(VISITS_ONLY_PATHS.map((path) => `/api/xpot${path}`), requireVisitsModule);
  server.use("/api/xpot", createSalesRouter());
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const listening = server.listen(0, async () => {
      const { port } = listening.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/xpot/sales/${saleId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Customer changed their mind" }),
        });
        resolve({ status: response.status, body: await response.json() });
      } catch (error) {
        reject(error);
      } finally {
        listening.close();
      }
    });
  });
}

const reps: Record<string, number> = {};
let organizationId: number;
let leadId: number;
const tagsSale = async (seller: string) =>
  (await one(`INSERT INTO sales_sales (organization_id, lead_id, rep_id, source, total_cents, paid_cents)
    VALUES ($1, $2, $3, 'tags', 2500, 2500) RETURNING id`, [organizationId, leadId, reps[seller]])).id as number;
const statusOf = async (saleId: number) => (await one(`SELECT status FROM sales_sales WHERE id = $1`, [saleId])).status;

beforeAll(async () => {
  const people: Array<[string, string, string]> = [
    ["ts-vera", "rep", "{visits,tags}"],
    ["ts-owen", "rep", "{visits,tags}"],
    ["ts-carla", "rep", "{tags}"],
    ["ts-boss", "manager", "{visits,tags}"],
  ];
  for (const [index, [userId, role, modules]] of people.entries()) {
    await q(`INSERT INTO users (id, phone, first_name) VALUES ($1, $2, $1)`, [userId, `+155590000${index}`]);
    reps[userId] = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active, modules) VALUES ($1, $1, $2, true, $3) RETURNING id`, [userId, role, modules])).id;
  }
  organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Sale Team', 'sale-team') RETURNING id`)).id;
  for (const userId of ["ts-vera", "ts-owen", "ts-carla"]) {
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [organizationId, reps[userId]]);
  }
  leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Corner Barber', $2, 'customer') RETURNING id`, [organizationId, reps["ts-vera"]])).id;
});

describe("cancelling a Tags sale", () => {
  it("is refused to another seller of the same team", async () => {
    const saleId = await tagsSale("ts-vera");
    expect((await cancel("ts-owen", saleId)).status).toBe(403);
    expect(await statusOf(saleId)).toBe("completed");
  });

  it("is allowed to the seller who recorded it", async () => {
    const saleId = await tagsSale("ts-vera");
    const res = await cancel("ts-vera", saleId);
    expect(res.status).toBe(200);
    expect(res.body.sale).toMatchObject({ status: "cancelled", cancelReason: "Customer changed their mind" });
  });

  it("is not offered to a seller without Visits, even for their own sale", async () => {
    const saleId = await tagsSale("ts-carla");
    const res = await cancel("ts-carla", saleId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("module_off");
    expect(await statusOf(saleId)).toBe("completed");
  });

  it("is allowed to a manager for anyone's sale", async () => {
    const saleId = await tagsSale("ts-owen");
    expect((await cancel("ts-boss", saleId)).status).toBe(200);
    expect(await statusOf(saleId)).toBe("cancelled");
  });
});
