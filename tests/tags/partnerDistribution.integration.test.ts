// Distribution per partner (docs/PROFILES_EXECUTION_PLAN.md, F6, D3), end to end: the owner of a partner that handles
// its own distribution hands a kit from their own house stock to a person of an organization the platform linked to
// them (the pieces take that organization); everyone else stays refused; Stuscle does not verify or take orders from
// people whose partner distributes on its own; only the platform changes the mode or the links.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It TRUNCATEs the tag
// tables and replaces the pd-* users and organizations. Run it alone:
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@localhost:5432/<db>?sslmode=disable \
//     npx vitest run tests/tags/partnerDistribution.integration.test.ts --no-file-parallelism
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("partner distribution: own hands kits to linked organizations, Stuscle skips them, only the platform decides", async () => {
  process.env.XPOT_WHOLESALE_SECRET = "pd-test-".padEnd(24, "x"); // the shared secret, long enough for the guard
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { registerWholesaleRoutes, ensureWholesaleCode } = await import("../../server/wholesale/index.js");
  const { createOrganizationsRouter } = await import("../../server/routes/xpot/organizations.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;
  const all = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

  const clean = async () => {
    await db.execute(sql`TRUNCATE tag_events, tag_destination_history, tag_direct_writes, tag_acquisitions, tags, tag_kits, tag_batches CASCADE`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'pd-%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'pd-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'pd-%'`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'pd-%'`);
  };
  await clean();

  const company = await one<{ id: number }>(sql`SELECT id FROM organizations WHERE slug = 'xpot-company'`);
  const org = async (slug: string, name: string, prints = false) =>
    (await one<{ id: number }>(sql`INSERT INTO organizations (name, slug, prints_own_pieces) VALUES (${name}, ${slug}, ${prints}) RETURNING id`)).id;
  const own = await org("pd-own", "PD Brasil", true); // a partner that will handle its own distribution
  const usa = await org("pd-usa", "PD USA", true); // a partner that stays with Xpot
  const linked = await org("pd-linked", "PD Linked"); // sells for PD Brasil
  const unlinked = await org("pd-unlinked", "PD Unlinked"); // sells for nobody
  const usaSeller = await org("pd-usa-seller", "PD USA Seller"); // linked (by a leftover row) to the xpot partner

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('pd-admin', 'admin@pd.test', 'Admin', true), ('pd-own-owner', 'oo@pd.test', 'OwnOwner', false),
    ('pd-own-member', 'om@pd.test', 'OwnMember', false), ('pd-usa-owner', 'uo@pd.test', 'UsaOwner', false),
    ('pd-linked-buyer', 'lb@pd.test', 'LinkedBuyer', false), ('pd-unlinked-owner', 'ul@pd.test', 'UnlinkedOwner', false),
    ('pd-unlinked-buyer', 'ub@pd.test', 'UnlinkedBuyer', false), ('pd-usa-buyer', 'ab@pd.test', 'UsaBuyer', false),
    ('pd-company-buyer', 'cb@pd.test', 'CompanyBuyer', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES
    ('pd-admin', 'PD Admin', 'admin@pd.test', 'admin', true, 'zero', now()),
    ('pd-own-owner', 'PD Own Owner', 'oo@pd.test', 'rep', true, 'zero', now()),
    ('pd-own-member', 'PD Own Member', 'om@pd.test', 'rep', true, 'zero', now()),
    ('pd-usa-owner', 'PD Usa Owner', 'uo@pd.test', 'rep', true, 'zero', now()),
    ('pd-linked-buyer', 'PD Linked Buyer', 'lb@pd.test', 'rep', true, 'zero', now()),
    ('pd-unlinked-owner', 'PD Unlinked Owner', 'ul@pd.test', 'rep', true, 'zero', now()),
    ('pd-unlinked-buyer', 'PD Unlinked Buyer', 'ub@pd.test', 'rep', true, 'zero', now()),
    ('pd-usa-buyer', 'PD Usa Buyer', 'ab@pd.test', 'rep', true, 'zero', now()),
    ('pd-company-buyer', 'PD Company Buyer', 'cb@pd.test', 'rep', true, 'zero', now())
    RETURNING id, user_id`);
  const rep = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const member = (organizationId: number, user: string, role: "admin" | "member") =>
    db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES (${organizationId}, ${rep[user]}, ${role})`);
  await member(own, "pd-own-owner", "admin");
  await member(own, "pd-own-member", "member");
  await member(usa, "pd-usa-owner", "admin");
  await member(linked, "pd-linked-buyer", "member");
  await member(unlinked, "pd-unlinked-owner", "admin");
  await member(unlinked, "pd-unlinked-buyer", "member");
  await member(usaSeller, "pd-usa-buyer", "member");
  await member(company.id, "pd-company-buyer", "member");

  const piece = (code: string, organizationId: number) =>
    db.execute(sql`INSERT INTO tags (organization_id, public_code, product_type) VALUES (${organizationId}, ${code}, 'keychain')`);
  // PD000001-3: the partner's house stock. PD000011: the xpot partner's. PD000021: the company's. PD000031: the unlinked organization's.
  for (const code of ["PD000001", "PD000002", "PD000003"]) await piece(code, own);
  await piece("PD000011", usa);
  await piece("PD000021", company.id);
  await piece("PD000031", unlinked);
  const where = (code: string) => one<{ organization_id: number; rep_id: number | null; kit_id: string | null }>(sql`SELECT organization_id, rep_id, kit_id FROM tags WHERE public_code = ${code}`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "pd-admin", email: `${userId}@pd.test` } : {};
    next();
  });
  registerWholesaleRoutes(app);
  registerTagRoutes(app);
  app.use("/api/xpot", createOrganizationsRouter());
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string | null, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  const handOut = (user: string, buyer: string, codes: string[]) => api("POST", "/api/xpot/admin/tag-kits", user, { repId: rep[buyer], codes });

  try {
    // ── The mode is the platform's, and only for a partner that prints its own pieces. ──
    const patch = (organizationId: number, body: unknown, user = "pd-admin") => api("PATCH", `/api/xpot/organizations/${organizationId}`, user, body);
    assert.equal((await patch(own, { distribution: "own" }, "pd-own-owner")).status, 403, "a partner can't switch its own mode");
    assert.equal((await patch(unlinked, { distribution: "own" })).json.code, "distribution_needs_production", "own needs printing");
    assert.equal((await patch(company.id, { distribution: "own" })).json.code, "distribution_company");
    assert.equal((await patch(own, { distribution: "elsewhere" })).status, 400);
    const switched = await patch(own, { distribution: "own" });
    assert.equal(switched.status, 200, switched.text);
    assert.equal(switched.json.distribution, "own");
    assert.equal((await patch(own, { printsOwnPieces: false })).json.code, "distribution_needs_production", "can't stop printing while handling its own orders");
    assert.equal((await api("GET", "/api/xpot/organizations", "pd-admin")).json.find((o: any) => o.id === own).distribution, "own");

    // ── Links: platform only; only for a partner that handles its own distribution. ──
    const links = `/api/xpot/organizations/${own}/links`;
    for (const user of ["pd-own-owner", "pd-unlinked-owner", "pd-linked-buyer"]) {
      assert.equal((await api("GET", links, user)).status, 403, `${user} lists links`);
      assert.equal((await api("POST", links, user, { sellerId: linked })).status, 403, `${user} links`);
      assert.equal((await api("DELETE", `${links}/${linked}`, user)).status, 403, `${user} unlinks`);
    }
    assert.equal((await api("POST", links, null, { sellerId: linked })).status, 401);
    assert.equal((await api("POST", `/api/xpot/organizations/${usa}/links`, "pd-admin", { sellerId: usaSeller })).json.code, "link_needs_own_distribution");
    assert.equal((await api("POST", links, "pd-admin", { sellerId: own })).json.code, "link_self");
    assert.equal((await api("POST", links, "pd-admin", { sellerId: company.id })).json.code, "link_company");
    assert.equal((await api("POST", links, "pd-admin", { sellerId: 99999999 })).status, 404);
    const added = await api("POST", links, "pd-admin", { sellerId: linked });
    assert.equal(added.status, 201, added.text);
    assert.deepEqual(added.json.map((l: any) => l.name), ["PD Linked"]);
    assert.equal((await api("POST", links, "pd-admin", { sellerId: linked })).json.length, 1, "linking twice is not an error");
    assert.deepEqual((await api("GET", links, "pd-admin")).json.map((l: any) => l.sellerId), [linked]);
    // A leftover link on a partner that stays with Xpot (it can't be made through the API).
    await db.execute(sql`INSERT INTO organization_links (producer_id, seller_id) VALUES (${usa}, ${usaSeller})`);

    // ── Who a partner may hand kits to: GET /api/xpot/admin/tag-people adds the linked organizations' people, labelled. ──
    const people = (user: string) => api("GET", "/api/xpot/admin/tag-people", user);
    const recipients = async (user: string) => {
      const res = await people(user); return { status: res.status, json: Array.isArray(res.json) ? res.json.filter((p: any) => p.organizationName) : [] }; };
    const mine = await people("pd-own-owner");
    assert.equal(mine.status, 200, mine.text);
    assert.deepEqual(mine.json.map((p: any) => [p.id, p.organizationName ?? null]).sort(), [
      [rep["pd-linked-buyer"], "PD Linked"], [rep["pd-own-member"], null], [rep["pd-own-owner"], null],
    ].sort(), "their own people, then the linked organization's, labelled");
    // Someone in two linked organizations is one person to hand to, naming both (not two options with the same id).
    const linked2 = await org("pd-linked2", "PD Linked Two");
    await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES ('pd-two', 'two@pd.test', 'Two', false)`);
    const two = await one<{ id: number }>(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active, cost_policy, cost_policy_configured_at) VALUES ('pd-two', 'PD Two', 'two@pd.test', 'rep', true, 'zero', now()) RETURNING id`);
    await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES (${linked}, ${two.id}, 'member'), (${linked2}, ${two.id}, 'member')`);
    await db.execute(sql`INSERT INTO organization_links (producer_id, seller_id) VALUES (${own}, ${linked2})`);
    const twice = (await people("pd-own-owner")).json.filter((p: any) => p.id === two.id);
    assert.deepEqual(twice.map((p: any) => p.organizationName), ["PD Linked, PD Linked Two"]);
    await db.execute(sql`DELETE FROM organization_links WHERE seller_id = ${linked2}`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id = ${two.id}`);
    assert.deepEqual((await recipients("pd-usa-owner")).json, [], "a partner on xpot has none");
    assert.deepEqual((await recipients("pd-unlinked-owner")).json, []);
    assert.deepEqual((await recipients("pd-admin")).json, [], "the platform sees everyone, unlabelled");
    assert.equal((await recipients("pd-linked-buyer")).status, 403);

    // ── Handing out. The partner's owner → a person of a linked organization, from their own house stock. ──
    const given = await handOut("pd-own-owner", "pd-linked-buyer", ["PD000001", "PD000002"]);
    assert.equal(given.status, 201, given.text);
    for (const code of ["PD000001", "PD000002"]) {
      assert.deepEqual(await where(code), { organization_id: linked, rep_id: rep["pd-linked-buyer"], kit_id: given.json.id }, `${code} follows the buyer`);
    }
    assert.equal((await one<{ organization_id: number }>(sql`SELECT organization_id FROM tag_kits WHERE id = ${given.json.id}`)).organization_id, linked);
    // The source must be their own house: another organization's or the company's pieces are refused, nothing moves.
    for (const code of ["PD000011", "PD000021", "PD000031"]) {
      const refused = await handOut("pd-own-owner", "pd-linked-buyer", [code]);
      assert.equal(refused.status, 409, `${code}: ${refused.text}`);
      assert.equal(refused.json.code, "tag_not_house_stock");
    }
    assert.equal((await where("PD000021")).rep_id, null);
    // Not to a person of an organization that is not linked.
    const unlinkedTarget = await handOut("pd-own-owner", "pd-unlinked-buyer", ["PD000003"]);
    assert.equal(unlinkedTarget.status, 403, unlinkedTarget.text);
    assert.equal(unlinkedTarget.json.code, "organization_member_inactive");
    assert.deepEqual(await where("PD000003"), { organization_id: own, rep_id: null, kit_id: null });
    // Their own people are unchanged.
    assert.equal((await handOut("pd-own-owner", "pd-own-member", ["PD000003"])).status, 201);
    assert.equal((await where("PD000003")).organization_id, own);

    // A partner that stays with Xpot can't, even with a link row left over.
    const usaTry = await handOut("pd-usa-owner", "pd-usa-buyer", ["PD000011"]);
    assert.equal(usaTry.status, 403, usaTry.text);
    assert.equal((await where("PD000011")).rep_id, null);
    // A plain owner reaches only their own people (unchanged), not a partner's.
    assert.equal((await handOut("pd-unlinked-owner", "pd-linked-buyer", ["PD000031"])).status, 403);
    assert.equal((await handOut("pd-unlinked-owner", "pd-unlinked-buyer", ["PD000031"])).status, 201);
    assert.deepEqual(await where("PD000031"), { organization_id: unlinked, rep_id: rep["pd-unlinked-buyer"], kit_id: (await where("PD000031")).kit_id });
    // The platform hands out the company's stock to anyone; a partner's piece is not the company's.
    assert.equal((await handOut("pd-admin", "pd-linked-buyer", ["PD000021"])).status, 201);
    assert.equal((await where("PD000021")).organization_id, linked);
    const platformOnPartnerStock = await handOut("pd-admin", "pd-linked-buyer", ["PD000011"]);
    assert.equal(platformOnPartnerStock.status, 409, platformOnPartnerStock.text);

    // ── Stuscle: the code of someone whose partner distributes on its own is not valid for this store. ──
    const stuscle = { authorization: `Bearer ${process.env.XPOT_WHOLESALE_SECRET}` };
    const code = async (user: string) => ensureWholesaleCode(rep[user]);
    const verify = async (user: string) => (await api("POST", "/api/integrations/stuscle/wholesale/verify", null, { code: await code(user) }, stuscle)).json;
    assert.deepEqual(await verify("pd-linked-buyer"), { valid: false, reason: "own_distribution" }, "linked to an own partner");
    assert.deepEqual(await verify("pd-own-member"), { valid: false, reason: "own_distribution" }, "belongs to an own partner");
    for (const user of ["pd-unlinked-buyer", "pd-usa-buyer", "pd-company-buyer"]) {
      const verdict = await verify(user);
      assert.equal(verdict.valid, true, `${user} is unchanged`);
      assert.equal(verdict.reseller.id, rep[user]);
    }
    const order = {
      externalOrderId: "PD-ORDER-1",
      wholesaleCode: await code("pd-linked-buyer"),
      purchasedAt: new Date().toISOString(),
      items: [{ sku: "PD-SKU", quantity: 1, subtotalCents: 1000 }],
    };
    const refusedOrder = await api("POST", "/api/integrations/stuscle/wholesale/orders", null, order, stuscle);
    assert.equal(refusedOrder.status, 403, refusedOrder.text);
    assert.equal(refusedOrder.json.code, "wholesale_own_distribution");
    assert.equal((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM tag_acquisitions`)).n, 0, "no order was taken");
    // The Tags home: no store link, a line naming the partner. Everyone else keeps the code and the link.
    const linkedCard = await api("GET", "/api/xpot/wholesale", "pd-linked-buyer");
    assert.deepEqual(linkedCard.json, { code: null, url: null, partner: "PD Brasil" });
    assert.deepEqual((await api("GET", "/api/xpot/wholesale", "pd-own-member")).json, { code: null, url: null, partner: "PD Brasil" });
    const normalCard = await api("GET", "/api/xpot/wholesale", "pd-unlinked-buyer");
    assert.match(normalCard.json.code, /^XP-/);
    assert.match(normalCard.json.url, /^https?:\/\//);
    assert.equal((await api("GET", "/api/xpot/wholesale", "pd-usa-buyer")).json.partner, undefined);

    // ── Unlinking: Stuscle takes them again, and nothing more is handed to them. Pieces already given stay. ──
    const unlink = await api("DELETE", `${links}/${linked}`, "pd-admin");
    assert.equal(unlink.status, 200, unlink.text);
    assert.deepEqual(unlink.json, []);
    assert.equal((await api("DELETE", `${links}/${linked}`, "pd-admin")).json.code, "link_not_found");
    assert.equal((await verify("pd-linked-buyer")).valid, true);
    assert.equal((await handOut("pd-own-owner", "pd-linked-buyer", ["PD000003"])).status, 403);
    assert.equal((await where("PD000001")).organization_id, linked);
    assert.deepEqual((await recipients("pd-own-owner")).json, []);

    // Back to Xpot: the partner's people verify again.
    assert.equal((await patch(own, { distribution: "xpot" })).json.distribution, "xpot");
    assert.equal((await verify("pd-own-member")).valid, true);
    assert.deepEqual(await all(sql`SELECT action FROM organization_audit_log WHERE organization_id = ${own} AND action LIKE 'organization_%link%' ORDER BY id`), [{ action: "organization_linked" }, { action: "organization_unlinked" }]);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
