// What holding a Tags piece at another rep's company lets a rep do, against a
// real Postgres: open it and edit its details, yes; owner-level actions (funnel
// status, promote, CRM sync, removing photos, taking it over, deleting it), no.
// Sales and consigned stock recorded there are refused when the company sits in
// an Organization the rep is not part of (they would never see them again);
// inside one of their Organizations they work and stay visible. Check-in works
// (a visit is listed by its rep).
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database. It TRUNCATEs the tag tables and replaces the pa-* users.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("piece-only access to a company: read and edit, not own", async () => {
  const { registerTagRoutes } = await import("../server/tags/routes.js");
  const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
  const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
  const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
  const { createVisitsRouter } = await import("../server/routes/xpot/visits.js");
  const { requireVisitsModule, VISITS_ONLY_PATHS } = await import("../server/routes/xpot/middleware.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const testReps = sql`(SELECT id FROM sales_reps WHERE user_id LIKE 'pa-%')`;
  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM sales_consignments WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_sales WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_visits WHERE rep_id IN ${testReps}`);
    await db.execute(sql`DELETE FROM sales_lead_contacts WHERE lead_id IN (SELECT id FROM sales_leads WHERE name LIKE 'PA %')`);
    await db.execute(sql`DELETE FROM sales_leads WHERE name LIKE 'PA %'`);
    await db.execute(sql`DELETE FROM organizations WHERE slug = 'pa-team'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'pa-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'pa-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('pa-admin', 'admin@pa.test', 'Admin', true), ('pa-vera', 'vera@pa.test', 'Vera', false), ('pa-owen', 'owen@pa.test', 'Owen', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, modules, cost_policy, cost_policy_configured_at) VALUES
    ('pa-admin', 'PA Admin', 'admin@pa.test', 'admin', true, ARRAY['visits','tags'], 'zero', now()),
    ('pa-vera', 'PA Vera', 'vera@pa.test', 'rep', true, ARRAY['visits','tags'], 'zero', now()),
    ('pa-owen', 'PA Owen', 'owen@pa.test', 'rep', true, ARRAY['visits','tags'], 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  // Vera and Owen work in the same team, as plain members. The house's own Organization is not Vera's.
  const team = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('PA Team', 'pa-team') RETURNING id`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${team.id}, ${repId["pa-vera"]}, 'member'), (${team.id}, ${repId["pa-owen"]}, 'member')`);
  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  // Owen's company in the team, and the admin's in the house's Organization.
  const inside = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status, photos)
    VALUES (${team.id}, 'PA Inside', ${repId["pa-owen"]}, 'field', 'prospect', '["r2:photos/pa/inside.jpg"]'::jsonb) RETURNING id`);
  const outside = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status)
    VALUES (${company.id}, 'PA Outside', ${repId["pa-admin"]}, 'field', 'lead') RETURNING id`);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "pa-admin", email: `${userId}@pa.test` } : {};
    next();
  });
  registerTagRoutes(app);
  app.use(VISITS_ONLY_PATHS.map((path) => `/api/xpot${path}`), requireVisitsModule);
  app.use("/api/xpot", createLeadsRouter());
  app.use("/api/xpot", createSalesRouter());
  app.use("/api/xpot", createConsignmentsRouter());
  app.use("/api/xpot", createVisitsRouter());
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
  const refusedAsNotOwner = (res: { status: number; json: any; text: string }) => {
    assert.equal(res.status, 403, res.text);
    assert.equal(res.json.code, "lead_owner_only");
  };

  try {
    // Two of Vera's pieces, linked by the admin to the two companies.
    const product = await one<{ id: number }>(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active, consignable)
      VALUES ('PA-TAGS-PLATE', 'PA plate', 'physical', 2500, true, true)
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, consignable = true, is_active = true RETURNING id`);
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "pa-admin", { name: "PA run", productType: "keychain", salesProductId: product.id });
    assert.equal(batch.status, 201, batch.text);
    const codes = ["PA000001", "PA000002"];
    for (const code of codes) {
      assert.equal((await api("POST", `/api/xpot/admin/tag-batches/${batch.json.id}/scan`, "pa-admin", { value: code, idempotencyKey: `pa-${code}` })).status, 201);
    }
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits", "pa-admin", { repId: repId["pa-vera"], codes })).status, 201);
    for (const [code, leadId] of [[codes[0], inside.id], [codes[1], outside.id]] as const) {
      const piece = await api("GET", `/api/xpot/tags/lookup/${code}`, "pa-vera");
      const linked = await api("POST", `/api/xpot/tags/${piece.json.id}/quick-activate`, "pa-admin", {
        destinationUrl: "https://example.test/menu", destinationType: "menu", leadId,
      });
      assert.equal(linked.status, 200, linked.text);
    }

    // Read and edit the details: yes.
    assert.equal((await api("GET", `/api/xpot/leads/${inside.id}`, "pa-vera")).status, 200);
    assert.equal((await api("PATCH", `/api/xpot/leads/${inside.id}`, "pa-vera", { phone: "+15550001111" })).status, 200);
    assert.equal((await api("POST", `/api/xpot/leads/${inside.id}/contacts`, "pa-vera", { name: "PA Contact" })).status, 201);
    // Sending the status it already has is not a change.
    assert.equal((await api("PATCH", `/api/xpot/leads/${inside.id}`, "pa-vera", { name: "PA Inside", status: "prospect" })).status, 200);

    // Owner-level: no.
    refusedAsNotOwner(await api("PATCH", `/api/xpot/leads/${inside.id}`, "pa-vera", { status: "customer" }));
    refusedAsNotOwner(await api("PATCH", `/api/xpot/leads/${inside.id}`, "pa-vera", { ownerRepId: repId["pa-vera"] }));
    refusedAsNotOwner(await api("POST", `/api/xpot/leads/${inside.id}/promote`, "pa-vera"));
    refusedAsNotOwner(await api("POST", `/api/xpot/leads/${inside.id}/sync-ghl`, "pa-vera"));
    refusedAsNotOwner(await api("DELETE", `/api/xpot/leads/${inside.id}/photos`, "pa-vera", { photo: "r2:photos/pa/inside.jpg" }));
    refusedAsNotOwner(await api("DELETE", `/api/xpot/leads/${inside.id}`, "pa-vera"));
    const after = await one<{ status: string; owner_rep_id: number; photos: string[] }>(sql`SELECT status, owner_rep_id, photos FROM sales_leads WHERE id = ${inside.id}`);
    assert.deepEqual(after, { status: "prospect", owner_rep_id: repId["pa-owen"], photos: ["r2:photos/pa/inside.jpg"] });

    // The owner still can.
    assert.equal((await api("POST", `/api/xpot/leads/${inside.id}/promote`, "pa-owen")).status, 200);
    assert.equal((await api("PATCH", `/api/xpot/leads/${inside.id}`, "pa-owen", { status: "customer" })).status, 200);

    // A sale or consigned stock at a company outside her Organizations: refused, with a reason.
    const saleOutside = await api("POST", "/api/xpot/sales", "pa-vera", { leadId: outside.id, items: [{ description: "Website", quantity: 1, unitPriceCents: 10000 }] });
    assert.equal(saleOutside.status, 403, saleOutside.text);
    assert.equal(saleOutside.json.code, "lead_other_organization");
    const stockOutside = await api("POST", "/api/xpot/consignments/deposit", "pa-vera", { leadId: outside.id, productId: product.id, quantity: 2 });
    assert.equal(stockOutside.status, 403, stockOutside.text);
    assert.equal(stockOutside.json.code, "lead_other_organization");

    // Inside her team: recorded, and she sees it afterwards.
    const saleInside = await api("POST", "/api/xpot/sales", "pa-vera", { leadId: inside.id, items: [{ description: "Website", quantity: 1, unitPriceCents: 10000 }] });
    assert.equal(saleInside.status, 201, saleInside.text);
    const saleId = saleInside.json.sale?.id ?? saleInside.json.id;
    assert.equal((await api("GET", `/api/xpot/sales/${saleId}`, "pa-vera")).status, 200);
    const mySales = await api("GET", "/api/xpot/sales", "pa-vera");
    assert.ok(JSON.stringify(mySales.json).includes(`"id":${saleId}`), mySales.text);
    const stockInside = await api("POST", "/api/xpot/consignments/deposit", "pa-vera", { leadId: inside.id, productId: product.id, quantity: 2 });
    assert.equal(stockInside.status, 201, stockInside.text);
    assert.equal((await api("GET", `/api/xpot/consignments/${stockInside.json.consignment.id}`, "pa-vera")).status, 200);

    // Check-in at the outside company works and the visit is hers to see.
    const checkIn = await api("POST", "/api/xpot/visits/check-in", "pa-vera", { leadId: outside.id, manualOverrideReason: "No GPS indoors" });
    assert.equal(checkIn.status, 201, checkIn.text);
    const visits = await api("GET", "/api/xpot/visits", "pa-vera");
    assert.ok((visits.json as Array<{ id: number }>).some((v) => v.id === checkIn.json.visit.id), visits.text);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
