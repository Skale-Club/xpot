// Deleting a company against a real Postgres. A company with only visits, tasks or deals goes, with all of them, and the
// list/detail say how many go along. A company holding a sale, a consignment or a piece is kept: DELETE answers 409
// `lead_delete_blocked` with the counts, before anything is deleted (the piece keeps its customer, the visits stay). The
// list and the detail carry the same counts the app hides Delete with (shared/leadDeletion.ts).
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the ld-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("deleting a company: free ones go with their records, held ones are kept with the counts", async () => {
  const { registerTagRoutes } = await import("../server/tags/routes.js");
  const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
  const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
  const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'ld-%')`;
  const testLeads = sql`(SELECT id FROM sales_leads WHERE name LIKE 'LD %')`;
  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_tasks WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_opportunities_local WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_consignments WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_visits WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_lead_contacts WHERE lead_id IN ${testLeads}`);
    await db.execute(sql`DELETE FROM sales_lead_locations WHERE lead_id IN ${testLeads}`);
    await db.execute(sql`DELETE FROM sales_leads WHERE name LIKE 'LD %'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'ld-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'ld-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('ld-admin', 'admin@ld.test', 'Admin', true), ('ld-ana', 'ana@ld.test', 'Ana', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, modules, cost_policy, cost_policy_configured_at) VALUES
    ('ld-admin', 'LD Admin', 'admin@ld.test', 'admin', true, ARRAY['visits','tags'], 'zero', now()),
    ('ld-ana', 'LD Ana', 'ana@ld.test', 'rep', true, ARRAY['visits','tags'], 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  const newLead = async (name: string) => (await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status)
    VALUES (${company.id}, ${name}, ${repId["ld-admin"]}, 'field', 'lead') RETURNING id`)).id;

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "ld-admin", email: `${userId}@ld.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createLeadsRouter());
  app.use("/api/xpot", createSalesRouter());
  app.use("/api/xpot", createConsignmentsRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const rows = async (table: string, leadId: number) => (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE lead_id = ${leadId}`)).n;
  const exists = async (leadId: number) => (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_leads WHERE id = ${leadId}`)).n === 1;
  const listed = async (leadId: number) => (await api("GET", "/api/xpot/leads?limit=200", "ld-admin")).json.find((l: any) => l.id === leadId);
  const NONE = { orders: 0, sales: 0, consignments: 0, pieces: 0, visits: 0, tasks: 0, deals: 0 };

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active, consignable)
      VALUES ('LD-TAGS-PLATE', 'LD plate', 'physical', 2500, true, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, consignable = true, is_active = true RETURNING id`);

    // ── Only visits, tasks and deals: allowed, and the counts say how many go along. ──
    const free = await newLead("LD Free");
    const visit = await one<{ id: number }>(sql`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES (${repId["ld-admin"]}, ${free}, 'completed') RETURNING id`);
    await db.execute(sql`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES (${repId["ld-admin"]}, ${free}, 'planned')`);
    const deal = await one<{ id: number }>(sql`INSERT INTO sales_opportunities_local (lead_id, rep_id, title) VALUES (${free}, ${repId["ld-admin"]}, 'LD deal') RETURNING id`);
    // Three tasks, each reached a different way: on the company, on a visit, on a deal.
    await db.execute(sql`INSERT INTO sales_tasks (organization_id, lead_id, rep_id, title) VALUES (${company.id}, ${free}, ${repId["ld-admin"]}, 'LD on the company')`);
    await db.execute(sql`INSERT INTO sales_tasks (organization_id, visit_id, rep_id, title) VALUES (${company.id}, ${visit.id}, ${repId["ld-admin"]}, 'LD on a visit')`);
    await db.execute(sql`INSERT INTO sales_tasks (organization_id, opportunity_id, rep_id, title) VALUES (${company.id}, ${deal.id}, ${repId["ld-admin"]}, 'LD on a deal')`);
    const counts = { ...NONE, visits: 2, tasks: 3, deals: 1 };
    assert.deepEqual((await api("GET", `/api/xpot/leads/${free}`, "ld-admin")).json.deletion, counts, "the detail");
    assert.deepEqual((await listed(free)).deletion, counts, "the list");
    const gone = await api("DELETE", `/api/xpot/leads/${free}`, "ld-admin");
    assert.equal(gone.status, 204, gone.text);
    assert.equal(await exists(free), false);
    assert.deepEqual([await rows("sales_visits", free), await rows("sales_opportunities_local", free), await rows("sales_tasks", free)], [0, 0, 0]);
    assert.equal((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_tasks WHERE title LIKE 'LD on %'`)).n, 0, "the tasks of its visits and deals go too");

    // ── A sale keeps it. Nothing is deleted: the visit and the deal are still there. ──
    const sold = await newLead("LD Sold");
    await db.execute(sql`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES (${repId["ld-admin"]}, ${sold}, 'completed')`);
    await db.execute(sql`INSERT INTO sales_opportunities_local (lead_id, rep_id, title) VALUES (${sold}, ${repId["ld-admin"]}, 'LD deal 2')`);
    const sale = await api("POST", "/api/xpot/sales", "ld-admin", { leadId: sold, items: [{ description: "Website", quantity: 1, unitPriceCents: 10000 }], paymentStatus: "paid" });
    assert.equal(sale.status, 201, sale.text);
    const refusedSale = await api("DELETE", `/api/xpot/leads/${sold}`, "ld-admin");
    assert.equal(refusedSale.status, 409, refusedSale.text);
    assert.equal(refusedSale.json.code, "lead_delete_blocked");
    assert.deepEqual(refusedSale.json.counts, { ...NONE, sales: 1, visits: 1, deals: 1 });
    assert.equal(refusedSale.json.message, "This company can't be deleted because it has 1 sale.");
    assert.equal(await exists(sold), true);
    assert.deepEqual([await rows("sales_visits", sold), await rows("sales_opportunities_local", sold), await rows("sales_sales", sold)], [1, 1, 1]);
    assert.deepEqual((await listed(sold)).deletion, { ...NONE, sales: 1, visits: 1, deals: 1 });

    // ── Consigned stock keeps it. ──
    const consigned = await newLead("LD Consigned");
    const deposit = await api("POST", "/api/xpot/consignments/deposit", "ld-admin", { leadId: consigned, productId: product.id, quantity: 2 });
    assert.equal(deposit.status, 201, deposit.text);
    const refusedStock = await api("DELETE", `/api/xpot/leads/${consigned}`, "ld-admin");
    assert.equal(refusedStock.status, 409, refusedStock.text);
    assert.deepEqual(refusedStock.json.counts, { ...NONE, consignments: 1 });
    assert.equal(await exists(consigned), true);

    // ── A piece keeps it, and keeps its customer (before, it was left with none). ──
    const held = await newLead("LD Held");
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "ld-admin", { name: "LD run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const scanned = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "ld-admin", { value: "LD000001", idempotencyKey: "ld-LD000001" });
    assert.equal(scanned.status, 201, scanned.text);
    const piece = await api("GET", "/api/xpot/tags/lookup/LD000001", "ld-admin");
    const assigned = await api("POST", `/api/xpot/admin/tags/${piece.json.id}/assign`, "ld-admin", { leadId: held });
    assert.equal(assigned.status, 200, assigned.text);
    const refusedPiece = await api("DELETE", `/api/xpot/leads/${held}`, "ld-admin");
    assert.equal(refusedPiece.status, 409, refusedPiece.text);
    assert.equal(refusedPiece.json.code, "lead_delete_blocked");
    assert.deepEqual(refusedPiece.json.counts, { ...NONE, pieces: 1 });
    assert.equal(refusedPiece.json.message, "This company can't be deleted because it has 1 piece.");
    assert.equal(await exists(held), true);
    assert.equal((await one<{ lead_id: number }>(sql`SELECT lead_id FROM tags WHERE id = ${piece.json.id}`)).lead_id, held, "the piece keeps its customer");

    // Taking the piece off the company (it goes back to no customer) frees it: now it can go.
    await db.execute(sql`UPDATE tags SET lead_id = NULL, status = 'inventory' WHERE id = ${piece.json.id}`);
    assert.deepEqual((await listed(held)).deletion, NONE);
    assert.equal((await api("DELETE", `/api/xpot/leads/${held}`, "ld-admin")).status, 204);
    assert.equal(await exists(held), false);

    // ── Several reasons at once are all named. ──
    const both = await newLead("LD Both");
    await api("POST", "/api/xpot/sales", "ld-admin", { leadId: both, items: [{ description: "Website", quantity: 1, unitPriceCents: 500 }], paymentStatus: "unpaid" });
    await api("POST", "/api/xpot/sales", "ld-admin", { leadId: both, items: [{ description: "Logo", quantity: 1, unitPriceCents: 700 }], paymentStatus: "unpaid" });
    await api("POST", "/api/xpot/consignments/deposit", "ld-admin", { leadId: both, productId: product.id, quantity: 1 });
    const refusedBoth = await api("DELETE", `/api/xpot/leads/${both}`, "ld-admin");
    assert.equal(refusedBoth.status, 409, refusedBoth.text);
    assert.equal(refusedBoth.json.message, "This company can't be deleted because it has 2 sales and 1 consignment.");

    // ── Who may still decides first: a rep who is not the owner gets the owner-only 403, not the counts. ──
    assert.equal((await api("DELETE", `/api/xpot/leads/${both}`, "ld-ana")).status, 403);
    assert.equal((await api("DELETE", "/api/xpot/leads/999999999", "ld-admin")).status, 404);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
