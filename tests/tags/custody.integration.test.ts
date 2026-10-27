// Custody from the phone, end to end (docs/TAG_CUSTODY_EXECUTION_PLAN.md, phases 0 and 1): testing a
// chip (write, lock, erase) never moves stock; receiving is explicit, into the house (management) or
// the receiver's own stock; a received piece goes back to the house from the phone; a colleague's
// piece opens in the limited view, which never shows its customer or link.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable database with every
// migration applied (npm run migrate). It TRUNCATEs the tag tables and replaces the test users/reps
// it seeds (prefix cu-). Movement lists leave out the `issue` row every printed code starts with. Run it alone (other tag integration files truncate the same tables):
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/custody.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("tags: custody from the phone — test, receive, hand back, limited view", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'cu-%')`;
  await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN ${testReps}`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'cu-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'cu-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('cu-admin', 'admin@cu.test', 'Admin', true), ('cu-ana', 'ana@cu.test', 'Ana', false),
    ('cu-zed', 'zed@cu.test', 'Zed', false), ('cu-pat', 'pat@cu.test', 'Pat', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at, modules) VALUES
    ('cu-admin', 'Admin', 'admin@cu.test', 'admin', true, 'zero', NOW(), '{visits,tags}'),
    ('cu-ana', 'Ana', 'ana@cu.test', 'rep', true, 'zero', NOW(), '{tags}'),
    ('cu-zed', 'Zed', 'zed@cu.test', 'rep', true, 'zero', NOW(), '{tags}'),
    ('cu-pat', 'Pat', 'pat@cu.test', 'rep', true, 'zero', NOW(), '{tags}')
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const products = await db.execute(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES
    ('CU-PLATE', 'Custody plate', 'physical', 2500, true)
    ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`);
  const productId = Number((products.rows[0] as { id: number }).id);
  const company = (await db.execute(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`)).rows[0] as { id: number };
  const partner = (await db.execute(sql`INSERT INTO organizations (name, slug) VALUES ('Custody partner', 'cu-partner')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`)).rows[0] as { id: number };
  // Ana and Zed work for the company; Pat for a partner Organization.
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${company.id}, ${repId["cu-ana"]}, 'member'), (${company.id}, ${repId["cu-zed"]}, 'member'), (${partner.id}, ${repId["cu-pat"]}, 'member')`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "cu-admin", email: `${userId}@cu.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string, body?: unknown, view?: "rep" | "manage") => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user, ...(view ? { "x-xpot-view": view } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const ok = async (method: string, path: string, user: string, body?: unknown, view?: "rep" | "manage") => {
    const res = await api(method, path, user, body, view);
    assert.ok(res.status < 300, `${method} ${path}: ${res.status} ${res.text}`);
    return res.json;
  };
  const row = async (id: string) => (await db.execute(sql`SELECT stock_status, rep_id, custodian_rep_id, ownership_type,
    nfc_provisioning_status, registered_by_user_id FROM tags WHERE id = ${id}`)).rows[0] as any;
  const movements = async (id: string) => (await db.execute(sql`SELECT movement_type, to_custodian_rep_id, reason
    FROM tag_stock_movements WHERE tag_id = ${id} AND movement_type <> 'issue' ORDER BY created_at, id`)).rows as any[];
  const allMovements = async (id: string) => Number(((await db.execute(sql`SELECT count(*)::int AS n FROM tag_stock_movements WHERE tag_id = ${id}`)).rows[0] as any).n);

  try {
    // Four printed codes, none received yet.
    const batch = await ok("POST", "/api/xpot/admin/tag-batches", "cu-admin", { name: "Custody", productType: "large_plate", salesProductId: productId, quantity: 4 });
    const pieces = (await ok("GET", `/api/xpot/admin/tag-batches/${batch.id}`, "cu-admin")).tags as Array<{ id: string; publicCode: string }>;
    const [p1, p2, p3, p4] = pieces;

    // ── Testing a chip never moves stock: write, read back, erase, write again, lock. ──
    const before = await row(p1.id);
    const movementsBefore = await allMovements(p1.id);
    await ok("POST", `/api/xpot/tags/${p1.id}/nfc-written`, "cu-admin", { method: "web_nfc", readbackUrl: `https://xpot.place/n/${p1.publicCode}` });
    const erased = await ok("POST", `/api/xpot/tags/${p1.id}/nfc-erased`, "cu-admin", {});
    assert.equal(erased.nfcStatus, "not_programmed");
    await ok("POST", `/api/xpot/tags/${p1.id}/nfc-written`, "cu-admin", { method: "web_nfc", readbackUrl: `https://xpot.place/n/${p1.publicCode}` });
    await ok("POST", `/api/xpot/tags/${p1.id}/nfc-locked`, "cu-admin", {});
    const after = await row(p1.id);
    assert.deepEqual(
      [after.stock_status, after.rep_id, after.custodian_rep_id, after.ownership_type],
      [before.stock_status, before.rep_id, before.custodian_rep_id, before.ownership_type],
    );
    assert.equal(after.stock_status, "pending");
    assert.equal(await allMovements(p1.id), movementsBefore);
    // A locked chip can't be erased.
    const lockedErase = await api("POST", `/api/xpot/tags/${p1.id}/nfc-erased`, "cu-admin", {});
    assert.deepEqual([lockedErase.status, lockedErase.json.code], [409, "chip_locked_cannot_erase"]);

    // ── What the piece screen offers: management receives for the house first. ──
    const detail = await ok("GET", `/api/xpot/tags/${p1.id}`, "cu-admin");
    assert.deepEqual(detail.custody, { access: "full", receive: { targets: ["house", "me"], blocker: null }, returnToHouse: null });
    // Viewing as a rep, the admin receives into their own stock.
    assert.deepEqual((await ok("GET", `/api/xpot/tags/${p1.id}`, "cu-admin", undefined, "rep")).custody.receive.targets, ["me"]);

    // ── The admin receives p1 for the house: an intake, no holder. ──
    const housed = await ok("POST", `/api/xpot/tags/${p1.id}/receive`, "cu-admin", { into: "house" });
    assert.deepEqual([housed.stockStatus, housed.repId], ["available", null]);
    assert.deepEqual((await movements(p1.id)).map((m) => [m.movement_type, m.to_custodian_rep_id, m.reason]), [["intake", null, "auto:received_field"]]);
    // A retry by the same person answers with the piece as it is; nothing is recorded twice.
    await ok("POST", `/api/xpot/tags/${p1.id}/receive`, "cu-admin", { into: "house" });
    assert.equal((await movements(p1.id)).length, 1);

    // ── Ana opens a pending piece of her Organization: limited, with Receive into her own stock. ──
    const lookup = await ok("GET", `/api/xpot/tags/lookup/${p2.publicCode}`, "cu-ana");
    assert.equal(lookup.access, "limited");
    const limited = await ok("GET", `/api/xpot/tags/${p2.id}`, "cu-ana");
    assert.equal(limited.limited, true);
    assert.deepEqual(limited.custody.receive, { targets: ["me"], blocker: null });
    assert.equal(limited.destinationUrl, undefined);
    assert.equal(limited.leadName, undefined);
    assert.equal(limited.nfcUrl, undefined);
    // She can't receive for the house, nor write its chip.
    const houseByRep = await api("POST", `/api/xpot/tags/${p2.id}/receive`, "cu-ana", { into: "house" });
    assert.deepEqual([houseByRep.status, houseByRep.json.code], [403, "tag_receive_house_forbidden"]);
    assert.equal((await api("POST", `/api/xpot/tags/${p2.id}/nfc-written`, "cu-ana", { method: "manual" })).status, 403);
    // She receives it: hers now, the full screen, with Hand back.
    const mine = await ok("POST", `/api/xpot/tags/${p2.id}/receive`, "cu-ana", { into: "me" });
    assert.deepEqual([mine.stockStatus, mine.repId, mine.custody.access], ["available", repId["cu-ana"], "full"]);
    assert.deepEqual(mine.custody.returnToHouse, { blocker: null });
    const r2 = await row(p2.id);
    assert.deepEqual([r2.custodian_rep_id, r2.ownership_type, r2.registered_by_user_id], [repId["cu-ana"], "company", "cu-ana"]);
    assert.deepEqual((await movements(p2.id)).map((m) => [m.movement_type, m.to_custodian_rep_id]), [["intake", repId["cu-ana"]]]);

    // ── Zed sees Ana's piece limited: with Ana, nothing to do. A house piece too. ──
    const colleague = await ok("GET", `/api/xpot/tags/${p2.id}`, "cu-zed");
    assert.deepEqual([colleague.limited, colleague.repName, colleague.custody.receive, colleague.custody.returnToHouse], [true, "Ana", null, null]);
    assert.equal((await ok("GET", `/api/xpot/tags/${p1.id}`, "cu-zed")).limited, true);
    assert.equal((await api("POST", `/api/xpot/tags/${p2.id}/return-to-house`, "cu-zed", {})).status, 403);
    // Pat, in another Organization, doesn't reach any of them.
    assert.equal((await api("GET", `/api/xpot/tags/lookup/${p3.publicCode}`, "cu-pat")).status, 403);
    assert.equal((await api("GET", `/api/xpot/tags/${p3.id}`, "cu-pat")).status, 403);
    assert.equal((await api("POST", `/api/xpot/tags/${p3.id}/receive`, "cu-pat", { into: "me" })).status, 403);

    // ── Ana hands p2 back to the house. ──
    const back = await ok("POST", `/api/xpot/tags/${p2.id}/return-to-house`, "cu-ana", {});
    assert.deepEqual([back.repId, back.stockStatus], [null, "available"]);
    assert.deepEqual((await movements(p2.id)).map((m) => [m.movement_type, m.reason]), [["intake", "auto:received_field"], ["return", "auto:returned_field"]]);
    // Already in house stock now.
    assert.equal((await api("POST", `/api/xpot/tags/${p2.id}/return-to-house`, "cu-admin", {})).json.code, "tag_already_house");

    // ── A set-up piece doesn't go back: Ana receives p3 and sets it up for a customer. ──
    await ok("POST", `/api/xpot/tags/${p3.id}/receive`, "cu-ana", { into: "me" });
    const live = await ok("POST", `/api/xpot/tags/${p3.id}/quick-activate`, "cu-ana", { destinationUrl: "https://cu.test/menu", destinationType: "menu", leadName: "Cu Cafe" });
    assert.deepEqual(live.custody.returnToHouse, { blocker: "set_up" });
    assert.equal((await api("POST", `/api/xpot/tags/${p3.id}/return-to-house`, "cu-ana", {})).json.code, "tag_clear_customer_first");

    // ── A closed batch receives nothing: p4 says why. ──
    await ok("POST", `/api/xpot/admin/tag-batches/${batch.id}/close`, "cu-admin", {});
    assert.deepEqual((await ok("GET", `/api/xpot/tags/${p4.id}`, "cu-ana")).custody.receive, { targets: ["me"], blocker: "batch_closed" });
    const closed = await api("POST", `/api/xpot/tags/${p4.id}/receive`, "cu-ana", { into: "me" });
    assert.deepEqual([closed.status, closed.json.code], [409, "batch_closed"]);
  } finally {
    server.close();
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM organizations WHERE slug = 'cu-partner'`);
    await pool.end();
  }
}, 60_000);
