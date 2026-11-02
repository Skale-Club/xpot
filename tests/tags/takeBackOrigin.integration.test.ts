// Take back puts each piece into the stock of the organization its kit came from, not always the company's (NAV-4):
// the dry run says where each piece goes, the real action does it, a mixed list splits by kit, an owner never pushes
// pieces into an organization they cannot see, and a kit from before the source was recorded keeps the old destination.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the tb-* users and their organizations. Run it alone (other tag integration files truncate the
// same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/takeBackOrigin.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("take back: each piece returns to the organization its kit came from", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'tb-%')`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'tb-test-%' OR slug IN (SELECT 'rep-' || id FROM sales_reps WHERE user_id LIKE 'tb-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'tb-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'tb-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('tb-admin', 'admin@tb.test', 'Admin', true),
    ('tb-hana', 'hana@tb.test', 'Hana', false), ('tb-hal', 'hal@tb.test', 'Hal', false),
    ('tb-ana', 'ana@tb.test', 'Ana', false), ('tb-ned', 'ned@tb.test', 'Ned', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('tb-admin', 'TB Admin', 'admin@tb.test', 'admin', true, 'zero', now()),
    ('tb-hana', 'TB Hana', 'hana@tb.test', 'rep', true, 'zero', now()),
    ('tb-hal', 'TB Hal', 'hal@tb.test', 'rep', true, 'zero', now()),
    ('tb-ana', 'TB Ana', 'ana@tb.test', 'rep', true, 'zero', now()),
    ('tb-ned', 'TB Ned', 'ned@tb.test', 'rep', true, 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const harbor = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('TB Harbor', 'tb-test-harbor') RETURNING id`);
  const north = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('TB North', 'tb-test-north') RETURNING id`);
  const company = await one<{ id: number; name: string }>(sql`SELECT id, name FROM organizations WHERE slug = 'xpot-company'`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${harbor.id}, ${repId["tb-hana"]}, 'admin'), (${harbor.id}, ${repId["tb-hal"]}, 'member'),
    (${north.id}, ${repId["tb-ana"]}, 'admin'), (${north.id}, ${repId["tb-ned"]}, 'member')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "tb-admin", email: `${userId}@tb.test` } : {};
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
  const orgOf = async (code: string) => (await one<{ organization_id: number }>(sql`SELECT organization_id FROM tags WHERE public_code = ${code}`)).organization_id;
  const kit = async (user: string, repKey: string, codes: string[]) => {
    const res = await api("POST", "/api/xpot/admin/tag-kits", user, { repId: repId[repKey], codes });
    assert.equal(res.status, 201, res.text);
    return res.json;
  };

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
      VALUES ('TB-TAGS-PLATE', 'TB plate', 'physical', 2500, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "tb-admin", { name: "TB run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["K0T00001", "K0T00002", "K0T00003", "K0T00004", "K0T00005", "K0T00006", "K0T00007", "K0T00008"];
    for (const code of codes) {
      const intake = await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "tb-admin", { value: code, idempotencyKey: `tb-${code}` });
      assert.equal(intake.status, 201, intake.text);
    }
    const [h1, h2, h3, c1, c2, c3, c4, old1] = codes;
    // Harbor prints its own pieces: its stock holds h1 to h3 (a partner's batch, as production puts it).
    await db.execute(sql`UPDATE tags SET organization_id = ${harbor.id} WHERE public_code IN (${h1}, ${h2}, ${h3})`);

    // Harbor's owner hands out of Harbor's stock; the platform hands out of the company's.
    const harborKit = await kit("tb-hana", "tb-hal", [h1, h2, h3]);
    const companyKit = await kit("tb-admin", "tb-ned", [c1, c2, c3]);
    const northKit = await kit("tb-admin", "tb-ana", [c4]);
    assert.equal(await orgOf(h1), harbor.id);
    assert.equal(await orgOf(c1), north.id, "the kit moved them into North");
    const stored = (await db.execute(sql`SELECT id, source_organization_id FROM tag_kits`)).rows as Array<{ id: string; source_organization_id: number | null }>;
    assert.equal(stored.find((k) => k.id === harborKit.id)!.source_organization_id, harbor.id);
    assert.equal(stored.find((k) => k.id === companyKit.id)!.source_organization_id, company.id);

    // The kits list says where "Take back unsold" sends each kit, for the person asking.
    const list = (await api("GET", "/api/xpot/admin/tag-kits", "tb-admin")).json as Array<{ id: string; takeBackTo: { organizationId: number; name: string } }>;
    assert.deepEqual(list.find((k) => k.id === harborKit.id)!.takeBackTo, { organizationId: harbor.id, name: "TB Harbor", company: false });
    assert.deepEqual(list.find((k) => k.id === companyKit.id)!.takeBackTo, { organizationId: company.id, name: company.name, company: true });

    // The dry run answers per code, with the destination for the pieces that can come back.
    const check = await api("POST", "/api/xpot/admin/tag-kits/return/check", "tb-admin", { codes: [h1, c1, "ZZZZZZZZ"] });
    assert.equal(check.status, 200, check.text);
    assert.deepEqual(check.json.items.map((i: any) => [i.code, i.ok, i.goesTo?.name ?? null]), [[h1, true, "TB Harbor"], [c1, true, company.name], ["ZZZZZZZZ", false, null]]);

    // A list that mixes two kits splits: Harbor's piece to Harbor, the company's to the company.
    const mixed = await api("POST", "/api/xpot/admin/tag-kits/return", "tb-admin", { codes: [h1, c1] });
    assert.equal(mixed.status, 200, mixed.text);
    assert.equal(mixed.json.returned, 2);
    assert.deepEqual(
      mixed.json.to.map((d: any) => [d.name, d.count]).sort(),
      [[company.name, 1], ["TB Harbor", 1]].sort(),
    );
    assert.equal(await orgOf(h1), harbor.id);
    assert.equal(await orgOf(c1), company.id);
    const house = (await db.execute(sql`SELECT rep_id, kit_id, ownership_type, stock_status FROM tags WHERE public_code IN (${h1}, ${c1})`)).rows as any[];
    assert.ok(house.every((t) => t.rep_id === null && t.kit_id === null && t.ownership_type === "company" && t.stock_status === "available"));

    // Harbor's owner takes back inside Harbor; the platform takes back what is left of Harbor's kit into Harbor.
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "tb-hana", { codes: [h2] })).status, 200);
    assert.equal(await orgOf(h2), harbor.id);
    const rest = await api("POST", "/api/xpot/admin/tag-kits/return", "tb-admin", { codes: [h3] });
    assert.deepEqual(rest.json.to.map((d: any) => d.name), ["TB Harbor"]);
    assert.equal(await orgOf(h3), harbor.id);

    // An owner never pushes pieces into an organization they cannot see: North's owner takes back a piece the platform
    // handed out of the company's stock, and it stays in North's own stock.
    const northBack = await api("POST", "/api/xpot/admin/tag-kits/return", "tb-ana", { codes: [c4] });
    assert.equal(northBack.status, 200, northBack.text);
    assert.deepEqual(northBack.json.to.map((d: any) => d.name), ["TB North"]);
    assert.equal(await orgOf(c4), north.id);
    assert.ok(northKit);

    // A kit from before the source was recorded keeps the old destination: the company's, for the platform.
    const oldKit = await kit("tb-admin", "tb-ned", [old1]);
    await db.execute(sql`UPDATE tag_kits SET source_organization_id = NULL WHERE id = ${oldKit.id}`);
    const oldBack = await api("POST", "/api/xpot/admin/tag-kits/return", "tb-admin", { codes: [old1] });
    assert.deepEqual(oldBack.json.to.map((d: any) => d.name), [company.name]);
    assert.equal(await orgOf(old1), company.id);

    // Another organization's code still reads as unknown to an owner, and nothing moves.
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "tb-ana", { codes: [c2] })).status, 200, "North's own piece");
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "tb-ana", { codes: [h3] })).status, 404, "Harbor's piece is not theirs");
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
