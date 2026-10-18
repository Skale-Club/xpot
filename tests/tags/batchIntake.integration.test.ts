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

async function createIssuedBatch(app: express.Express, name: string, quantity: number) {
  const [{ id: salesProductId }] = await q("SELECT id FROM sales_products WHERE sku = 'intake-sign'");
  return request(app, "POST", "/api/xpot/admin/tag-batches", {
    name,
    productType: "large_plate",
    salesProductId,
    face: "google_review",
    vendor: "Skale Club",
    quantity,
  });
}

const batchItem = async (app: express.Express, id: string) =>
  (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === id);

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

  it("marks failed prints as damaged stock and retains an auditable quality-control sample", async () => {
    const app = appForAdmin();
    const batch = await createBatch(app, "Quality sample");
    const scan = await request(app, "POST", `/api/xpot/admin/tag-batches/${batch.body.id}/scan`, { value: "ABY74NEB" });
    const tagId = scan.body.tag.id;

    const missingReason = await request(app, "POST", `/api/xpot/admin/tags/${tagId}/damage`, { reason: "" });
    expect(missingReason.status).toBe(400);

    const damaged = await request(app, "POST", `/api/xpot/admin/tags/${tagId}/damage`, { reason: "Print ruined during production" });
    expect(damaged.status).toBe(200);
    expect(damaged.body).toMatchObject({ publicCode: "ABY74NEB", status: "inventory", stockStatus: "damaged" });
    expect((await batchItem(app, batch.body.id))).toMatchObject({ houseCount: 0 });

    expect(await q("SELECT movement_type, from_stock_status, to_stock_status, reason FROM tag_stock_movements WHERE tag_id = $1 ORDER BY created_at", [tagId])).toEqual([
      { movement_type: "intake", from_stock_status: null, to_stock_status: "available", reason: null },
      { movement_type: "damage", from_stock_status: "available", to_stock_status: "damaged", reason: "Print ruined during production" },
    ]);
    expect((await q("SELECT action, before_value, after_value, content FROM tag_journey_entries WHERE tag_id = $1 ORDER BY occurred_at DESC LIMIT 1", [tagId]))[0]).toEqual({
      action: "piece_damaged",
      before_value: "available",
      after_value: "damaged",
      content: "Print ruined during production",
    });

    const filtered = await request(app, "GET", "/api/xpot/tags?stockStatus=damaged");
    expect(filtered.status).toBe(200);
    expect(filtered.body.map((tag: any) => tag.publicCode)).toEqual(["ABY74NEB"]);

    const overview = await request(app, "GET", "/api/xpot/admin/tags/overview");
    // Digital status (still inventory, as its ?status= list shows) and the physical damage are counted apart.
    expect(overview.body.counts).toMatchObject({ total: 1, inventory: 1, damaged: 1 });
    expect(overview.body.stock).toEqual({ house: 0, withResellers: 0 });
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

describe("issued batches (3D printing, supplier orders)", () => {
  it("issues the codes as pending pieces that are not stock until scanned in", async () => {
    const app = appForAdmin();
    const created = await createIssuedBatch(app, "Google plates", 4);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("open");
    expect(created.body.codeSource).toBe("issued");
    expect(created.body.quantity).toBe(4);

    const pieces = await q("SELECT public_code, serial_number, stock_status, registered_at FROM tags ORDER BY serial_number");
    expect(pieces).toHaveLength(4);
    expect(pieces.every((t) => t.stock_status === "pending" && t.registered_at === null)).toBe(true);
    expect(pieces.map((t) => t.serial_number)).toEqual([1, 2, 3, 4]);
    expect((await q("SELECT DISTINCT movement_type, to_stock_status FROM tag_stock_movements"))).toEqual([
      { movement_type: "issue", to_stock_status: "pending" },
    ]);

    const item = await batchItem(app, created.body.id);
    expect(item).toMatchObject({ codeSource: "issued", stage: "issued", tagCount: 4, pendingCount: 4, receivedCount: 0, houseCount: 0 });
  });

  it("refuses to kit, assign or move a pending piece", async () => {
    const app = appForAdmin();
    const [{ id: repId }] = await q("SELECT id FROM sales_reps WHERE user_id = 'intake-admin'");
    await q("UPDATE sales_reps SET cost_policy = 'zero', cost_policy_configured_at = now() WHERE id = $1", [repId]);
    const created = await createIssuedBatch(app, "Not printed yet", 2);
    const [first] = await q("SELECT id, public_code FROM tags ORDER BY serial_number LIMIT 1");

    const byBatch = await request(app, "POST", "/api/xpot/admin/tag-kits", { repId, batchId: created.body.id, quantity: 1 });
    expect(byBatch.status).toBe(409);
    const byCode = await request(app, "POST", "/api/xpot/admin/tag-kits", { repId, codes: [first.public_code] });
    expect(byCode.status).toBe(409);
    const assign = await request(app, "POST", `/api/xpot/admin/tags/${first.id}/assign`, { leadName: "Some cafe" });
    expect(assign.status).toBe(409);
    expect(assign.body.message).toMatch(/not in stock yet/i);
    const internal = await request(app, "POST", `/api/xpot/admin/tags/${first.id}/internal-use`, { purpose: "Demo" });
    expect(internal.status).toBe(409);
    expect((await q("SELECT count(*)::int AS n FROM sales_leads"))[0].n).toBe(0);
  });

  it("receives each printed piece once by scanning it, and refuses codes it never issued", async () => {
    const app = appForAdmin();
    const created = await createIssuedBatch(app, "Printed today", 2);
    const codes = (await q("SELECT public_code FROM tags ORDER BY serial_number")).map((t) => t.public_code);

    await q(
      "INSERT INTO tag_journey_entries (kind, action, title, batch_id, source, actor) VALUES ('execution', 'printed', 'Printed', $1, 'mcp', 'ai')",
      [created.body.id],
    );
    expect((await batchItem(app, created.body.id)).stage).toBe("printed");

    const first = await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, {
      value: `https://xpot.place/q/${codes[0]}`,
      idempotencyKey: "bench:1",
    });
    expect(first.status).toBe(201);
    expect(first.body.tag.stockStatus).toBe("available");
    expect(first.body.tag.registeredAt).toBeTruthy();
    expect(first.body).toMatchObject({ batchCount: 2, receivedCount: 1, alreadyRegistered: false });
    expect((await batchItem(app, created.body.id))).toMatchObject({ stage: "receiving", pendingCount: 1, receivedCount: 1, houseCount: 1 });

    const again = await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, { value: codes[0].toLowerCase() });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ alreadyRegistered: true, receivedCount: 1 });

    const stranger = await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, { value: "Z8MEZP0X" });
    expect(stranger.status).toBe(409);
    expect(stranger.body.message).toMatch(/not issued to this batch/i);
    expect((await q("SELECT count(*)::int AS n FROM tags"))[0].n).toBe(2);

    expect((await request(app, "POST", `/api/xpot/admin/tag-batches/${created.body.id}/scan`, { value: codes[1] })).status).toBe(201);
    expect((await batchItem(app, created.body.id))).toMatchObject({ stage: "received", pendingCount: 0, receivedCount: 2 });
    expect((await q(
      "SELECT movement_type, from_stock_status, to_stock_status FROM tag_stock_movements m JOIN tags t ON t.id = m.tag_id WHERE t.public_code = $1 ORDER BY m.created_at",
      [codes[0]],
    ))).toEqual([
      { movement_type: "issue", from_stock_status: null, to_stock_status: "pending" },
      { movement_type: "intake", from_stock_status: "pending", to_stock_status: "available" },
    ]);
  });

  it("enters pinned legacy codes straight into stock in a closed batch", async () => {
    const app = appForAdmin();
    const [{ id: salesProductId }] = await q("SELECT id FROM sales_products WHERE sku = 'intake-sign'");
    const created = await request(app, "POST", "/api/xpot/admin/tag-batches", {
      name: "Legacy plaques", productType: "small_stand", salesProductId, publicCodes: ["z8mezp0x", "7414WRMT"],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "closed", codeSource: "issued", quantity: 2 });
    expect((await q("SELECT DISTINCT stock_status FROM tags"))).toEqual([{ stock_status: "available" }]);
    expect((await batchItem(app, created.body.id)).stage).toBe("received");
  });
});
