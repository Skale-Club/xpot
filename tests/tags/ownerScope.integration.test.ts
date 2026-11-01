// An organization's owner in Tags management (docs/PROFILES_EXECUTION_PLAN.md, F1 and F4): they run their own
// organization through the same API as the platform and never reach another's, and house stock is per organization.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the os-* users and their organizations.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("an owner manages their organization's pieces and stock, and nothing else", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'os-%')`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'os-test-%' OR slug IN (SELECT 'rep-' || id FROM sales_reps WHERE user_id LIKE 'os-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'os-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'os-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('os-admin', 'admin@os.test', 'Admin', true),
    ('os-ana', 'ana@os.test', 'Ana', false), ('os-bia', 'bia@os.test', 'Bia', false),
    ('os-zed', 'zed@os.test', 'Zed', false), ('os-yan', 'yan@os.test', 'Yan', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('os-admin', 'OS Admin', 'admin@os.test', 'admin', true, 'zero', now()),
    ('os-ana', 'OS Ana', 'ana@os.test', 'rep', true, 'zero', now()),
    ('os-bia', 'OS Bia', 'bia@os.test', 'rep', true, 'zero', now()),
    ('os-zed', 'OS Zed', 'zed@os.test', 'rep', true, 'zero', now()),
    ('os-yan', 'OS Yan', 'yan@os.test', 'rep', true, 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const north = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('OS North', 'os-test-north') RETURNING id`);
  const south = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('OS South', 'os-test-south') RETURNING id`);
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${north.id}, ${repId["os-ana"]}, 'admin'), (${north.id}, ${repId["os-bia"]}, 'member'),
    (${south.id}, ${repId["os-zed"]}, 'admin'), (${south.id}, ${repId["os-yan"]}, 'member')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "os-admin", email: `${userId}@os.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const manage = { "x-xpot-view": "manage" };
  const codesOf = (list: Array<{ publicCode: string }>) => list.map((t) => t.publicCode).sort();
  const orgOf = async (code: string) => (await one<{ organization_id: number }>(sql`SELECT organization_id FROM tags WHERE public_code = ${code}`)).organization_id;

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('OS-TAGS-PLATE', 'OS plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "os-admin", { name: "OS run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["K0S00001", "K0S00002", "K0S00003", "K0S00004", "K0S00005", "K0S00006"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "os-admin", { value: code, idempotencyKey: `os-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    const [a1, a2, a3, z1, z2, house] = codes;
    const kit = async (user: string, repKey: string, list: string[]) => api("POST", "/api/xpot/admin/tag-kits", user, { repId: repId[repKey], codes: list });

    // The platform hands pieces to each organization's owner; the sixth stays in the company's house.
    assert.equal((await kit("os-admin", "os-ana", [a1, a2, a3])).status, 201);
    assert.equal((await kit("os-admin", "os-zed", [z1, z2])).status, 201);
    assert.equal(await orgOf(a1), north.id);
    assert.equal(await orgOf(z1), south.id);
    assert.equal(await orgOf(house), company.id);

    // ── Who gets in ──
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-ana")).status, 200);
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-bia")).status, 403, "an employee has no management");
    assert.equal((await api("GET", "/api/xpot/admin/tag-kits", "os-bia")).status, 403);
    assert.equal((await api("GET", "/api/xpot/admin/tag-batches", "os-ana")).status, 403, "an owner makes no pieces");
    assert.equal((await api("POST", "/api/xpot/admin/tag-batches", "os-ana", { name: "x", productType: "keychain" })).status, 403);
    assert.equal((await api("POST", "/api/xpot/admin/tags", "os-ana", { productType: "keychain", salesProductId: product.id })).status, 403);

    // ── What they see ──
    const overview = await api("GET", "/api/xpot/admin/tags/overview", "os-ana");
    assert.equal(overview.json.counts.total, 3, "North's pieces only");
    assert.equal(overview.json.stock.withResellers, 3);
    assert.equal(overview.json.stock.house, 0);
    assert.equal((await api("GET", `/api/xpot/admin/tags/overview?organizationId=${south.id}`, "os-ana")).json.counts.total, 3, "asking for another organization changes nothing");
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-admin")).json.counts.total, 6, "the platform sees every organization");
    assert.equal((await api("GET", `/api/xpot/admin/tags/overview?organizationId=${south.id}`, "os-admin")).json.counts.total, 2);

    assert.deepEqual(codesOf((await api("GET", "/api/xpot/tags", "os-ana", undefined, manage)).json), [a1, a2, a3]);
    assert.deepEqual(codesOf((await api("GET", `/api/xpot/tags?organizationId=${south.id}`, "os-ana", undefined, manage)).json), [a1, a2, a3]);
    assert.deepEqual((await api("GET", "/api/xpot/tags", "os-bia", undefined, manage)).json, [], "an employee's list stays their own");

    const kits = await api("GET", "/api/xpot/admin/tag-kits", "os-ana");
    assert.deepEqual(kits.json.map((k: { repId: number }) => k.repId), [repId["os-ana"]]);
    const southKit = (await api("GET", "/api/xpot/admin/tag-kits", "os-zed")).json[0];
    assert.equal((await api("GET", `/api/xpot/admin/tag-kits/${southKit.id}/items`, "os-ana")).status, 404);

    const report = await api("GET", "/api/xpot/admin/tags/report", "os-ana");
    assert.equal(report.status, 200, report.text);
    assert.ok(report.json.reps.every((r: { repId: number }) => r.repId !== repId["os-zed"]), "no other organization's people in the report");

    // ── Another organization's piece reads as not found ──
    const list = (await api("GET", "/api/xpot/tags", "os-zed", undefined, manage)).json as Array<{ id: string; publicCode: string }>;
    const zedPiece = list.find((t) => t.publicCode === z1)!;
    assert.equal((await api("POST", `/api/xpot/admin/tags/${zedPiece.id}/damage`, "os-ana", { reason: "x" })).status, 404);
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${zedPiece.id}/rep`, "os-ana", { repId: repId["os-bia"] })).status, 404);
    assert.equal((await api("GET", `/api/xpot/admin/tags/${zedPiece.id}/analytics`, "os-ana")).status, 404);
    assert.equal((await api("GET", `/api/xpot/admin/tags/${zedPiece.id}/qr.svg`, "os-ana")).status, 404);

    // ── Stock inside the organization ──
    // Back from the owner's own hands into the organization's house, which is theirs to hand out again.
    const back = await api("POST", "/api/xpot/admin/tag-kits/return", "os-ana", { codes: [a1, a2] });
    assert.equal(back.status, 200, back.text);
    assert.equal(back.json.returned, 2);
    assert.equal(await orgOf(a1), north.id, "it stays in North");
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-ana")).json.stock.house, 2, "North's house stock");
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-admin")).json.stock.house, 1, "the company's own number never adds North's");
    assert.equal((await api("GET", `/api/xpot/admin/tags/overview?organizationId=${north.id}`, "os-admin")).json.stock.house, 2);
    assert.deepEqual(codesOf((await api("GET", "/api/xpot/tags?house=1", "os-admin")).json), [house], "unnarrowed, house stock is the company's");

    // They hand it to their employee, and only to their employee.
    const check = await api("POST", "/api/xpot/admin/tag-kits/check", "os-ana", { codes: [a1, house] });
    assert.deepEqual(check.json.items.map((i: { reason: string | null }) => i.reason), [null, "unknown"], "the company's piece is not theirs to give");
    assert.equal((await kit("os-ana", "os-bia", [a1])).status, 201);
    assert.equal((await kit("os-ana", "os-yan", [a2])).status, 403, "South's employee");
    assert.equal((await kit("os-ana", "os-bia", [house])).status, 409, "the company's house stock");
    const options = await api("GET", "/api/xpot/admin/tag-batch-options", "os-ana");
    assert.deepEqual(options.json.map((o: { houseCount: number }) => o.houseCount), [1], "a1 left; a2 is what North still holds");

    // A move stays inside too; Bia's piece back to North's house, not the company's.
    const biaPiece = (await api("GET", "/api/xpot/tags", "os-ana", undefined, manage)).json.find((t: { publicCode: string }) => t.publicCode === a1);
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${biaPiece.id}/rep`, "os-ana", { repId: repId["os-yan"] })).status, 403);
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${biaPiece.id}/rep`, "os-ana", { repId: null })).status, 200);
    assert.equal(await orgOf(a1), north.id);

    // Another organization's code in a return reads as unknown, and nothing moves.
    const crossed = await api("POST", "/api/xpot/admin/tag-kits/return", "os-ana", { codes: [z1] });
    assert.equal(crossed.status, 404, crossed.text);
    assert.equal(await orgOf(z1), south.id);

    // The platform receiving a piece takes it into the company's house.
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "os-admin", { codes: [z1] })).status, 200);
    assert.equal(await orgOf(z1), company.id);

    // ── Orders ──
    await db.execute(sql`INSERT INTO tag_acquisitions (rep_id, organization_id, source, external_ref, status, purchased_at) VALUES
      (${repId["os-bia"]}, ${north.id}, 'stuscle', 'os-order-1', 'pending', now()),
      (${repId["os-yan"]}, ${south.id}, 'stuscle', 'os-order-2', 'pending', now())`);
    const orders = await api("GET", "/api/xpot/admin/tag-acquisitions", "os-ana");
    assert.deepEqual(orders.json.map((o: { acquisition: { externalRef: string } }) => o.acquisition.externalRef), ["os-order-1"]);
    assert.equal((await api("GET", "/api/xpot/admin/tags/overview", "os-ana")).json.queues.stuscleOrders, 1);
    assert.equal(orders.json.length, 1);
    assert.equal((await api("GET", "/api/xpot/admin/tag-acquisitions", "os-admin")).json.length, 2);
    const orderId = orders.json[0].acquisition.id;
    assert.equal((await api("POST", `/api/xpot/admin/tag-acquisitions/${orderId}/fulfill`, "os-ana", { codes: [a2] })).status, 403, "separating an order is the platform's");
  } finally {
    await clean();
    server.close();
    await pool.end();
  }
});
