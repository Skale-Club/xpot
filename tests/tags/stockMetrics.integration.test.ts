// One definition per stock number, end to end: pieces are seeded in every
// state, then every admin endpoint that counts them (Overview / Kits header,
// Batches list, a batch's detail, the Team report, a kit row, the Pieces list
// behind a card) must give the same numbers as the shared rules
// (shared/tagMetrics.ts). Also: kit cost rule and ownership, the managers'
// batch picker, house activation by management, Move through the stock
// service, and batch edits that must not overwrite piece mappings.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds (prefix sm-). Run it
// alone (other tag integration files truncate the same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/stockMetrics.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import { countStockMetric, type TagStockMetric } from "../../shared/tagMetrics.js";

const enabled = process.env.TAGS_INTEGRATION === "1";
const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

test.skipIf(!enabled)("tags: every screen counts the same stock the same way", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'sm-%')`;
  await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'sm-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'sm-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('sm-admin', 'admin@sm.test', 'Admin', true), ('sm-manager', 'manager@sm.test', 'Manager', false),
    ('sm-ana', 'ana@sm.test', 'Ana', false), ('sm-zed', 'zed@sm.test', 'Zed', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('sm-admin', 'Admin', 'admin@sm.test', 'admin', true, 'acquisition', NOW()),
    ('sm-manager', 'Manager', 'manager@sm.test', 'manager', true, 'acquisition', NOW()),
    ('sm-ana', 'Ana', 'ana@sm.test', 'rep', true, 'acquisition', NOW()),
    ('sm-zed', 'Zed', 'zed@sm.test', 'rep', true, 'zero', NOW())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const products = await db.execute(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES
    ('SM-TAGS-A', 'Metrics plate A', 'physical', 2500, true), ('SM-TAGS-B', 'Metrics plate B', 'physical', 3000, true)
    ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, sku`);
  const productId = Object.fromEntries((products.rows as Array<{ id: number; sku: string }>).map((r) => [r.sku, Number(r.id)]));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "sm-admin", email: `${userId}@sm.test` } : {};
    next();
  });
  registerTagRoutes(app);
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
    // Two batches: 14 pieces in stock, plus 2 codes issued but not received.
    const batchA = await ok("POST", "/api/xpot/admin/tag-batches", "sm-admin", { name: "Metrics A", productType: "keychain", salesProductId: productId["SM-TAGS-A"] });
    const codesA = Array.from({ length: 14 }, (_, i) => `M${String(i + 1).padStart(7, "0")}`);
    for (const code of codesA) await ok("POST", `/api/xpot/admin/tag-batches/${batchA.id}/scan`, "sm-admin", { value: code });
    const batchB = await ok("POST", "/api/xpot/admin/tag-batches", "sm-admin", { name: "Metrics B", productType: "keychain", salesProductId: productId["SM-TAGS-A"], quantity: 2 });
    const piecesA = (await ok("GET", `/api/xpot/admin/tag-batches/${batchA.id}`, "sm-admin")).tags as Array<{ id: string; publicCode: string }>;
    const byCode = (code: string) => piecesA.find((p) => p.publicCode === code)!;
    const p = (n: number) => byCode(codesA[n - 1]);

    // Managers hand out kits too: they read the batch picker, not the batches.
    assert.equal((await api("GET", "/api/xpot/admin/tag-batches", "sm-manager")).status, 403);
    const options = await ok("GET", "/api/xpot/admin/tag-batch-options", "sm-manager");
    assert.deepEqual(Object.keys(options[0]).sort(), ["batchCode", "face", "handOutCount", "houseCount", "id", "name", "productType"]);
    assert.equal(options.find((o: any) => o.id === batchA.id).handOutCount, 14);
    assert.equal(options.find((o: any) => o.id === batchB.id).handOutCount, 0);

    // Kit cost follows the rep's rule. Ana buys (acquisition): a cost is required and the pieces become hers.
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits", "sm-manager", { repId: repId["sm-ana"], batchId: batchA.id, quantity: 5 })).status, 400);
    const kitAna = await ok("POST", "/api/xpot/admin/tag-kits", "sm-manager", { repId: repId["sm-ana"], batchId: batchA.id, quantity: 5, unitCostCents: 700 });
    // Zed is on the zero rule: no cost needed; the pieces stay company stock in his custody, no acquisition.
    const kitZed = await ok("POST", "/api/xpot/admin/tag-kits", "sm-manager", { repId: repId["sm-zed"], codes: [p(6).publicCode, p(7).publicCode] });
    const kitZedRef = await ok("POST", "/api/xpot/admin/tag-kits", "sm-manager", { repId: repId["sm-zed"], codes: [p(8).publicCode], unitCostCents: 300 });
    const ownership = async (code: string) => (await db.execute(sql`SELECT ownership_type, custodian_rep_id, rep_id FROM tags WHERE public_code = ${code}`)).rows[0] as any;
    assert.deepEqual(await ownership(p(1).publicCode), { ownership_type: "rep", custodian_rep_id: repId["sm-ana"], rep_id: repId["sm-ana"] });
    assert.deepEqual(await ownership(p(6).publicCode), { ownership_type: "company", custodian_rep_id: repId["sm-zed"], rep_id: repId["sm-zed"] });
    // A reference cost under the zero rule is recorded, but the stock stays the company's.
    assert.deepEqual(await ownership(p(8).publicCode), { ownership_type: "company", custodian_rep_id: repId["sm-zed"], rep_id: repId["sm-zed"] });
    const acquisitions = (await db.execute(sql`SELECT kit_id FROM tag_acquisitions`)).rows.map((r: any) => r.kit_id).sort();
    assert.deepEqual(acquisitions, [kitAna.id, kitZedRef.id].sort());
    const moves = (await db.execute(sql`SELECT count(*)::int AS n FROM tag_stock_movements WHERE movement_type = 'transfer' AND reference_id = ${kitZed.id}`)).rows[0] as any;
    assert.equal(moves.n, 2);

    // Ana: p1 set up and live, then sold; p2 live without a sale; p3 set up only; p4, p5 untouched.
    const live1 = await ok("POST", `/api/xpot/tags/${p(1).id}/quick-activate`, "sm-ana", { destinationUrl: REVIEW, destinationType: "google_review", leadName: "Metrics Cafe" });
    await ok("POST", "/api/xpot/tag-sales", "sm-ana", {
      leadId: live1.leadId, lines: [{ salesProductId: productId["SM-TAGS-A"], tagIds: [p(1).id], unitPriceCents: 2500 }], paymentStatus: "paid",
    }, { "idempotency-key": "sm-sale-1" });
    await ok("POST", `/api/xpot/tags/${p(2).id}/quick-activate`, "sm-ana", { destinationUrl: REVIEW, destinationType: "google_review", leadId: live1.leadId });
    await ok("POST", `/api/xpot/admin/tags/${p(3).id}/assign`, "sm-admin", { leadId: live1.leadId });
    // House: p9 set up for a customer; p10 damaged; p11 internal use; p12 retired; p13, p14 untouched.
    await ok("POST", `/api/xpot/admin/tags/${p(9).id}/assign`, "sm-admin", { leadName: "House Deli" });
    await ok("POST", `/api/xpot/admin/tags/${p(10).id}/damage`, "sm-admin", { reason: "cracked" });
    await ok("POST", `/api/xpot/admin/tags/${p(11).id}/internal-use`, "sm-admin", { purpose: "demo" });
    await ok("POST", `/api/xpot/admin/tags/${p(12).id}/retire`, "sm-admin", { reason: "lost" });

    // Expected, by the rules: house p9 p13 p14 (+p11? no: internal use is not stock) = 3; with reps unsold p2..p5 p6 p7 p8 = 7.
    const all = await ok("GET", "/api/xpot/tags?limit=2000", "sm-admin");
    const count = (metric: TagStockMetric) => countStockMetric(all, metric);
    assert.equal(count("house"), 3);
    assert.equal(count("withResellers"), 7);
    assert.equal(count("sold"), 1);
    assert.equal(count("live"), 2);
    assert.equal(count("notReceived"), 2);
    assert.equal(count("damaged"), 1);

    // Overview (also the Kits header).
    const overview = await ok("GET", "/api/xpot/admin/tags/overview", "sm-manager");
    assert.deepEqual(overview.stock, { house: count("house"), withResellers: count("withResellers") });
    assert.equal(overview.counts.damaged, count("damaged"));
    assert.equal(overview.counts.active, count("live"));
    // Every lifecycle card counts by digital status alone, as its ?status= list does.
    for (const status of ["inventory", "assigned", "active", "disabled", "retired"]) {
      assert.equal(overview.counts[status], all.filter((t: any) => t.status === status).length, status);
    }
    // The list behind each stock card reproduces its number.
    for (const metric of ["house", "withResellers", "sold", "damaged", "notReceived"] as TagStockMetric[]) {
      assert.equal((await ok("GET", `/api/xpot/tags?metric=${metric}&limit=2000`, "sm-manager")).length, count(metric), metric);
    }

    // Batches list (sums over batches) and each batch's detail, counted in TS with the same rules.
    const batches = await ok("GET", "/api/xpot/admin/tag-batches", "sm-admin");
    const sum = (key: string) => batches.reduce((n: number, b: any) => n + b[key], 0);
    assert.equal(sum("houseCount"), count("house"));
    assert.equal(sum("withResellersCount"), count("withResellers"));
    assert.equal(sum("soldCount"), count("sold"));
    assert.equal(sum("activeCount"), count("live"));
    assert.equal(sum("pendingCount"), count("notReceived"));
    assert.equal(sum("damagedCount"), count("damaged"));
    assert.equal(sum("handOutCount"), count("handOut"));
    for (const b of batches) {
      const detail = await ok("GET", `/api/xpot/admin/tag-batches/${b.id}`, "sm-admin");
      assert.equal(detail.houseCount, countStockMetric(detail.tags, "house"));
      assert.equal(detail.withResellersCount, countStockMetric(detail.tags, "withResellers"));
      assert.equal(detail.soldCount, countStockMetric(detail.tags, "sold"));
    }

    // Team report: company stock on the no-rep row, unsold stock per rep.
    const report = await ok("GET", "/api/xpot/admin/tags/report?range=7d", "sm-manager");
    assert.equal(report.unassigned.inStock, count("house"));
    assert.equal(report.reps.reduce((n: number, r: any) => n + r.inStock, 0), count("withResellers"));
    assert.equal(report.reps.find((r: any) => r.repId === repId["sm-ana"]).inStock, 4);

    // A kit row: unsold (p2..p5), of which returnable now (p4, p5: not set up), and sold (p1).
    const [anaKit] = await ok("GET", `/api/xpot/admin/tag-kits?repId=${repId["sm-ana"]}`, "sm-manager");
    assert.deepEqual([anaKit.pieceCount, anaKit.unsoldCount, anaKit.returnableCount, anaKit.soldCount], [5, 4, 2, 1]);
    const anaPieces = await ok("GET", `/api/xpot/tags?kitId=${kitAna.id}`, "sm-manager");
    assert.equal(countStockMetric(anaPieces, "returnable"), anaKit.returnableCount);
    assert.equal(countStockMetric(anaPieces, "sold"), anaKit.soldCount);
  } finally {
    server.close();
    await pool.end();
  }
});
