// Stock invariants of cancelling a sale and closing a consignment (security
// review A07/A08), on the real migrations (PGlite).
// - A cancellation and the release of its pieces are one transaction: a failure
//   leaves the sale completed and its pieces sold; a retry of a cancellation
//   that had left pieces behind releases them.
// - A consignment closes only with nothing left on record.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
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

const { cancelSale } = await import("../server/tags/sales.js");
const { salesStorage, ConsignmentUnitsLeftError } = await import("../server/storage-sales.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

const ids = { rep: 0, org: 0, lead: 0, product: 0 };

beforeAll(async () => {
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('inv', '+15550007300', 'inv')`);
  ids.rep = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('inv', 'inv', 'rep', true) RETURNING id`)).id;
  ids.org = (await one(`INSERT INTO organizations (name, slug) VALUES ('Invariants', 'invariants') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [ids.org, ids.rep]);
  ids.lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Inv shop', $2) RETURNING id`, [ids.org, ids.rep])).id;
  ids.product = (await one(`INSERT INTO sales_products (name, base_price_cents, consignable) VALUES ('Inv plate', 1000, true) RETURNING id`)).id;
});

/** A completed direct sale with one piece sold on it. */
async function saleWithPiece(code: string) {
  const sale = (await one(
    `INSERT INTO sales_sales (organization_id, lead_id, rep_id, subtotal_cents, total_cents) VALUES ($1, $2, $3, 1000, 1000) RETURNING id`,
    [ids.org, ids.lead, ids.rep],
  )).id as number;
  const item = (await one(`INSERT INTO sales_sale_items (sale_id, description, quantity) VALUES ($1, 'Plate', 1) RETURNING id`, [sale])).id;
  const tag = (await one(
    `INSERT INTO tags (organization_id, public_code, product_type, rep_id, lead_id, stock_status, ownership_type, sold_at)
     VALUES ($1, $2, 'keychain', $3, $4, 'sold', 'customer', now()) RETURNING id`,
    [ids.org, code, ids.rep, ids.lead],
  )).id as string;
  await q(`INSERT INTO sales_sale_tags (sale_id, sale_item_id, tag_id, cost_basis_cents, cost_source) VALUES ($1, $2, $3, 0, 'sale_item')`, [sale, item, tag]);
  return { sale, tag };
}

const state = async (sale: number, tag: string) => ({
  sale: (await one(`SELECT status FROM sales_sales WHERE id = $1`, [sale])).status,
  link: (await one(`SELECT status FROM sales_sale_tags WHERE sale_id = $1`, [sale])).status,
  stock: (await one(`SELECT stock_status FROM tags WHERE id = $1`, [tag])).stock_status,
});

describe("A07 — cancelling a sale releases its pieces in the same transaction", () => {
  test("a failure while releasing leaves the sale and its piece as they were", async () => {
    const { sale, tag } = await saleWithPiece("INV00001");
    await q(`CREATE FUNCTION inv_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER inv_fail BEFORE INSERT ON tag_stock_movements FOR EACH ROW EXECUTE FUNCTION inv_fail()`);
    try {
      await expect(cancelSale(sale, "test", null)).rejects.toThrow();
    } finally {
      await q(`DROP TRIGGER inv_fail ON tag_stock_movements`);
      await q(`DROP FUNCTION inv_fail()`);
    }
    expect(await state(sale, tag)).toEqual({ sale: "completed", link: "active", stock: "sold" });

    await cancelSale(sale, "test", null);
    expect(await state(sale, tag)).toEqual({ sale: "cancelled", link: "cancelled", stock: "available" });
  });

  test("cancelling again repairs a sale cancelled with its piece still sold", async () => {
    const { sale, tag } = await saleWithPiece("INV00002");
    await q(`UPDATE sales_sales SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [sale]);
    await cancelSale(sale, null, null);
    expect(await state(sale, tag)).toEqual({ sale: "cancelled", link: "cancelled", stock: "available" });
  });
});

describe("A08 — a consignment closes only with nothing on record", () => {
  // One shop each: a lead holds one active agreement per product.
  const consignment = async () => {
    const lead = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Inv consignee', $2) RETURNING id`, [ids.org, ids.rep])).id;
    return (await one(
      `INSERT INTO sales_consignments (organization_id, lead_id, product_id, rep_id, unit_price_cents, quantity_on_hand, total_deposited)
       VALUES ($1, $2, $3, $4, 1000, 10, 10) RETURNING id`,
      [ids.org, lead, ids.product, ids.rep],
    )).id as number;
  };
  const row = (id: number) => one(`SELECT status, quantity_on_hand, total_returned FROM sales_consignments WHERE id = $1`, [id]);
  const movements = async (id: number) => (await one(`SELECT count(*)::int AS n FROM sales_consignment_movements WHERE consignment_id = $1`, [id])).n;

  test("a partial return asking to close is refused and records nothing", async () => {
    const id = await consignment();
    await expect(salesStorage.runReturn({ consignmentId: id, repId: ids.rep, quantity: 1, close: true }))
      .rejects.toBeInstanceOf(ConsignmentUnitsLeftError);
    expect(await row(id)).toEqual({ status: "active", quantity_on_hand: 10, total_returned: 0 });
    expect(await movements(id)).toBe(0);
    expect(await salesStorage.closeConsignment(id)).toBeUndefined();
    expect((await row(id)).status).toBe("active");
  });

  test("returning everything closes it", async () => {
    const id = await consignment();
    await salesStorage.runReturn({ consignmentId: id, repId: ids.rep, quantity: 10, close: true });
    expect(await row(id)).toEqual({ status: "closed", quantity_on_hand: 0, total_returned: 10 });
  });
});
