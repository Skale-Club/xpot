// Tags › Shop (the showcase that sends resellers to Stuscle): only the Xpot admin keeps the entries, every
// signed-in Tags user reads the published ones, and each link carries that reader's own wholesale code.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It empties
// tag_showcase_items and replaces the sc-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("showcase: the admin keeps it, resellers read the published entries with their own code", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  const clean = async () => {
    await db.execute(sql`DELETE FROM tag_showcase_items`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'sc-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'sc-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'sc-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('sc-admin', 'admin@sc.test', 'Admin', true), ('sc-boss', 'boss@sc.test', 'Boss', false),
    ('sc-ana', 'ana@sc.test', 'Ana', false), ('sc-bia', 'bia@sc.test', 'Bia', false), ('sc-visits', 'visits@sc.test', 'Visits', false)`);
  await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, modules, cost_policy, cost_policy_configured_at) VALUES
    ('sc-admin', 'SC Admin', 'admin@sc.test', 'admin', true, '{visits,tags}', 'zero', now()),
    ('sc-boss', 'SC Boss', 'boss@sc.test', 'manager', true, '{visits,tags}', 'zero', now()),
    ('sc-ana', 'SC Ana', 'ana@sc.test', 'rep', true, '{tags}', 'acquisition', now()),
    ('sc-bia', 'SC Bia', 'bia@sc.test', 'rep', true, '{tags}', 'acquisition', now()),
    ('sc-visits', 'SC Visits', 'visits@sc.test', 'rep', true, '{visits}', 'acquisition', now())`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "sc-admin", email: `${userId}@sc.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (as: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };

  try {
    // Nothing published yet: an empty shop, not an error.
    const empty = await api("sc-ana", "GET", "/api/xpot/tags/showcase");
    assert.equal(empty.status, 200, empty.text);
    assert.deepEqual(empty.json, []);

    // Only the Xpot admin keeps the entries: a manager and a reseller are refused.
    const kit = { kind: "kit", title: "Starter kit", description: "Everything to start", includes: ["Stand", "48 keychains"], items: [{ sku: "KIT-POKEMON-48-STARTER", quantity: 1 }], referencePriceCents: 19900, isPublished: true, sortOrder: 1 };
    for (const who of ["sc-boss", "sc-ana"]) {
      assert.equal((await api(who, "POST", "/api/xpot/admin/tag-showcase", kit)).status, 403, who);
      assert.equal((await api(who, "GET", "/api/xpot/admin/tag-showcase")).status, 403, who);
    }

    // A kit needs SKUs; a model does not.
    assert.equal((await api("sc-admin", "POST", "/api/xpot/admin/tag-showcase", { ...kit, items: [] })).status, 400);
    const created = await api("sc-admin", "POST", "/api/xpot/admin/tag-showcase", kit);
    assert.equal(created.status, 201, created.text);
    const model = await api("sc-admin", "POST", "/api/xpot/admin/tag-showcase", { kind: "model", title: "Large stand", isPublished: true, sortOrder: 2 });
    assert.equal(model.status, 201, model.text);
    const draft = await api("sc-admin", "POST", "/api/xpot/admin/tag-showcase", { kind: "model", title: "Not ready", isPublished: false, sortOrder: 3 });
    assert.equal(draft.status, 201, draft.text);

    // The admin sees all three; a reseller sees the two published ones, in order.
    assert.equal((await api("sc-admin", "GET", "/api/xpot/admin/tag-showcase")).json.length, 3);
    const ana = await api("sc-ana", "GET", "/api/xpot/tags/showcase");
    assert.equal(ana.status, 200, ana.text);
    assert.deepEqual(ana.json.map((item: any) => item.title), ["Starter kit", "Large stand"]);

    // Each link carries the reader's own code; a kit fills the cart, a model opens the wholesale store.
    const codeOf = (url: string) => new URL(url).searchParams.get("code");
    const anaCode = codeOf(ana.json[0].url);
    assert.match(anaCode ?? "", /^XP-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.equal(new URL(ana.json[0].url).pathname, "/wholesale/kit");
    assert.equal(new URL(ana.json[0].url).searchParams.get("items"), "KIT-POKEMON-48-STARTER:1");
    assert.equal(new URL(ana.json[1].url).pathname, "/wholesale");
    assert.equal(codeOf(ana.json[1].url), anaCode);
    const bia = await api("sc-bia", "GET", "/api/xpot/tags/showcase");
    assert.notEqual(codeOf(bia.json[0].url), anaCode);
    // Reading again gives the same code (it is issued once).
    assert.equal(codeOf((await api("sc-ana", "GET", "/api/xpot/tags/showcase")).json[0].url), anaCode);

    // A rep without the Tags module is refused, like the rest of Tags.
    assert.equal((await api("sc-visits", "GET", "/api/xpot/tags/showcase")).status, 403);

    // A patch is merged and validated whole: a kit cannot lose all its SKUs, and a title change keeps the rest.
    const id = created.json.id;
    assert.equal((await api("sc-admin", "PATCH", `/api/xpot/admin/tag-showcase/${id}`, { items: [] })).status, 400);
    const renamed = await api("sc-admin", "PATCH", `/api/xpot/admin/tag-showcase/${id}`, { title: "Pokemon starter kit" });
    assert.equal(renamed.status, 200, renamed.text);
    assert.deepEqual([renamed.json.title, renamed.json.items, renamed.json.isPublished, renamed.json.referencePriceCents], ["Pokemon starter kit", kit.items, true, 19900]);
    assert.equal((await api("sc-admin", "PATCH", `/api/xpot/admin/tag-showcase/${draft.json.id}`, { isPublished: true })).status, 200);
    assert.equal((await api("sc-ana", "GET", "/api/xpot/tags/showcase")).json.length, 3);

    // Unpublishing hides it from resellers; deleting removes it; an unknown id is a 404.
    assert.equal((await api("sc-admin", "PATCH", `/api/xpot/admin/tag-showcase/${id}`, { isPublished: false })).status, 200);
    assert.deepEqual((await api("sc-ana", "GET", "/api/xpot/tags/showcase")).json.map((item: any) => item.title), ["Large stand", "Not ready"]);
    assert.equal((await api("sc-admin", "DELETE", `/api/xpot/admin/tag-showcase/${id}`)).status, 200);
    assert.equal((await api("sc-admin", "DELETE", `/api/xpot/admin/tag-showcase/${id}`)).status, 404);
    assert.equal((await api("sc-admin", "PATCH", `/api/xpot/admin/tag-showcase/${id}`, { title: "Gone" })).status, 404);
    assert.equal((await api("sc-admin", "GET", "/api/xpot/admin/tag-showcase")).json.length, 2);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
