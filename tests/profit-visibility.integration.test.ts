// A seller sees neither cost nor profit (the plan's decision): the screens hide them with useShowProfit, and the
// server does not send them either. Members get products, sales, the Sales summary, a company's snapshot and the
// answer to a settlement without any cost or profit field; the owner, a partner and the platform get them.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

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

const { createProductsRouter } = await import("../server/routes/xpot/products.js");
const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
const { hideProfitFromMembers, withoutProfit } = await import("../server/routes/xpot/profitVisibility.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

type Person = "boss" | "owner" | "mate" | "solo";
const ids = { productId: 0, saleId: 0, leadId: 0, consignmentId: 0 };
const repOf: Record<string, number> = {};

beforeAll(async () => {
  for (const [index, person] of (["boss", "owner", "mate", "solo"] as Person[]).entries()) {
    await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $1, $3)`, [person, `+1555000${index + 51}00`, person === "boss"]);
    repOf[person] = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ($1, $1, $2, true) RETURNING id`, [person, person === "boss" ? "admin" : "rep"])).id;
  }
  const team = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team', 'profit-team') RETURNING id`)).id;
  // The automatic one-person workspace of a rep: slug "rep-<id>" (isPersonalOrganization).
  const alone = (await one(`INSERT INTO organizations (name, slug) VALUES ('Alone', $1) RETURNING id`, [`rep-${repOf.solo}`])).id;
  await q(
    `INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $3, 'admin'), ($1, $4, 'member'), ($2, $5, 'admin')`,
    [team, alone, repOf.owner, repOf.mate, repOf.solo],
  );
  ids.productId = (await one(`INSERT INTO sales_products (name, base_price_cents, cost_cents, consignable) VALUES ('Keychain', 1000, 120, true) RETURNING id`)).id;
  ids.leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Corner Cafe', $2) RETURNING id`, [team, repOf.mate])).id;
  ids.saleId = (await one(
    `INSERT INTO sales_sales (organization_id, lead_id, rep_id, subtotal_cents, total_cents) VALUES ($1, $2, $3, 2000, 2000) RETURNING id`,
    [team, ids.leadId, repOf.mate],
  )).id;
  await q(`INSERT INTO sales_sale_items (sale_id, product_id, description, quantity, unit_price_cents, unit_cost_cents, total_cents, net_total_cents) VALUES ($1, $2, 'Keychain', 2, 1000, 120, 2000, 2000)`, [ids.saleId, ids.productId]);
  ids.consignmentId = (await one(
    `INSERT INTO sales_consignments (organization_id, lead_id, product_id, rep_id, unit_price_cents, quantity_on_hand, total_deposited)
     VALUES ($1, $2, $3, $4, 1000, 10, 10) RETURNING id`,
    [team, ids.leadId, ids.productId, repOf.mate],
  )).id;
});

async function call(person: Person, method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId: person, email: null, firstName: person, isAdmin: person === "boss" };
    next();
  });
  // The same mount as server/routes/xpot/index.ts.
  server.use(["/api/xpot/products", "/api/xpot/sales", "/api/xpot/consignments"], hideProfitFromMembers);
  server.use("/api/xpot", createProductsRouter());
  server.use("/api/xpot", createSalesRouter());
  server.use("/api/xpot", createConsignmentsRouter());
  return new Promise((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: { "Content-Type": "application/json", "X-Xpot-View": "manage" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        expect(response.status, `${method} ${path}`).toBeLessThan(300);
        resolve(await response.text());
      } catch (error) {
        reject(error);
      } finally {
        listener.close();
      }
    });
  });
}

/** Any field that says what a thing costs or what it left over. */
const COST_OR_PROFIT = /"(costCents|unitCostCents|costBasisCents|profitCents|grossProfitCents|lifetimeProfitCents|profit)"/;

const reads = [
  ["the catalog", "/api/xpot/products"],
  ["a sale", () => `/api/xpot/sales/${ids.saleId}`],
  ["the sales list", "/api/xpot/sales"],
  ["the Sales summary", "/api/xpot/sales/summary?days=30"],
  ["a company's snapshot", () => `/api/xpot/sales/lead/${ids.leadId}`],
] as const;

describe("what a member receives", () => {
  for (const [name, path] of reads) {
    test(`a team member gets ${name} without cost or profit`, async () => {
      const text = await call("mate", "GET", typeof path === "function" ? path() : path);
      expect(text).not.toMatch(COST_OR_PROFIT);
      expect(text.length).toBeGreaterThan(2);
    });
  }

  test("someone selling alone gets the catalog without its cost", async () => {
    expect(await call("solo", "GET", "/api/xpot/products")).not.toMatch(COST_OR_PROFIT);
  });

  test("the answer to a settlement carries no cost or profit either", () => {
    // PGlite has one connection and settling reads through it inside its transaction, so the shape is checked here.
    const settled = withoutProfit({
      consignment: { id: 1, quantityOnHand: 7 },
      sale: { sale: { totalCents: 3000 }, items: [{ quantity: 3, unitPriceCents: 1000, unitCostCents: 120 }], pieces: [{ costBasisCents: 120 }] },
      soldQuantity: 3,
    });
    expect(JSON.stringify(settled)).not.toMatch(COST_OR_PROFIT);
    expect(settled.sale.items[0].unitPriceCents).toBe(1000);
  });
});

describe("what whoever owns the business receives", () => {
  for (const person of ["owner", "boss"] as const) {
    test(`${person} still gets the catalog cost and the sale's cost`, async () => {
      expect(await call(person, "GET", "/api/xpot/products")).toMatch(/"costCents":120/);
      expect(await call(person, "GET", `/api/xpot/sales/${ids.saleId}`)).toMatch(/"unitCostCents":120/);
    });
    test(`${person} still gets the profit in the Sales summary`, async () => {
      expect(await call(person, "GET", "/api/xpot/sales/summary?days=30")).toMatch(/"profit":\{/);
    });
  }
});

describe("withoutProfit", () => {
  test("drops cost and profit at any depth and keeps the rest", () => {
    const date = new Date("2026-11-02T10:00:00Z");
    const clean = withoutProfit({
      revenue: { periodCents: 5 },
      profit: { periodCents: 4 },
      byProduct: [{ name: "A", revenueCents: 5, profitCents: 4 }],
      items: [{ unitCostCents: 3, quantity: 2, soldAt: date }],
      nothing: null,
    });
    expect(clean).toEqual({
      revenue: { periodCents: 5 },
      byProduct: [{ name: "A", revenueCents: 5 }],
      items: [{ quantity: 2, soldAt: date }],
      nothing: null,
    });
  });
});
