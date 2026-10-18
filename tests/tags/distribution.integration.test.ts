// Distribution and intake, end to end: the Hand out and Take back dry runs
// answer per code with the same rules the real actions apply; a kit keeps
// what it handed out (tag_kit_items) and counts returns and moves instead of
// shrinking; the intake station can undo a read it just made, only while the
// piece is untouched; the Overview's "Needs action" counts match the lists
// they open.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds (prefix dx-). Run it
// alone (other tag integration files truncate the same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/distribution.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("tags: distribution dry runs, kit history, intake undo and the Overview queues", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'dx-%')`;
  await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'dx-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'dx-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('dx-admin', 'admin@dx.test', 'Admin', true), ('dx-manager', 'manager@dx.test', 'Manager', false),
    ('dx-ana', 'ana@dx.test', 'Ana', false), ('dx-zed', 'zed@dx.test', 'Zed', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('dx-admin', 'Admin', 'admin@dx.test', 'admin', true, 'acquisition', NOW()),
    ('dx-manager', 'Manager', 'manager@dx.test', 'manager', true, 'acquisition', NOW()),
    ('dx-ana', 'Ana', 'ana@dx.test', 'rep', true, 'acquisition', NOW()),
    ('dx-zed', 'Zed', 'zed@dx.test', 'rep', true, 'zero', NOW())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const products = await db.execute(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES
    ('DX-TAGS-A', 'Distribution plate A', 'physical', 2500, true)
    ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, sku`);
  const productId = Number((products.rows[0] as { id: number }).id);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "dx-admin", email: `${userId}@dx.test` } : {};
    next();
  });
  registerTagRoutes(app);
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
  const ok = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await api(method, path, user, body);
    assert.ok(res.status < 300, `${method} ${path}: ${res.status} ${res.text}`);
    return res.json;
  };

  try {
    // A scanned batch of 8 pieces in stock, and an issued batch of 3 codes not received yet.
    const scanned = await ok("POST", "/api/xpot/admin/tag-batches", "dx-admin", { name: "Dist A", productType: "keychain", salesProductId: productId });
    const codes = Array.from({ length: 8 }, (_, i) => `D${String(i + 1).padStart(7, "0")}`);
    for (const code of codes) await ok("POST", `/api/xpot/admin/tag-batches/${scanned.id}/scan`, "dx-admin", { value: code });
    const issued = await ok("POST", "/api/xpot/admin/tag-batches", "dx-admin", { name: "Dist B", productType: "keychain", salesProductId: productId, quantity: 3 });
    const pieces = (await ok("GET", `/api/xpot/admin/tag-batches/${scanned.id}`, "dx-admin")).tags as Array<{ id: string; publicCode: string }>;
    const issuedPieces = (await ok("GET", `/api/xpot/admin/tag-batches/${issued.id}`, "dx-admin")).tags as Array<{ id: string; publicCode: string }>;
    const p = (n: number) => pieces.find((x) => x.publicCode === codes[n - 1])!;

    // p2 set up for a customer, p3 damaged.
    await ok("POST", `/api/xpot/admin/tags/${p(2).id}/assign`, "dx-admin", { leadName: "Dist Deli" });
    await ok("POST", `/api/xpot/admin/tags/${p(3).id}/damage`, "dx-admin", { reason: "cracked" });

    // ── Hand out dry run: one answer per code, in the order typed. Managers can run it. ──
    const pending = issuedPieces[0].publicCode;
    const check = await ok("POST", "/api/xpot/admin/tag-kits/check", "dx-manager", {
      codes: [p(1).publicCode, p(1).publicCode, "ZZZZZZZZ", pending, p(2).publicCode, p(3).publicCode],
    });
    assert.deepEqual(check.items.map((i: any) => [i.code, i.ok, i.reason]), [
      [p(1).publicCode, true, null],
      [p(1).publicCode, false, "duplicate"],
      ["ZZZZZZZZ", false, "unknown"],
      [pending, false, "not_received"],
      [p(2).publicCode, false, "set_up"],
      [p(3).publicCode, false, "damaged"],
    ]);
    assert.equal(check.okCount, 1);
    assert.equal(check.items[0].batchCode, scanned.batchCode);
    // "Next N from batch": the pieces a kit would take, in serial order, skipping what cannot go.
    const next = await ok("POST", "/api/xpot/admin/tag-kits/check", "dx-manager", { batchId: scanned.id, quantity: 3 });
    assert.deepEqual(next.items.map((i: any) => i.code), [p(1).publicCode, p(4).publicCode, p(5).publicCode]);
    assert.equal(next.okCount, 3);
    // Nothing moved.
    assert.equal((await ok("GET", `/api/xpot/tags?metric=handOut&limit=100`, "dx-manager")).length, 6);

    // ── Ownership: Zed is on the zero rule (consignment by default); a purchase needs a cost. ──
    const purchaseNoCost = await api("POST", "/api/xpot/admin/tag-kits", "dx-manager", { repId: repId["dx-zed"], codes: [p(4).publicCode], ownershipType: "rep" });
    assert.equal(purchaseNoCost.status, 400);
    assert.equal(purchaseNoCost.json.code, "tag_cost_required");
    const kit = await ok("POST", "/api/xpot/admin/tag-kits", "dx-manager", { repId: repId["dx-zed"], codes: [p(4).publicCode, p(5).publicCode, p(6).publicCode] });
    assert.match(kit.kitCode, /^K-\d{4}$/);
    assert.equal(kit.ownershipType, "company");
    assert.deepEqual([kit.handedOutCount, kit.returnedCount, kit.movedCount, kit.stillWithCount], [3, 0, 0, 3]);
    const bought = await ok("POST", "/api/xpot/admin/tag-kits", "dx-manager", { repId: repId["dx-zed"], codes: [p(7).publicCode], ownershipType: "rep", unitCostCents: 450 });
    assert.equal(bought.ownershipType, "rep");
    assert.equal(bought.kitNumber, kit.kitNumber + 1);
    // Handing out a piece already with someone is refused, with the same reason as the dry run.
    const again = await ok("POST", "/api/xpot/admin/tag-kits/check", "dx-manager", { codes: [p(4).publicCode] });
    assert.deepEqual([again.items[0].reason, again.items[0].repName, again.items[0].kitCode], ["with_reseller", "Zed", kit.kitCode]);
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits", "dx-manager", { repId: repId["dx-ana"], codes: [p(4).publicCode], unitCostCents: 1 })).status, 409);

    // ── Take back dry run. p5 gets a customer in Zed's hands. ──
    await ok("POST", `/api/xpot/admin/tags/${p(5).id}/assign`, "dx-admin", { leadName: "Zed Cafe" });
    const back = await ok("POST", "/api/xpot/admin/tag-kits/return/check", "dx-manager", {
      codes: [p(4).publicCode, p(1).publicCode, p(5).publicCode, "YYYYYYYY"],
    });
    assert.deepEqual(back.items.map((i: any) => [i.ok, i.reason]), [[true, null], [false, "not_with_reseller"], [false, "set_up"], [false, "unknown"]]);
    await ok("POST", "/api/xpot/admin/tag-kits/return", "dx-manager", { codes: [p(4).publicCode] });
    // p6 moves to Ana.
    await ok("PATCH", `/api/xpot/admin/tags/${p(6).id}/rep`, "dx-manager", { repId: repId["dx-ana"] });

    // ── The kit keeps what it handed out: 3 = 1 returned + 1 moved + 1 still with Zed. ──
    const [row] = (await ok("GET", `/api/xpot/admin/tag-kits?repId=${repId["dx-zed"]}`, "dx-manager")).filter((k: any) => k.id === kit.id);
    assert.deepEqual([row.handedOutCount, row.returnedCount, row.movedCount, row.stillWithCount, row.pieceCount], [3, 1, 1, 1, 1]);
    const items = await ok("GET", `/api/xpot/admin/tag-kits/${kit.id}/items`, "dx-manager");
    assert.deepEqual(items.map((i: any) => [i.code, i.state]), [
      [p(4).publicCode, "returned"], [p(5).publicCode, "in_kit"], [p(6).publicCode, "moved"],
    ]);
    // Handed out again, the piece's first kit still lists it as returned.
    await ok("POST", "/api/xpot/admin/tag-kits", "dx-manager", { repId: repId["dx-ana"], codes: [p(4).publicCode], unitCostCents: 500 });
    const itemsAfter = await ok("GET", `/api/xpot/admin/tag-kits/${kit.id}/items`, "dx-manager");
    assert.equal(itemsAfter.find((i: any) => i.code === p(4).publicCode).state, "returned");
    assert.equal((await api("GET", `/api/xpot/admin/tag-kits/00000000-0000-0000-0000-000000000000/items`, "dx-manager")).status, 404);

    // ── Intake undo. An issued code goes back to "not received"; the same read can then be made again. ──
    const scanUrl = `/api/xpot/admin/tag-batches/${issued.id}/scan`;
    const key = `intake:${issued.id}:${issuedPieces[1].publicCode}`;
    const first = await api("POST", scanUrl, "dx-admin", { value: issuedPieces[1].publicCode, idempotencyKey: key });
    assert.equal(first.status, 201);
    assert.equal((await api("POST", scanUrl, "dx-admin", { value: issuedPieces[1].publicCode, idempotencyKey: key })).json.alreadyRegistered, true);
    assert.equal((await api("DELETE", `/api/xpot/admin/tag-batches/${issued.id}/tags/${first.json.tag.id}`, "dx-manager")).status, 403);
    const undone = await ok("DELETE", `/api/xpot/admin/tag-batches/${issued.id}/tags/${first.json.tag.id}`, "dx-admin");
    assert.deepEqual([undone.receivedCount, undone.batchCount], [0, 3]);
    const stock = (await db.execute(sql`SELECT stock_status, registered_at FROM tags WHERE id = ${first.json.tag.id}`)).rows[0] as any;
    assert.deepEqual([stock.stock_status, stock.registered_at], ["pending", null]);
    assert.equal((await api("POST", scanUrl, "dx-admin", { value: issuedPieces[1].publicCode, idempotencyKey: key })).status, 201);
    // Undone twice in a row is fine; the history keeps every step (movements are append-only).
    await ok("DELETE", `/api/xpot/admin/tag-batches/${issued.id}/tags/${first.json.tag.id}`, "dx-admin");
    assert.equal((await api("POST", scanUrl, "dx-admin", { value: issuedPieces[1].publicCode, idempotencyKey: key })).status, 201);
    const history = (await db.execute(sql`SELECT movement_type FROM tag_stock_movements WHERE tag_id = ${first.json.tag.id} ORDER BY created_at, id`)).rows.map((r: any) => r.movement_type);
    assert.equal(history.filter((m) => m === "intake").length, 3);
    assert.equal(history.filter((m) => m === "adjustment").length, 2);
    // A scanned batch's piece goes back to "not received" too, keeping its serial; reading it again receives it.
    const extra = await ok("POST", `/api/xpot/admin/tag-batches/${scanned.id}/scan`, "dx-admin", { value: "D0000099" });
    assert.equal(extra.tag.serialNumber, 9);
    const back9 = await ok("DELETE", `/api/xpot/admin/tag-batches/${scanned.id}/tags/${extra.tag.id}`, "dx-admin");
    assert.deepEqual([back9.receivedCount, back9.batchCount], [8, 9]);
    const again9 = await api("POST", `/api/xpot/admin/tag-batches/${scanned.id}/scan`, "dx-admin", { value: "D0000099" });
    assert.deepEqual([again9.status, again9.json.tag.serialNumber, again9.json.receivedCount], [201, 9, 9]);
    // A read already undone (not received) has nothing to undo.
    assert.equal((await api("DELETE", `/api/xpot/admin/tag-batches/${issued.id}/tags/${issuedPieces[2].id}`, "dx-admin")).json.code, "intake_undo_blocked");
    // A piece that moved since (in a kit), or a read too old, cannot be undone.
    const inKit = await api("DELETE", `/api/xpot/admin/tag-batches/${scanned.id}/tags/${p(7).id}`, "dx-admin");
    assert.deepEqual([inKit.status, inKit.json.code], [409, "intake_undo_blocked"]);
    await db.execute(sql`UPDATE tags SET registered_at = now() - interval '2 hours' WHERE id = ${first.json.tag.id}`);
    const old = await api("DELETE", `/api/xpot/admin/tag-batches/${issued.id}/tags/${first.json.tag.id}`, "dx-admin");
    assert.deepEqual([old.status, old.json.code], [409, "intake_undo_expired"]);

    // ── Overview: the funnel is the shared stock numbers; each queue count is the list it opens. ──
    await db.execute(sql`INSERT INTO tag_events (tag_id, access_method, event_type, is_bot, occurred_at)
      VALUES (${p(1).id}, 'qr', 'inventory_scan', false, now() - interval '1 day'),
             (${p(1).id}, 'qr', 'inventory_scan', false, now() - interval '2 days'),
             (${p(8).id}, 'qr', 'inventory_scan', false, now() - interval '20 days')`);
    await db.execute(sql`INSERT INTO tag_acquisitions (rep_id, source, external_ref, status) VALUES (${repId["dx-ana"]}, 'stuscle', 'dx-order-1', 'pending')`);
    await db.execute(sql`UPDATE tag_batches SET sales_product_id = NULL WHERE id = ${issued.id}`);
    await db.execute(sql`UPDATE tags SET sales_product_id = NULL WHERE batch_id = ${issued.id}`);
    const overview = await ok("GET", "/api/xpot/admin/tags/overview", "dx-manager");
    const all = await ok("GET", "/api/xpot/tags?limit=2000", "dx-admin");
    for (const metric of ["notReceived", "house", "withResellers", "sold", "live"] as const) {
      assert.equal(overview.funnel[metric], (await ok("GET", `/api/xpot/tags?metric=${metric}&limit=2000`, "dx-manager")).length, metric);
    }
    assert.equal(overview.funnel.notReceived, 2);
    assert.deepEqual(
      [overview.queues.stuscleOrders, overview.queues.batchesNotReceived, overview.queues.chipPending, overview.queues.scannedNotLive, overview.queues.noProduct],
      [1, 1, 2, 1, 3],
    );
    for (const queue of ["chipPending", "scannedNotLive", "noProduct"] as const) {
      const list = await ok("GET", `/api/xpot/tags?queue=${queue}&limit=2000`, "dx-manager");
      assert.equal(list.length, overview.queues[queue], queue);
    }
    assert.deepEqual((await ok("GET", "/api/xpot/tags?queue=scannedNotLive", "dx-manager")).map((t: any) => t.publicCode), [p(1).publicCode]);
    assert.equal(all.length, 12);
    assert.equal((await api("GET", "/api/xpot/tags?queue=nope", "dx-manager")).status, 400);
  } finally {
    server.close();
    await pool.end();
  }
});
