// A sale or a settlement that bills money must say whether it was paid: nothing is recorded as paid on the server's
// own. Over HTTP, against a real Postgres, for the three places that used to default to paid: a direct sale
// (POST /sales), a consignment settlement (POST /consignments/:id/settle) and a piece sale (POST /tag-sales). The
// exception is a total of zero, which has nothing to pay. Updating a payment afterwards (PATCH /sales/:id/payment)
// is unchanged. The pure rule is in tests/sales-pricing.test.ts (chosenPaymentStatus).
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the pm-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";
const review = (n: number) => `https://search.google.com/local/writereview?placeid=ChIJpmShop${n}aaaaaaaaaaaaaaaa`;

test.skipIf(!enabled)("a sale or settlement with money in it must say whether it was paid", async () => {
  const { registerTagRoutes } = await import("../server/tags/routes.js");
  const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
  const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'pm-%')`;
  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_consignments WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_leads WHERE name LIKE 'PM %'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'pm-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'pm-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('pm-admin', 'admin@pm.test', 'Admin', true), ('pm-ana', 'ana@pm.test', 'Ana', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, modules, cost_policy, cost_policy_configured_at) VALUES
    ('pm-admin', 'PM Admin', 'admin@pm.test', 'admin', true, ARRAY['visits','tags'], 'zero', now()),
    ('pm-ana', 'PM Ana', 'ana@pm.test', 'rep', true, ARRAY['visits','tags'], 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  const lead = (await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status)
    VALUES (${company.id}, 'PM Cafe', ${repId["pm-admin"]}, 'field', 'lead') RETURNING id`)).id;

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "pm-admin", email: `${userId}@pm.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createSalesRouter());
  app.use("/api/xpot", createConsignmentsRouter());
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
  const salesCount = async () => (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_sales WHERE lead_id = ${lead}`)).n;

  try {
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active, consignable)
      VALUES ('PM-TAGS-PLATE', 'PM plate', 'physical', 2500, true, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, consignable = true, is_active = true RETURNING id`);

    // ── Direct sale. ──
    const item = { description: "Website", quantity: 1, unitPriceCents: 10000 };
    const noChoice = await api("POST", "/api/xpot/sales", "pm-admin", { leadId: lead, items: [item] });
    assert.equal(noChoice.status, 400, noChoice.text);
    assert.equal(noChoice.json.code, "payment_status_required");
    assert.match(noChoice.json.message, /paymentStatus is required/);
    // An amount received without a status is no choice either: it is not guessed from the amount.
    const onlyAmount = await api("POST", "/api/xpot/sales", "pm-admin", { leadId: lead, items: [item], paidCents: 10000 });
    assert.equal(onlyAmount.status, 400, onlyAmount.text);
    assert.equal(await salesCount(), 0, "a refused sale records nothing");
    for (const [paymentStatus, paidCents, expectedPaid] of [["paid", undefined, 10000], ["unpaid", undefined, 0], ["partial", 4000, 4000]] as const) {
      const made = await api("POST", "/api/xpot/sales", "pm-admin", { leadId: lead, items: [item], paymentStatus, paidCents });
      assert.equal(made.status, 201, made.text);
      assert.deepEqual([made.json.sale.paymentStatus, made.json.sale.paidCents], [paymentStatus, expectedPaid], paymentStatus);
    }
    // A total of zero has nothing to pay: no choice needed.
    const free = await api("POST", "/api/xpot/sales", "pm-admin", { leadId: lead, items: [{ description: "Gift", quantity: 1, unitPriceCents: 0 }] });
    assert.equal(free.status, 201, free.text);
    assert.deepEqual([free.json.sale.paymentStatus, free.json.sale.totalCents], ["paid", 0]);
    // Updating a payment later is unchanged: it may leave the status out.
    const updated = await api("PATCH", `/api/xpot/sales/${(await api("GET", "/api/xpot/sales", "pm-admin")).json.find((s: any) => s.sale.paymentStatus === "unpaid").sale.id}/payment`, "pm-admin", { paidCents: 10000 });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.sale.paymentStatus, "paid");

    // ── Consignment settlement: 4 on the shelf. ──
    const deposit = await api("POST", "/api/xpot/consignments/deposit", "pm-admin", { leadId: lead, productId: product.id, quantity: 4 });
    assert.equal(deposit.status, 201, deposit.text);
    const consignmentId = deposit.json.consignment.id;
    const before = await salesCount();
    // Two sold (counted 2 left): money in it, so the choice is required.
    const refused = await api("POST", `/api/xpot/consignments/${consignmentId}/settle`, "pm-admin", { countedRemaining: 2 });
    assert.equal(refused.status, 400, refused.text);
    assert.equal(refused.json.code, "payment_status_required");
    assert.equal(await salesCount(), before, "a refused settlement bills nothing");
    assert.equal((await one<{ q: number }>(sql`SELECT quantity_on_hand AS q FROM sales_consignments WHERE id = ${consignmentId}`)).q, 4, "and leaves the shelf as it was");
    // A count that sells nothing bills nothing, so it needs no choice.
    const nothingSold = await api("POST", `/api/xpot/consignments/${consignmentId}/settle`, "pm-admin", { countedRemaining: 4 });
    assert.equal(nothingSold.status, 200, nothingSold.text);
    assert.equal(nothingSold.json.sale ?? null, null);
    const settled = await api("POST", `/api/xpot/consignments/${consignmentId}/settle`, "pm-admin", { countedRemaining: 2, paymentStatus: "unpaid" });
    assert.equal(settled.status, 200, settled.text);
    assert.deepEqual([settled.json.sale.sale.paymentStatus, settled.json.sale.sale.paidCents, settled.json.soldQuantity], ["unpaid", 0, 2]);

    // ── Piece sale. A kit takes one piece to Ana, who sets it up and sells it. ──
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "pm-admin", { name: "PM run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    for (const code of ["PM000001", "PM000002"]) {
      assert.equal((await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "pm-admin", { value: code, idempotencyKey: `pm-${code}` })).status, 201);
    }
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits", "pm-admin", { repId: repId["pm-ana"], codes: ["PM000001", "PM000002"] })).status, 201);
    const pieceIds: string[] = [];
    const leadOf: Record<string, number> = {};
    for (const [index, code] of ["PM000001", "PM000002"].entries()) {
      const piece = await api("GET", `/api/xpot/tags/lookup/${code}`, "pm-ana");
      pieceIds.push(piece.json.id);
      const live = await api("POST", `/api/xpot/tags/${piece.json.id}/quick-activate`, "pm-ana", { destinationUrl: review(index), destinationType: "google_review", leadName: `PM Shop ${index}` });
      assert.equal(live.status, 200, live.text);
      leadOf[piece.json.id] = live.json.leadId;
    }
    const sale = (tagId: string, extra: Record<string, unknown>) => ({ leadId: leadOf[tagId], lines: [{ salesProductId: product.id, tagIds: [tagId], unitPriceCents: 2500 }], ...extra });
    const noChoicePiece = await api("POST", "/api/xpot/tag-sales", "pm-ana", sale(pieceIds[0], {}), { "idempotency-key": "pm-sale-0" });
    assert.equal(noChoicePiece.status, 400, noChoicePiece.text);
    assert.equal(noChoicePiece.json.code, "payment_status_required");
    assert.equal((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_sale_tags WHERE tag_id = ${pieceIds[0]}`)).n, 0, "the piece is not sold");
    // Priced from the catalog (no unit price sent) is the same: the total is only known on the server.
    const catalogPriced = await api("POST", "/api/xpot/tag-sales", "pm-ana", { leadId: leadOf[pieceIds[0]], lines: [{ salesProductId: product.id, tagIds: [pieceIds[0]] }] }, { "idempotency-key": "pm-sale-0b" });
    assert.equal(catalogPriced.status, 400, catalogPriced.text);
    assert.equal(catalogPriced.json.code, "payment_status_required");
    const soldUnpaid = await api("POST", "/api/xpot/tag-sales", "pm-ana", sale(pieceIds[0], { paymentStatus: "unpaid" }), { "idempotency-key": "pm-sale-1" });
    assert.equal(soldUnpaid.status, 201, soldUnpaid.text);
    assert.deepEqual([soldUnpaid.json.sale.paymentStatus, soldUnpaid.json.sale.paidCents], ["unpaid", 0]);
    const soldPaid = await api("POST", "/api/xpot/tag-sales", "pm-ana", sale(pieceIds[1], { paymentStatus: "paid" }), { "idempotency-key": "pm-sale-2" });
    assert.equal(soldPaid.status, 201, soldPaid.text);
    assert.deepEqual([soldPaid.json.sale.paymentStatus, soldPaid.json.sale.paidCents], ["paid", 2500]);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
