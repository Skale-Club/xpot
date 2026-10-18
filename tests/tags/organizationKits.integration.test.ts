// A kit handed out from an Organization (POST /api/xpot/organizations/:id/kits)
// follows the same cost rule as Distribution (shared/tagKits.ts): the
// acquisition rule needs a cost, and a rep on the zero-cost rule holds company
// stock even when a reference cost is recorded.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database. It TRUNCATEs the tag tables and replaces the ok-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("organization kits: the rep's cost rule decides cost and ownership", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { createOrganizationsRouter } = await import("../../server/routes/xpot/organizations.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'ok-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'ok-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'ok-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('ok-admin', 'admin@ok.test', 'Admin', true), ('ok-ana', 'ana@ok.test', 'Ana', false), ('ok-zed', 'zed@ok.test', 'Zed', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('ok-admin', 'OK Admin', 'admin@ok.test', 'admin', true, 'acquisition', now()),
    ('ok-ana', 'OK Ana', 'ana@ok.test', 'rep', true, 'acquisition', now()),
    ('ok-zed', 'OK Zed', 'zed@ok.test', 'rep', true, 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${company.id}, ${repId["ok-ana"]}, 'member'), (${company.id}, ${repId["ok-zed"]}, 'member')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "ok-admin", email: `${userId}@ok.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createOrganizationsRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": "ok-admin" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('OK-TAGS-PLATE', 'OK plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", { name: "OK run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["K0K00001", "K0K00002", "K0K00003"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, { value: code, idempotencyKey: `ok-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }

    // Acquisition rule without a cost: refused with the hand-out's own code, nothing moves.
    const refused = await api("POST", `/api/xpot/organizations/${company.id}/kits`, { repId: repId["ok-ana"], codes: [codes[0]] });
    assert.equal(refused.status, 400, refused.text);
    assert.equal(refused.json.code, "tag_cost_required");
    assert.equal((await one<{ rep_id: number | null }>(sql`SELECT rep_id FROM tags WHERE public_code = ${codes[0]}`)).rep_id, null);

    // With a cost: the rep buys the pieces.
    assert.equal((await api("POST", `/api/xpot/organizations/${company.id}/kits`, { repId: repId["ok-ana"], codes: [codes[0]], unitCostCents: 900 })).status, 201);
    assert.equal((await one<{ ownership_type: string }>(sql`SELECT ownership_type FROM tags WHERE public_code = ${codes[0]}`)).ownership_type, "rep");

    // Zero-cost rule with a reference cost: still company stock in the rep's custody (consignment).
    assert.equal((await api("POST", `/api/xpot/organizations/${company.id}/kits`, { repId: repId["ok-zed"], codes: [codes[1]], unitCostCents: 900 })).status, 201);
    const zed = await one<{ ownership_type: string; rep_id: number }>(sql`SELECT ownership_type, rep_id FROM tags WHERE public_code = ${codes[1]}`);
    assert.deepEqual(zed, { ownership_type: "company", rep_id: repId["ok-zed"] });

    // A piece that is not house stock answers 409 with its code, not a 500.
    const taken = await api("POST", `/api/xpot/organizations/${company.id}/kits`, { repId: repId["ok-zed"], codes: [codes[1]] });
    assert.equal(taken.status, 409, taken.text);
    assert.equal(taken.json.code, "tag_not_house_stock");
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
