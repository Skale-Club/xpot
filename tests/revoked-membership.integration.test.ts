// Leaving an Organization ends what came through it (security review A03/A04).
// A piece a rep still holds opens its customer only while the rep is an active,
// unblocked member of the piece's Organization, in the list and in the detail.
// A consignment the rep left is theirs to read and change only while they are
// still active in its Organization. Real SQL: the migrations on PGlite.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

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

const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
const { registerTagRoutes } = await import("../server/tags/routes.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

const ids = { vera: 0, owen: 0, team: 0, other: 0, keep: 0, customer: 0, shop: 0, consignment: 0 };

beforeAll(async () => {
  for (const [person, phone] of [["vera", "+15550007100"], ["owen", "+15550007200"]] as const) {
    await q(`INSERT INTO users (id, phone, first_name) VALUES ($1, $2, $1)`, [person, phone]);
    ids[person] = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active, modules) VALUES ($1, $1, 'rep', true, ARRAY['visits','tags']) RETURNING id`, [person])).id;
  }
  // Vera and Owen are members of the team; the customer sits in Owen's other Organization.
  ids.team = (await one(`INSERT INTO organizations (name, slug) VALUES ('Revoke team', 'revoke-team') RETURNING id`)).id;
  ids.other = (await one(`INSERT INTO organizations (name, slug) VALUES ('Revoke other', 'revoke-other') RETURNING id`)).id;
  await q(
    `INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $3, 'member'), ($1, $4, 'member'), ($2, $4, 'admin')`,
    [ids.team, ids.other, ids.vera, ids.owen],
  );
  ids.customer = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Piece customer', $2) RETURNING id`, [ids.other, ids.owen])).id;
  // Vera's piece, team stock, sold to Owen's customer: the legitimate cross-Organization link.
  await q(`INSERT INTO tags (organization_id, public_code, product_type, rep_id, lead_id) VALUES ($1, 'RVK00001', 'keychain', $2, $3)`, [ids.team, ids.vera, ids.customer]);
  // Vera also works in a second team, where she keeps a piece of her own.
  ids.keep = (await one(`INSERT INTO organizations (name, slug) VALUES ('Revoke keep', 'revoke-keep') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [ids.keep, ids.vera]);
  await q(`INSERT INTO tags (organization_id, public_code, product_type, rep_id) VALUES ($1, 'RVK00002', 'keychain', $2)`, [ids.keep, ids.vera]);
  ids.shop = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Consignment shop', $2) RETURNING id`, [ids.team, ids.vera])).id;
  const product = (await one(`INSERT INTO sales_products (name, base_price_cents, consignable) VALUES ('Revoke display', 1000, true) RETURNING id`)).id;
  ids.consignment = (await one(
    `INSERT INTO sales_consignments (organization_id, lead_id, product_id, rep_id, unit_price_cents, quantity_on_hand, total_deposited)
     VALUES ($1, $2, $3, $4, 1000, 5, 5) RETURNING id`,
    [ids.team, ids.shop, product, ids.vera],
  )).id;
});

beforeEach(async () => {
  await q(`UPDATE organization_memberships SET is_active = true, blocked_at = NULL WHERE rep_id = $1`, [ids.vera]);
});

async function call(person: "vera" | "owen", method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId: person, email: null, firstName: person, isAdmin: false };
    next();
  });
  server.use("/api/xpot", createLeadsRouter());
  server.use("/api/xpot", createConsignmentsRouter());
  registerTagRoutes(server);
  return new Promise((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
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

const listedCompanies = async () => ((await call("vera", "GET", "/api/xpot/leads")).body as any[]).map((lead) => lead.name).sort();
const consignmentRow = () => one(`SELECT quantity_on_hand, total_returned, unit_price_cents, status FROM sales_consignments WHERE id = $1`, [ids.consignment]);
const movementCount = async () => (await one(`SELECT count(*)::int AS n FROM sales_consignment_movements WHERE consignment_id = $1`, [ids.consignment])).n;

const revocations: Array<[string, string]> = [
  ["suspended", `UPDATE organization_memberships SET is_active = false WHERE rep_id = $1 AND organization_id = $2`],
  ["blocked", `UPDATE organization_memberships SET blocked_at = now() WHERE rep_id = $1 AND organization_id = $2`],
];

describe("A03 — a held piece opens its customer only while its holder is still in the piece's Organization", () => {
  test("an active member reaches the customer in another Organization through the piece", async () => {
    expect(await listedCompanies()).toEqual(["Consignment shop", "Piece customer"]);
    expect((await call("vera", "GET", `/api/xpot/leads/${ids.customer}`)).status).toBe(200);
  });

  test.each(revocations)("%s: the customer leaves the list, the detail and contacts", async (_label, revoke) => {
    await q(revoke, [ids.vera, ids.team]);
    expect(await listedCompanies()).toEqual([]);
    expect((await call("vera", "GET", `/api/xpot/leads/${ids.customer}`)).status).toBe(403);
    expect((await call("vera", "PATCH", `/api/xpot/leads/${ids.customer}`, { phone: "+15550009999" })).status).toBe(403);
    const before = (await one(`SELECT count(*)::int AS n FROM sales_lead_contacts WHERE lead_id = $1`, [ids.customer])).n;
    expect((await call("vera", "POST", `/api/xpot/leads/${ids.customer}/contacts`, { name: "Injected" })).status).toBe(403);
    expect((await one(`SELECT count(*)::int AS n FROM sales_lead_contacts WHERE lead_id = $1`, [ids.customer])).n).toBe(before);
    // The customer's owner is not affected.
    expect((await call("owen", "GET", `/api/xpot/leads/${ids.customer}`)).status).toBe(200);
  });
});

describe("A04 — a consignment's rep loses it with their membership", () => {
  test("an active member reads it", async () => {
    expect((await call("vera", "GET", `/api/xpot/consignments/${ids.consignment}`)).status).toBe(200);
  });

  test.each(revocations)("%s: reading and every change are refused, nothing moves", async (_label, revoke) => {
    await q(revoke, [ids.vera, ids.team]);
    const before = await consignmentRow();
    const movements = await movementCount();
    const path = `/api/xpot/consignments/${ids.consignment}`;
    expect((await call("vera", "GET", path)).status).toBe(403);
    expect((await call("vera", "POST", `${path}/settle`, { countedRemaining: 4 })).status).toBe(403);
    expect((await call("vera", "POST", `${path}/return`, { quantity: 1 })).status).toBe(403);
    expect((await call("vera", "POST", `${path}/adjust`, { delta: -1 })).status).toBe(403);
    expect((await call("vera", "POST", `${path}/close`)).status).toBe(403);
    expect((await call("vera", "PATCH", path, { unitPriceCents: 1 })).status).toBe(403);
    expect(await consignmentRow()).toEqual(before);
    expect(await movementCount()).toBe(movements);
  });
});

describe("A09 — the Tags list leaves out pieces of an Organization the reseller left", () => {
  const listedPieces = async () => ((await call("vera", "GET", "/api/xpot/tags")).body as any[]).map((tag) => tag.publicCode).sort();

  test("an active member lists the pieces of both teams", async () => {
    expect(await listedPieces()).toEqual(["RVK00001", "RVK00002"]);
  });

  test.each(revocations)("%s in one team: only the other team's piece is listed", async (_label, revoke) => {
    await q(revoke, [ids.vera, ids.team]);
    expect(await listedPieces()).toEqual(["RVK00002"]);
  });
});
