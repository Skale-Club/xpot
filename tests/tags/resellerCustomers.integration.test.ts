// A Tags-only reseller's Customers against a real Postgres: the companies
// holding her pieces are listed with their names and open, whichever of her
// Organizations the lead landed in and whoever created it.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database. It TRUNCATEs the tag tables and replaces the rc-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("reseller customers: approved reseller activates a piece, lists and opens the customer", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { createLeadsRouter } = await import("../../server/routes/xpot/leads.js");
  const { approveRep } = await import("../../server/routes/xpot/resellerAccounts.js");
  const { generateTagCode } = await import("../../server/tags/codes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_sales WHERE lead_id IN (SELECT id FROM sales_leads WHERE name LIKE 'RC %')`);
    await db.execute(sql`DELETE FROM sales_leads WHERE name LIKE 'RC %'`);
    await db.execute(sql`DELETE FROM organizations WHERE slug = 'rc-team' OR slug IN (SELECT 'rep-' || id FROM sales_reps WHERE user_id LIKE 'rc-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'rc-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'rc-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('rc-admin', 'admin@rc.test', 'Admin', true), ('rc-carla', 'carla@rc.test', 'Carla', false)`);
  const admin = await one<{ id: number }>(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active)
    VALUES ('rc-admin', 'RC Admin', 'admin@rc.test', 'admin', true) RETURNING id`);
  // Carla signs up (switched off) and is approved for Tags only: that gives her a
  // personal Organization where she is Rep Admin.
  const carla = await one<{ id: number }>(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active)
    VALUES ('rc-carla', 'Carla', 'carla@rc.test', 'rep', false) RETURNING id`);
  await approveRep(carla.id, ["tags"], { userId: "rc-admin", isAdmin: true });
  // A manager later adds her to a team as a plain member. That newer membership
  // is where her new records now go.
  const team = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('RC Team', 'rc-team') RETURNING id`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role, updated_at)
    VALUES (${team.id}, ${carla.id}, 'member', now() + interval '1 minute')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "rc-admin", email: `${userId}@rc.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createLeadsRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string, body?: unknown, extraHeaders: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* empty */ }
    return { status: res.status, json, text };
  };

  try {
    // Two pieces into stock, both handed to Carla.
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('RC-TAGS-KEYCHAIN', 'RC keychain', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "rc-admin", { name: "RC run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = [generateTagCode(), generateTagCode()];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "rc-admin", { value: code, idempotencyKey: `rc-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    const kit = await api("POST", "/api/xpot/admin/tag-kits", "rc-admin", { repId: carla.id, codes, unitCostCents: 0 });
    assert.equal(kit.status, 201, kit.text);
    // A third piece stays in house stock. The admin's dashboard counts the pieces with
    // resellers, not the house's; viewing as a rep, the admin holds none.
    const houseCode = generateTagCode();
    assert.equal((await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "rc-admin", { value: houseCode, idempotencyKey: `rc-${houseCode}` })).status, 201);
    assert.equal((await api("GET", "/api/xpot/tags/dashboard", "rc-admin")).json.inStock, 2);
    assert.equal((await api("GET", "/api/xpot/tags/dashboard", "rc-carla")).json.inStock, 2);
    assert.equal((await api("GET", "/api/xpot/tags/dashboard", "rc-admin", undefined, { "x-xpot-view": "rep" })).json.inStock, 0);
    const [own, linkedByAdmin] = await Promise.all(codes.map(async (code) => (await api("GET", `/api/xpot/tags/lookup/${code}`, "rc-carla")).json));

    // She sets up a piece for a business met in the field.
    const activated = await api("POST", `/api/xpot/tags/${own.id}/quick-activate`, "rc-carla", {
      destinationUrl: "https://example.test/menu", destinationType: "menu", leadName: "RC Mercado Central",
    });
    assert.equal(activated.status, 200, activated.text);
    const mercadoId = activated.json.leadId as number;
    // The lead followed her newest membership, not the Organization she runs.
    const mercado = await one<{ organization_id: number; owner_rep_id: number }>(sql`SELECT organization_id, owner_rep_id FROM sales_leads WHERE id = ${mercadoId}`);
    assert.equal(mercado.organization_id, team.id);
    assert.equal(mercado.owner_rep_id, carla.id);

    // The admin links her other piece to a company the admin created elsewhere.
    const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
    const padaria = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status)
      VALUES (${company.id}, 'RC Padaria', ${admin.id}, 'field', 'lead') RETURNING id`);
    const stranger = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status)
      VALUES (${company.id}, 'RC Stranger', ${admin.id}, 'field', 'lead') RETURNING id`);
    const linked = await api("POST", `/api/xpot/tags/${linkedByAdmin.id}/quick-activate`, "rc-admin", {
      destinationUrl: "https://example.test/review", destinationType: "website", leadId: padaria.id,
    });
    assert.equal(linked.status, 200, linked.text);

    // Customers: both companies, by name.
    const summaries = (await api("GET", "/api/xpot/tags/by-lead", "rc-carla")).json as Array<{ leadId: number; name: string | null; pieces: number }>;
    assert.deepEqual(
      summaries.map((s) => [s.leadId, s.name, s.pieces]).sort((a, b) => Number(a[0]) - Number(b[0])),
      [[mercadoId, "RC Mercado Central", 1], [padaria.id, "RC Padaria", 1]].sort((a, b) => Number(a[0]) - Number(b[0])),
    );
    const leads = await api("GET", "/api/xpot/leads", "rc-carla");
    assert.equal(leads.status, 200, leads.text);
    const names = (leads.json as Array<{ id: number; name: string }>).map((l) => l.name);
    assert.ok(names.includes("RC Mercado Central"), names.join(", "));
    assert.ok(names.includes("RC Padaria"), names.join(", "));
    assert.ok(!names.includes("RC Stranger"), names.join(", "));

    // …and each one opens.
    const opened = await api("GET", `/api/xpot/leads/${mercadoId}`, "rc-carla");
    assert.equal(opened.status, 200, opened.text);
    assert.equal(opened.json.lead.name, "RC Mercado Central");
    assert.equal((await api("GET", `/api/xpot/leads/${padaria.id}`, "rc-carla")).json?.lead?.name, "RC Padaria");
    assert.equal((await api("GET", `/api/xpot/leads/${stranger.id}`, "rc-carla")).status, 403);
    // Holding a piece there lets her edit the company, not delete someone else's lead.
    assert.equal((await api("PATCH", `/api/xpot/leads/${padaria.id}`, "rc-carla", { phone: "+15550000000" })).status, 200);
    assert.equal((await api("DELETE", `/api/xpot/leads/${padaria.id}`, "rc-carla")).status, 403);

    // She can record the sale of her piece to the company holding it.
    await db.execute(sql`UPDATE sales_reps SET cost_policy = 'zero', cost_policy_configured_at = now() WHERE id = ${carla.id}`);
    const sale = await api("POST", "/api/xpot/tag-sales", "rc-carla", {
      leadId: padaria.id,
      lines: [{ salesProductId: product.id, tagIds: [linkedByAdmin.id], unitPriceCents: 2500 }],
      paymentStatus: "paid",
    }, { "idempotency-key": "rc-sale-1" });
    assert.equal(sale.status, 201, sale.text);
    // A company that holds none of her pieces stays out of reach.
    const refused = await api("POST", "/api/xpot/tag-sales", "rc-carla", {
      leadId: stranger.id,
      lines: [{ salesProductId: product.id, tagIds: [own.id], unitPriceCents: 2500 }],
      paymentStatus: "paid",
    }, { "idempotency-key": "rc-sale-2" });
    assert.equal(refused.status, 403, refused.text);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
