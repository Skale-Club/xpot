// The organization filter of Inventory and Distribution › Kits (UXR-22):
// GET /api/xpot/tags?organizationId= and GET /api/xpot/admin/tag-kits?organizationId=
// narrow the lists for platform management (Xpot admin, manager) in management
// mode, and are ignored for anyone else: a reseller's list stays their own
// pieces, and a manager viewing as a rep gets their own list, unfiltered.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database. It TRUNCATEs the tag tables and replaces the of-* users
// and their organizations.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("organization filter: Inventory and Kits narrow for management, ignored for others", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'of-%')`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'of-test-%'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'of-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'of-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('of-admin', 'admin@of.test', 'Admin', true), ('of-manager', 'manager@of.test', 'Manager', false),
    ('of-ana', 'ana@of.test', 'Ana', false), ('of-zed', 'zed@of.test', 'Zed', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('of-admin', 'OF Admin', 'admin@of.test', 'admin', true, 'zero', now()),
    ('of-manager', 'OF Manager', 'manager@of.test', 'manager', true, 'zero', now()),
    ('of-ana', 'OF Ana', 'ana@of.test', 'rep', true, 'zero', now()),
    ('of-zed', 'OF Zed', 'zed@of.test', 'rep', true, 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const orgA = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('OF North', 'of-test-north') RETURNING id`);
  const orgB = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('OF South', 'of-test-south') RETURNING id`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "of-admin", email: `${userId}@of.test` } : {};
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
  const codesOf = (list: Array<{ publicCode: string }>) => list.map((t) => t.publicCode).sort();

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('OF-TAGS-PLATE', 'OF plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "of-admin", { name: "OF run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["K0F00001", "K0F00002", "K0F00003", "K0F00004"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "of-admin", { value: code, idempotencyKey: `of-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    // Two kits, one per organization: Ana's (North) and Zed's (South); the fourth piece stays in the house, in South.
    const kitA = await api("POST", "/api/xpot/admin/tag-kits", "of-admin", { repId: repId["of-ana"], codes: [codes[0], codes[1]] });
    assert.equal(kitA.status, 201, kitA.text);
    const kitB = await api("POST", "/api/xpot/admin/tag-kits", "of-admin", { repId: repId["of-zed"], codes: [codes[2]] });
    assert.equal(kitB.status, 201, kitB.text);
    await db.execute(sql`UPDATE tags SET organization_id = ${orgA.id} WHERE public_code IN (${codes[0]}, ${codes[1]})`);
    await db.execute(sql`UPDATE tags SET organization_id = ${orgB.id} WHERE public_code IN (${codes[2]}, ${codes[3]})`);
    await db.execute(sql`UPDATE tag_kits SET organization_id = ${orgA.id} WHERE rep_id = ${repId["of-ana"]}`);
    await db.execute(sql`UPDATE tag_kits SET organization_id = ${orgB.id} WHERE rep_id = ${repId["of-zed"]}`);

    // Management: the admin and a manager get one organization's pieces and kits.
    for (const user of ["of-admin", "of-manager"]) {
      const north = await api("GET", `/api/xpot/tags?organizationId=${orgA.id}`, user);
      assert.equal(north.status, 200, north.text);
      assert.deepEqual(codesOf(north.json), [codes[0], codes[1]], user);
      const south = await api("GET", `/api/xpot/tags?organizationId=${orgB.id}`, user);
      assert.deepEqual(codesOf(south.json), [codes[2], codes[3]], user);
      // Combined with another filter: South's house stock.
      const southHouse = await api("GET", `/api/xpot/tags?organizationId=${orgB.id}&house=1`, user);
      assert.deepEqual(codesOf(southHouse.json), [codes[3]], user);
      assert.equal((await api("GET", "/api/xpot/tags", user)).json.length, 4, user);

      const kitsNorth = await api("GET", `/api/xpot/admin/tag-kits?organizationId=${orgA.id}`, user);
      assert.equal(kitsNorth.status, 200, kitsNorth.text);
      assert.deepEqual(kitsNorth.json.map((k: { repId: number }) => k.repId), [repId["of-ana"]], user);
      const kitsSouth = await api("GET", `/api/xpot/admin/tag-kits?organizationId=${orgB.id}`, user);
      assert.deepEqual(kitsSouth.json.map((k: { repId: number }) => k.repId), [repId["of-zed"]], user);
      assert.equal((await api("GET", "/api/xpot/admin/tag-kits", user)).json.length, 2, user);
    }

    // A reseller lists only pieces of an Organization they are active in, as the piece itself
    // allows (security review A09): Ana's are in North, where she is not a member yet.
    assert.deepEqual((await api("GET", "/api/xpot/tags", "of-ana")).json, []);
    await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES (${orgA.id}, ${repId["of-ana"]}, 'member')
      ON CONFLICT DO NOTHING`);
    // A reseller: their own pieces whatever organization they ask for.
    const anaSouth = await api("GET", `/api/xpot/tags?organizationId=${orgB.id}`, "of-ana");
    assert.equal(anaSouth.status, 200, anaSouth.text);
    assert.deepEqual(codesOf(anaSouth.json), [codes[0], codes[1]]);
    // A Rep Admin in management mode: Tags lists do not widen for them (listScope), so still their own.
    await db.execute(sql`UPDATE organization_memberships SET role = 'admin' WHERE organization_id = ${orgA.id} AND rep_id = ${repId["of-ana"]}`);
    const anaManaging = await api("GET", `/api/xpot/tags?organizationId=${orgB.id}`, "of-ana", undefined, { "x-xpot-view": "manage" });
    assert.deepEqual(codesOf(anaManaging.json), [codes[0], codes[1]]);
    // Kits stay management's.
    assert.equal((await api("GET", `/api/xpot/admin/tag-kits?organizationId=${orgA.id}`, "of-ana")).status, 403);

    // A manager viewing as a rep: their own (empty) list; the kits filter is ignored.
    const asRep = { "x-xpot-view": "rep" };
    const managerAsRep = await api("GET", `/api/xpot/tags?organizationId=${orgA.id}`, "of-manager", undefined, asRep);
    assert.deepEqual(managerAsRep.json, []);
    const kitsAsRep = await api("GET", `/api/xpot/admin/tag-kits?organizationId=${orgA.id}`, "of-manager", undefined, asRep);
    assert.equal(kitsAsRep.json.length, 2);

    // Junk is refused, not ignored.
    assert.equal((await api("GET", "/api/xpot/tags?organizationId=abc", "of-admin")).status, 400);
    assert.equal((await api("GET", "/api/xpot/admin/tag-kits?organizationId=0", "of-admin")).status, 400);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
