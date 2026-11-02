// The Stock list's server side: pieces not in stock yet leave the default view (`hidePending`) but stay one filter
// away, the chip counts and the lists they open agree (shared/tagMetrics.ts), and the "Scanned, not live" queue
// carries the date of the scan that put a piece there (`lastInventoryScanAt`).
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the sl-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("stock list: hidePending, counts that match their lists, the scan date of a queue", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'sl-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'sl-%'`);
  };
  await clean();
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES ('sl-admin', 'admin@sl.test', 'Admin', true)`);
  await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at)
    VALUES ('sl-admin', 'SL Admin', 'admin@sl.test', 'admin', true, 'zero', now())`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: "sl-admin", isAdmin: true, email: "admin@sl.test" };
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const codesOf = (list: Array<{ publicCode: string }>) => list.map((t) => t.publicCode).sort();

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('SL-TAGS-PLATE', 'SL plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", { name: "SL run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["K0S00001", "K0S00002", "K0S00003", "K0S00004"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, { value: code, idempotencyKey: `sl-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    // Two stay in stock, one is not in stock yet, one is scanned by someone while not live.
    await db.execute(sql`UPDATE tags SET stock_status = 'pending' WHERE public_code = ${codes[2]}`);
    const scanned = await one<{ id: string }>(sql`SELECT id FROM tags WHERE public_code = ${codes[3]}`);
    await db.execute(sql`INSERT INTO tag_events (tag_id, access_method, event_type, occurred_at) VALUES (${scanned.id}, 'qr', 'inventory_scan', now() - interval '2 days')`);

    const all = await api("GET", "/api/xpot/tags?limit=100");
    assert.deepEqual(codesOf(all.json), [...codes].sort());

    // The default view leaves the not-yet-arrived piece out; asking for it (or searching its code) finds it.
    const shown = await api("GET", "/api/xpot/tags?limit=100&hidePending=1");
    assert.deepEqual(codesOf(shown.json), [codes[0], codes[1], codes[3]].sort());
    const asked = await api("GET", "/api/xpot/tags?limit=100&metric=notReceived");
    assert.deepEqual(codesOf(asked.json), [codes[2]]);

    // A chip's count is what its list shows.
    const overview = await api("GET", "/api/xpot/admin/tags/overview");
    assert.equal(overview.status, 200, overview.text);
    for (const [chip, metric] of [["notReceived", "notReceived"], ["house", "house"], ["withCustomer", "withCustomer"], ["withResellers", "withResellers"], ["sold", "sold"], ["live", "live"]] as const) {
      const list = await api("GET", `/api/xpot/tags?limit=100&metric=${metric}`);
      assert.equal(list.json.length, overview.json.funnel[chip], `${chip}: the chip and its list count the same pieces`);
    }

    // The queue says when the piece was scanned; no other list pays for it.
    const queue = await api("GET", "/api/xpot/tags?queue=scannedNotLive&limit=100");
    assert.equal(queue.json.length, overview.json.queues.scannedNotLive);
    assert.deepEqual(codesOf(queue.json), [codes[3]]);
    assert.ok(queue.json[0].lastInventoryScanAt, "the scan date is on the row");
    assert.equal(all.json.every((t: { lastInventoryScanAt: string | null }) => t.lastInventoryScanAt === null), true);
    assert.equal(all.json[0].printJobStatus, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await clean();
    await pool.end();
  }
});
