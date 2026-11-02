// Separating a wholesale order (POST /api/xpot/admin/tag-acquisitions/:id/fulfill) against a real Postgres.
// The piece lookup locks rows with FOR UPDATE next to a LEFT JOIN: without `of: tags` Postgres refuses it ("cannot be
// applied to the nullable side of an outer join") and every order failed with a 500 before any rule was checked.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable database with every migration applied
// (npm run migrate). It TRUNCATEs the tag tables and replaces the test users/reps it seeds (prefix wf-). Run it alone
// (other tag integration files truncate the same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/wholesale-fulfill.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("wholesale orders: separating an order moves the pieces to the buyer, bad codes get a clear refusal", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { recordStuscleOrder } = await import("../../server/tags/acquisitions.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'wf-%')`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'wf-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'wf-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('wf-admin', 'admin@wf.test', 'Admin', true), ('wf-ana', 'ana@wf.test', 'Ana', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('wf-admin', 'WF Admin', 'admin@wf.test', 'admin', true, 'acquisition', now()),
    ('wf-ana', 'WF Ana', 'ana@wf.test', 'rep', true, 'acquisition', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES (${company.id}, ${repId["wf-ana"]}, 'member')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "wf-admin", email: `${userId}@wf.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, body?: unknown, user = "wf-admin") => {
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

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('WF-TAGS-PLATE', 'WF plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", { name: "WF run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["W0F00001", "W0F00002", "W0F00003"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, { value: code, idempotencyKey: `wf-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    // A piece of another product (the order below does not have it).
    const other = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('WF-TAGS-STAND', 'WF stand', 'physical', 4000, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const otherBatch = await api("POST", "/api/xpot/admin/tag-batches", { name: "WF stand run", productType: "large_stand", salesProductId: other.id });
    assert.equal(otherBatch.status, 201, otherBatch.text);
    const standCode = "W0F00009";
    const standIntake = await api("POST", `/api/xpot/admin/tag-batches/${otherBatch.json.id}/scan`, { value: standCode, idempotencyKey: `wf-${standCode}` });
    assert.equal(standIntake.status, 201, standIntake.text);

    const order = await recordStuscleOrder({
      externalOrderId: "WF-10455",
      wholesaleCode: "XP-TEST-0001",
      currency: "USD",
      purchasedAt: new Date().toISOString(),
      status: "paid",
      items: [{ sku: "WF-TAGS-PLATE", quantity: 2, subtotalCents: 3000 }],
    }, repId["wf-ana"]);
    assert.ok(order);
    const orderId = order.acquisition.id;
    assert.equal(order.acquisition.status, "pending");

    // The count must match the order, however the pieces are looked up.
    const short = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0]] });
    assert.equal(short.status, 400, short.text);
    assert.equal(short.json.code, "acquisition_quantity_mismatch");

    // Codes that are not in the system: a refusal that names the problem, never a 500.
    const unknown = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0], "ZZZZZZZZ"] });
    assert.equal(unknown.status, 404, unknown.text);
    assert.equal(unknown.json.code, "tag_not_found");

    // A piece that is not in company stock is refused by name.
    await db.execute(sql`UPDATE tags SET stock_status = 'damaged' WHERE public_code = ${codes[2]}`);
    const damaged = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0], codes[2]] });
    assert.equal(damaged.status, 409, damaged.text);
    assert.equal(damaged.json.code, "tag_not_house_stock");
    assert.match(damaged.json.message, new RegExp(codes[2]));
    await db.execute(sql`UPDATE tags SET stock_status = 'available' WHERE public_code = ${codes[2]}`);

    // The screen's check says the same thing the server will: the stand is not part of this order, the plates are ready.
    const check = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/check`, { codes: [codes[0], standCode, codes[1]] });
    assert.equal(check.status, 200, check.text);
    assert.deepEqual(check.json.items.map((i: any) => [i.code, i.ok, i.reason]), [[codes[0], true, null], [standCode, false, "not_in_order"], [codes[1], true, null]]);
    assert.deepEqual(check.json.lines.map((l: any) => [l.quantity, l.filled]), [[2, 2]]);
    // Too many of the right product: the third plate is refused as an excess, the first two stay ready.
    const excess = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/check`, { codes });
    assert.deepEqual(excess.json.items.map((i: any) => i.reason), [null, null, "order_full"]);
    assert.equal((await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/check`, { codes: [codes[0]] }, "wf-ana")).status, 403);

    // A refused separation takes no kit number: K-numbers stay in step with the kits that exist.
    // The last kit number handed out (0 before any).
    const seq = async () => {
      const row = await one<{ last_value: string; is_called: boolean }>(sql`SELECT last_value, is_called FROM tag_kits_kit_number_seq`);
      return row.is_called ? Number(row.last_value) : 0;
    };
    const seqBefore = await seq();
    const wrongProduct = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0], standCode] });
    assert.equal(wrongProduct.status, 409, wrongProduct.text);
    assert.equal(wrongProduct.json.code, "acquisition_product_mismatch");
    assert.equal((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM tag_kits`)).n, 0);
    assert.equal(await seq(), seqBefore);

    // The exact pieces: the order is separated, the pieces go to the buyer and the order is fulfilled.
    const done = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0], codes[1]] });
    assert.equal(done.status, 200, done.text);
    assert.equal(done.json.acquisition.status, "fulfilled");
    assert.ok(done.json.acquisition.kitId);
    assert.equal(done.json.units.length, 2);
    const moved = (await db.execute(sql`SELECT public_code, rep_id, kit_id, ownership_type FROM tags WHERE public_code IN (${codes[0]}, ${codes[1]}) ORDER BY public_code`)).rows as any[];
    assert.deepEqual(moved.map((t) => [t.rep_id, t.ownership_type, t.kit_id === done.json.acquisition.kitId]), [[repId["wf-ana"], "rep", true], [repId["wf-ana"], "rep", true]]);
    const left = await one<{ rep_id: number | null }>(sql`SELECT rep_id FROM tags WHERE public_code = ${codes[2]}`);
    assert.equal(left.rep_id, null);
    // The kit took the very next number after the refusals: nothing was used up on the way.
    const kitNow = await one<{ kit_number: number }>(sql`SELECT kit_number FROM tag_kits WHERE id = ${done.json.acquisition.kitId}`);
    assert.equal(Number(kitNow.kit_number), seqBefore + 1);

    // Separating twice changes nothing.
    const again = await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, { codes: [codes[0], codes[1]] });
    assert.equal(again.status, 200, again.text);
  } finally {
    server.close();
    await pool.end();
  }
});
