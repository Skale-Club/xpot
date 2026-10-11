import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  for (const file of readdirSync(join(process.cwd(), "migrations")).filter((entry) => entry.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { registerTagRoutes } = await import("../../server/tags/routes.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

function appForAdmin() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: "intake-admin", email: "admin@intake.test", isAdmin: true };
    next();
  });
  registerTagRoutes(app);
  return app;
}

async function request(app: express.Express, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json", ...headers } : headers,
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

async function createBatch(app: express.Express, name: string) {
  const [{ id: salesProductId }] = await q("SELECT id FROM sales_products WHERE sku = 'intake-sign'");
  return request(app, "POST", "/api/xpot/admin/tag-batches", {
    name,
    productType: "google_review_sign",
    salesProductId,
    vendor: "China supplier",
  });
}

beforeAll(() => {
  expect(pg.client).toBeTruthy();
});

beforeEach(async () => {
  await q("TRUNCATE tag_journey_entries, tags, tag_batches, sales_products, sales_reps, users RESTART IDENTITY CASCADE");
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('intake-admin', 'admin@intake.test', 'Admin', true)");
  await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('intake-admin', 'Admin', 'admin@intake.test', 'admin', true)");
  await q("INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES ('intake-sign', 'Intake sign', 'physical', 2500, true)");
  await q("INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company') ON CONFLICT (slug) DO NOTHING");
});

describe("batch intake API", () => {
  it("creates an empty batch and adds exactly one stock piece per accepted scan", async () => {
    const app = appForAdmin();
    const created = await createBatch(app, "October intake");
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("open");
    expect(created.body.quantity).toBe(0);

    const before = await request(app, "GET", `/api/xpot/admin/tag-batches/${created.body.id}`);
    expect(before.body.tags).toHaveLength(0);

    const scanned = await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, {
      value: "https://xpot.place/q/Z8MEZP0X",
      idempotencyKey: "phone-1:scan-1",
    });
    expect(scanned.status).toBe(201);
    expect(scanned.body.tag.publicCode).toBe("Z8MEZP0X");
    expect(scanned.body.tag.stockStatus).toBe("available");
    expect(scanned.body.batchCount).toBe(1);
    expect(scanned.body.alreadyRegistered).toBe(false);

    const repeated = await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, {
      value: "z8mezp0x",
      idempotencyKey: "phone-1:scan-1-retry",
    });
    expect(repeated.status).toBe(200);
    expect(repeated.body.alreadyRegistered).toBe(true);
    expect(repeated.body.batchCount).toBe(1);
    expect((await q("SELECT count(*)::int AS count FROM tags"))[0].count).toBe(1);
    expect((await q("SELECT movement_type, to_stock_status FROM tag_stock_movements"))).toEqual([
      { movement_type: "intake", to_stock_status: "available" },
    ]);
  });

  it("moves a scanned house piece into internal use and back to available stock", async () => {
    const app = appForAdmin();
    const batch = await createBatch(app, "Demo pieces");
    const scan = await request(app, "POST", `/api/xpot/admin/tag-batches/${batch.body.id}/scan`, { value: "ESNQ1ZWA" });
    const tagId = scan.body.tag.id;

    const internal = await request(app, "POST", `/api/xpot/admin/tags/${tagId}/internal-use`, { purpose: "Trade show demo" });
    expect(internal.status).toBe(200);
    expect(internal.body.stockStatus).toBe("internal_use");
    expect(internal.body.internalUseNote).toBe("Trade show demo");

    const restored = await request(app, "POST", `/api/xpot/admin/tags/${tagId}/return-to-stock`, { reason: "Demo returned" });
    expect(restored.status).toBe(200);
    expect(restored.body.stockStatus).toBe("available");

    expect(await q("SELECT movement_type, from_stock_status, to_stock_status FROM tag_stock_movements ORDER BY created_at")).toEqual([
      { movement_type: "intake", from_stock_status: null, to_stock_status: "available" },
      { movement_type: "internal_use", from_stock_status: "available", to_stock_status: "internal_use" },
      { movement_type: "return", from_stock_status: "internal_use", to_stock_status: "available" },
    ]);
  });

  it("rejects a code already registered in another batch and scans into a closed batch", async () => {
    const app = appForAdmin();
    const first = await createBatch(app, "First");
    const second = await createBatch(app, "Second");

    expect((await request(app, "POST", `/api/xpot/admin/tag-batches/${first.body.id}/scan`, { value: "7414WRMT" })).status).toBe(201);
    const conflict = await request(app, "POST", `/api/xpot/admin/tag-batches/${second.body.id}/scan`, { value: "7414WRMT" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toMatch(/another batch/i);

    const closed = await request(app, "POST", `/api/xpot/admin/tag-batches/${first.body.id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("closed");
    expect((await request(app, "POST", `/api/xpot/admin/tag-batches/${first.body.id}/scan`, { value: "Y4B0FB8B" })).status).toBe(409);
  });

  it("tracks representative custody, returns, and the final customer sale", async () => {
    const app = appForAdmin();
    const [{ id: repId }] = await q("SELECT id FROM sales_reps WHERE user_id = 'intake-admin'");
    await q("UPDATE sales_reps SET cost_policy = 'zero', cost_policy_configured_at = now() WHERE id = $1", [repId]);
    const batch = await createBatch(app, "Commercial pieces");
    const first = await request(app, "POST", `/api/xpot/admin/tag-batches/${batch.body.id}/scan`, { value: "Y4B0FB8B" });

    const kit = await request(app, "POST", "/api/xpot/admin/tag-kits", { repId, codes: ["Y4B0FB8B"] });
    expect(kit.status).toBe(201);
    expect((await q("SELECT stock_status, ownership_type, custodian_rep_id FROM tags WHERE id = $1", [first.body.tag.id]))[0]).toEqual({
      stock_status: "available",
      ownership_type: "company",
      custodian_rep_id: repId,
    });

    const returned = await request(app, "POST", "/api/xpot/admin/tag-kits/return", { codes: ["Y4B0FB8B"] });
    expect(returned.status).toBe(200);
    expect((await q("SELECT stock_status, ownership_type, custodian_rep_id FROM tags WHERE id = $1", [first.body.tag.id]))[0]).toEqual({
      stock_status: "available",
      ownership_type: "company",
      custodian_rep_id: null,
    });

    const [{ id: organizationId }] = await q("SELECT id FROM organizations WHERE slug = 'xpot-company'");
    const [{ id: leadId }] = await q("INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, 'Customer', $2) RETURNING id", [organizationId, repId]);
    const [{ id: salesProductId }] = await q("SELECT id FROM sales_products WHERE sku = 'intake-sign'");
    const sale = await request(app, "POST", "/api/xpot/tag-sales", {
      leadId,
      lines: [{ salesProductId, tagIds: [first.body.tag.id], unitPriceCents: 2500 }],
      paymentStatus: "paid",
    }, { "idempotency-key": "intake-sale-1" });
    expect(sale.status).toBe(201);
    expect((await q("SELECT stock_status, ownership_type FROM tags WHERE id = $1", [first.body.tag.id]))[0]).toEqual({
      stock_status: "sold",
      ownership_type: "customer",
    });
    expect((await q("SELECT movement_type FROM tag_stock_movements WHERE tag_id = $1 ORDER BY created_at", [first.body.tag.id])).map((row) => row.movement_type)).toEqual([
      "intake", "transfer", "return", "sale",
    ]);
  });
});
