// The one piece screen's server side: the field analytics (Performance), the
// activity feed (Sale and Activity; stock movements only on the management
// side), and cancelling a piece's financial sale, which must give the piece
// back to stock so it can be sold again.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds (prefix ps-). Run it
// alone (other tag integration files truncate the same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/pieceScreen.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";
const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

test.skipIf(!enabled)("tags: piece screen analytics, activity and sale cancel", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { createSalesRouter } = await import("../../server/routes/xpot/sales.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'ps-%')`;
  await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'ps-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'ps-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('ps-admin', 'admin@ps.test', 'Admin', true), ('ps-manager', 'manager@ps.test', 'Manager', false),
    ('ps-ana', 'ana@ps.test', 'Ana', false), ('ps-zed', 'zed@ps.test', 'Zed', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('ps-admin', 'Admin', 'admin@ps.test', 'admin', true, 'acquisition', NOW()),
    ('ps-manager', 'Manager', 'manager@ps.test', 'manager', true, 'acquisition', NOW()),
    ('ps-ana', 'Ana', 'ana@ps.test', 'rep', true, 'acquisition', NOW()),
    ('ps-zed', 'Zed', 'zed@ps.test', 'rep', true, 'zero', NOW())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const [product] = (await db.execute(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES
    ('PS-TAGS-A', 'Piece screen plate', 'physical', 2500, true)
    ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`)).rows as Array<{ id: number }>;
  const productId = Number(product.id);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "ps-admin", email: `${userId}@ps.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createSalesRouter());
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
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const ok = async (method: string, path: string, user: string, body?: unknown, extraHeaders?: Record<string, string>) => {
    const res = await api(method, path, user, body, extraHeaders);
    assert.ok(res.status < 300, `${method} ${path}: ${res.status} ${res.text}`);
    return res.json;
  };

  try {
    const batch = await ok("POST", "/api/xpot/admin/tag-batches", "ps-admin", { name: "Piece screen", productType: "keychain", salesProductId: productId });
    for (const code of ["P0000001", "P0000002"]) await ok("POST", `/api/xpot/admin/tag-batches/${batch.id}/scan`, "ps-admin", { value: code });
    const pieces = (await ok("GET", `/api/xpot/admin/tag-batches/${batch.id}`, "ps-admin")).tags as Array<{ id: string; publicCode: string }>;
    const piece = pieces.find((p) => p.publicCode === "P0000001")!;
    // Ana buys it in a kit (acquisition: the piece becomes hers), sets it up and sells it.
    await ok("POST", "/api/xpot/admin/tag-kits", "ps-manager", { repId: repId["ps-ana"], codes: [piece.publicCode], unitCostCents: 700 });
    const live = await ok("POST", `/api/xpot/tags/${piece.id}/quick-activate`, "ps-ana", { destinationUrl: REVIEW, destinationType: "google_review", leadName: "Piece Cafe" });
    await db.execute(sql`INSERT INTO tag_events (tag_id, access_method, event_type, occurred_at, visitor_day_key, is_bot)
      VALUES (${piece.id}, 'qr', 'redirect', NOW() - interval '2 days', 'v1', false), (${piece.id}, 'nfc', 'redirect', NOW() - interval '1 day', 'v2', false)`);
    const sale = await ok("POST", "/api/xpot/tag-sales", "ps-ana", {
      leadId: live.leadId, lines: [{ salesProductId: productId, tagIds: [piece.id], unitPriceCents: 2500 }], paymentStatus: "paid",
    }, { "idempotency-key": "ps-sale-1" });

    // Performance: the reseller reads the same analytics as the admin, by range.
    const analytics = await ok("GET", `/api/xpot/tags/${piece.id}/analytics?range=7d`, "ps-ana");
    assert.deepEqual([analytics.totals.qr, analytics.totals.nfc, analytics.topTags.length], [1, 1, 0]);
    const adminAnalytics = await ok("GET", `/api/xpot/admin/tags/${piece.id}/analytics?range=7d`, "ps-manager");
    assert.deepEqual(analytics.totals, adminAnalytics.totals);
    assert.equal((await ok("GET", `/api/xpot/tags/${piece.id}/analytics?range=today`, "ps-ana")).totals.interactions, 0);
    // Someone else's piece stays out of reach.
    assert.equal((await api("GET", `/api/xpot/tags/${piece.id}/analytics`, "ps-zed")).status, 403);
    assert.equal((await api("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-zed")).status, 403);

    // Activity: the reseller gets the sale, not the stock movements; management gets both.
    const repActivity = await ok("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-ana");
    assert.equal(repActivity.movements, null);
    assert.equal(repActivity.sales.length, 1);
    assert.deepEqual(
      { saleId: repActivity.sales[0].saleId, status: repActivity.sales[0].status, priceCents: repActivity.sales[0].priceCents, sellerName: repActivity.sales[0].sellerName },
      { saleId: sale.sale.id, status: "active", priceCents: 2500, sellerName: "Ana" },
    );
    const managed = await ok("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-manager");
    const types = managed.movements.map((m: any) => m.movementType);
    assert.equal(types[0], "sale");
    assert.ok(types.includes("transfer"), types.join());
    assert.ok(managed.movements.some((m: any) => m.movementType === "sale" && m.referenceId === String(sale.sale.id)));
    // A manager viewing as a rep (admin mode off) gets the rep's answer.
    assert.equal((await ok("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-manager", undefined, { "x-xpot-view": "rep" })).movements, null);

    // Cancelling the sale gives the piece back: in stock with Ana, her own again, sellable.
    const cancelled = await ok("POST", `/api/xpot/sales/${sale.sale.id}/cancel`, "ps-manager", { reason: "Customer returned it" });
    assert.equal(cancelled.sale.status, "cancelled");
    const after = await ok("GET", `/api/xpot/tags/${piece.id}`, "ps-ana");
    assert.deepEqual(
      { saleId: after.saleId, soldAt: after.soldAt, stockStatus: after.stockStatus, ownershipType: after.ownershipType, custodianRepId: after.custodianRepId, repId: after.repId, leadId: after.leadId },
      { saleId: null, soldAt: null, stockStatus: "available", ownershipType: "rep", custodianRepId: repId["ps-ana"], repId: repId["ps-ana"], leadId: live.leadId },
    );
    const afterActivity = await ok("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-manager");
    assert.equal(afterActivity.sales[0].status, "cancelled");
    assert.equal(afterActivity.sales[0].cancelReason, "Customer returned it");
    assert.ok(afterActivity.sales[0].endedAt);
    const restore = afterActivity.movements.find((m: any) => m.movementType === "restore");
    assert.deepEqual(
      { from: restore.fromStockStatus, to: restore.toStockStatus, toOwnership: restore.toOwnershipType, ref: restore.referenceId, actor: restore.actorEmail },
      { from: "sold", to: "available", toOwnership: "rep", ref: String(sale.sale.id), actor: "manager@ps.test" },
    );
    // Cancelling again changes nothing.
    await ok("POST", `/api/xpot/sales/${sale.sale.id}/cancel`, "ps-manager", {});
    assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM tag_stock_movements WHERE tag_id = ${piece.id} AND movement_type = 'restore'`)).rows[0].n, 1);

    // It can be sold again, to the same customer.
    const again = await api("POST", "/api/xpot/tag-sales", "ps-ana", {
      leadId: live.leadId, lines: [{ salesProductId: productId, tagIds: [piece.id], unitPriceCents: 2600 }], paymentStatus: "paid",
    }, { "idempotency-key": "ps-sale-2" });
    assert.equal(again.status, 201, again.text);
    const resold = await ok("GET", `/api/xpot/tags/${piece.id}`, "ps-ana");
    assert.deepEqual([resold.saleId, resold.stockStatus, resold.soldPriceCents], [again.json.sale.id, "sold", 2600]);
    assert.deepEqual((await ok("GET", `/api/xpot/tags/${piece.id}/activity`, "ps-ana")).sales.map((s: any) => s.status), ["active", "cancelled"]);
  } finally {
    server.close();
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN ${testReps}`);
    await pool.end();
  }
});
