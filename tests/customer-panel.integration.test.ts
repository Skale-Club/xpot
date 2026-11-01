// The customer panel (/my, /api/my/*) against a real Postgres, with SMS captured in memory: the flag, the sign-in by
// piece code + phone (no enumeration, no brute force, a fresh session id), two businesses never crossing, the
// customer session refused by every Xpot API, and the sellers' contacts routes.
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("customer panel: flag, sign-in, isolation, seller contacts", async () => {
  const { registerCustomerRoutes } = await import("../server/customer/routes.js");
  const { registerTagRoutes } = await import("../server/tags/routes.js");
  const { registerXpotRoutes } = await import("../server/routes/xpot/index.js");
  const { db } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const PHONE_A = "+15550130001"; // Business A's own phone
  const PHONE_B = "+15550130003"; // Business B's own phone
  const STRANGER = "+15550130009";
  const REP_A_PHONE = "+15550140001";
  const clean = async () => {
    await db.execute(sql`DELETE FROM tag_events WHERE tag_id IN (SELECT id FROM tags WHERE public_code LIKE 'CX00%')`);
    await db.execute(sql`DELETE FROM tags WHERE public_code LIKE 'CX00%'`);
    await db.execute(sql`DELETE FROM sales_leads WHERE name LIKE 'CU %'`);
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'cu-%')`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'cu-%'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'cu-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'cu-%'`);
    await db.execute(sql`DELETE FROM auth_phone_codes WHERE phone LIKE '+1555013%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, phone, is_admin) VALUES
    ('cu-admin', 'admin@cu.test', 'Admin', null, true), ('cu-a', 'a@cu.test', 'Rep A', ${REP_A_PHONE}, false),
    ('cu-b', 'b@cu.test', 'Rep B', '+15550140002', false), ('cu-m', 'm@cu.test', 'Member', null, false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, phone, role, is_active, modules, cost_policy, cost_policy_configured_at) VALUES
    ('cu-admin', 'CU Admin', 'admin@cu.test', null, 'admin', true, ARRAY['visits','tags'], 'zero', now()),
    ('cu-a', 'CU Rep A', 'a@cu.test', ${REP_A_PHONE}, 'rep', true, ARRAY['visits','tags'], 'zero', now()),
    ('cu-b', 'CU Rep B', 'b@cu.test', null, 'rep', true, ARRAY['visits','tags'], 'zero', now()),
    ('cu-m', 'CU Member', 'm@cu.test', null, 'rep', true, ARRAY['visits','tags'], 'zero', now())
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const orgX = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('CU Org X', 'cu-x') RETURNING id`);
  const orgY = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('CU Org Y', 'cu-y') RETURNING id`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${orgX.id}, ${repId["cu-a"]}, 'member'), (${orgX.id}, ${repId["cu-m"]}, 'member'), (${orgY.id}, ${repId["cu-b"]}, 'member')`);
  const leadA = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status, phone)
    VALUES (${orgX.id}, 'CU Business A', ${repId["cu-a"]}, 'field', 'customer', '(555) 013-0001') RETURNING id`);
  const leadB = await one<{ id: number }>(sql`INSERT INTO sales_leads (organization_id, name, owner_rep_id, source, status, phone)
    VALUES (${orgY.id}, 'CU Business B', ${repId["cu-b"]}, 'field', 'customer', ${PHONE_B}) RETURNING id`);

  const tag = async (code: string, orgId: number, leadId: number | null, repIdOf: number | null, status: string, extra: { label?: string; url?: string } = {}) =>
    (await one<{ id: string }>(sql`INSERT INTO tags (organization_id, public_code, product_type, status, lead_id, rep_id, destination_url, destination_type, label, face)
      VALUES (${orgId}, ${code}, 'large_plate', ${status}, ${leadId}, ${repIdOf}, ${extra.url ?? null}, ${extra.url ? "website" : null}, ${extra.label ?? null}, 'google_review') RETURNING id`)).id;
  const a1 = await tag("CX00A001", orgX.id, leadA.id, repId["cu-a"], "active", { label: "Counter", url: "https://example.test/a1" });
  await tag("CX00A002", orgX.id, leadA.id, repId["cu-a"], "disabled", { url: "https://example.test/a2" });
  await tag("CX00A003", orgX.id, leadA.id, repId["cu-a"], "retired");
  await tag("CX00A004", orgX.id, leadA.id, repId["cu-a"], "assigned");
  const b1 = await tag("CX00B001", orgY.id, leadB.id, repId["cu-b"], "active", { url: "https://example.test/b1" });
  await tag("CX00F001", orgX.id, null, repId["cu-a"], "inventory");
  const event = (tagId: string, leadId: number | null, method: string, hoursAgo: number, opts: { bot?: boolean; type?: string } = {}) =>
    db.execute(sql`INSERT INTO tag_events (tag_id, lead_id, access_method, event_type, occurred_at, is_bot)
      VALUES (${tagId}, ${leadId}, ${method}, ${opts.type ?? "redirect"}, now() - make_interval(hours => ${hoursAgo}), ${opts.bot ?? false})`);
  // Piece A1: 3 QR this week, 2 NFC 10 days ago; none of these count: a bot, a disabled-scan, 40 days ago, before it
  // was sold (no lead), and while it was another business's.
  for (const h of [2, 30, 70]) await event(a1, leadA.id, "qr", h);
  for (const h of [240, 250]) await event(a1, leadA.id, "nfc", h);
  await event(a1, leadA.id, "qr", 3, { bot: true });
  await event(a1, leadA.id, "qr", 4, { type: "disabled_scan" });
  await event(a1, leadA.id, "qr", 960);
  await event(a1, null, "qr", 5);
  await event(a1, leadB.id, "qr", 6);
  await event(b1, leadB.id, "qr", 1);

  const sent: Array<{ to: string; body: string }> = [];
  const sms = { live: true, async send(to: string, body: string) { sent.push({ to, body }); } };
  const otpFor = (phone: string) => {
    const last = [...sent].reverse().find((m) => m.to === phone);
    assert.ok(last, `no SMS to ${phone}`);
    return /(\d{6})/.exec(last.body)![1];
  };
  // Lets a test ask for a new code without waiting 30 seconds.
  const age = (phone: string) => db.execute(sql`UPDATE auth_phone_codes SET created_at = created_at - interval '1 minute' WHERE phone = ${phone}`);

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  const customer = registerCustomerRoutes(app, sms);
  // A stand-in for the team's sign-in: a session with a userId.
  app.post("/test/team-login/:userId", (req, res) => {
    (req.session as any).userId = req.params.userId;
    (req.session as any).isAdmin = req.params.userId === "cu-admin";
    (req.session as any).email = `${req.params.userId}@cu.test`;
    res.json({ ok: true });
  });
  app.get("/test/session", (req, res) => res.json({ userId: (req.session as any).userId ?? null, customerPhone: (req.session as any).customerPhone ?? null }));
  registerTagRoutes(app);
  registerXpotRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let ipCounter = 0;
  /** One browser: its own cookie, and a new network address per call unless told otherwise. */
  const browser = () => {
    let cookie = "";
    const call = async (method: string, path: string, body?: unknown, ip?: string) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-forwarded-for": ip ?? `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: res.status, json, text, setCookie: Boolean(setCookie), cacheControl: res.headers.get("cache-control") };
    };
    return { call, get cookie() { return cookie; }, set cookie(value: string) { cookie = value; } };
  };
  const team = async (userId: string) => {
    const b = browser();
    assert.equal((await b.call("POST", `/test/team-login/${userId}`)).status, 200);
    return b;
  };
  /** Asks for a code with the piece and phone, reads the SMS and verifies it. */
  const signIn = async (b: ReturnType<typeof browser>, code: string, phone: string) => {
    await age(phone);
    const asked = await b.call("POST", "/api/my/code", { code, phone });
    assert.equal(asked.status, 200, asked.text);
    await customer.idle();
    return b.call("POST", "/api/my/verify", { phone, otp: otpFor(phone) });
  };

  const prev = process.env.CUSTOMER_PANEL_ENABLED;
  try {
    // ── The flag: off, every route is 404, except the question itself ───────────────────────────────
    process.env.CUSTOMER_PANEL_ENABLED = "false";
    const anon = browser();
    assert.deepEqual((await anon.call("GET", "/api/my/enabled")).json, { enabled: false });
    for (const [method, path, body] of [
      ["POST", "/api/my/code", { code: "CX00A001", phone: PHONE_A }],
      ["POST", "/api/my/verify", { phone: PHONE_A, otp: "123456" }],
      ["GET", "/api/my/pieces"],
      ["GET", "/api/my/pieces/CX00A001"],
      ["GET", "/api/my/contact"],
      ["POST", "/api/my/sign-out"],
    ] as const) {
      const res = await anon.call(method, path, body);
      assert.equal(res.status, 404, `${method} ${path} -> ${res.status}`);
    }
    const repA = await team("cu-a");
    assert.equal((await repA.call("GET", `/api/xpot/leads/${leadA.id}/customer-contacts`)).status, 404);
    assert.equal((await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: STRANGER })).status, 404);
    assert.equal(sent.length, 0);

    // ── On ────────────────────────────────────────────────────────────────────────────────────────
    delete process.env.CUSTOMER_PANEL_ENABLED;
    const enabledAnswer = await anon.call("GET", "/api/my/enabled");
    assert.deepEqual(enabledAnswer.json, { enabled: true });
    assert.equal(enabledAnswer.cacheControl, "no-store");

    // No enumeration: a real piece with its business's phone, a made-up piece, a real piece with a stranger's phone, a
    // piece that is not live, one in stock and one with a bad shape all get the same answer; only the first sends.
    const asks: Array<[string, string]> = [
      ["CX00A001", PHONE_A],
      ["CX00ZZZ9", "+15550131001"],
      ["CX00A001", STRANGER],
      ["CX00A002", PHONE_A],
      ["CX00F001", "+15550131002"],
      ["not a code", "+15550131003"],
      ["CX00B001", "+15550131004"],
    ];
    const answers = [];
    for (const [code, phone] of asks) {
      const b = browser();
      const res = await b.call("POST", "/api/my/code", { code, phone });
      answers.push({ code, phone, res });
    }
    await customer.idle();
    for (const { code, phone, res } of answers) {
      assert.equal(res.status, 200, `${code}/${phone}: ${res.text}`);
      assert.deepEqual(res.json, { ok: true, phone }, `${code}/${phone}`);
      assert.equal(res.setCookie, true, `${code}/${phone} sets a session in every case`);
    }
    assert.deepEqual(sent.map((m) => m.to), [PHONE_A], "only the real piece with its business's phone is texted");
    assert.match(sent[0].body, /\d{6}/);
    // Bad input is refused the same way for everyone.
    assert.equal((await browser().call("POST", "/api/my/code", { code: "CX00A001", phone: "hello" })).json.code, "invalid_phone");
    assert.equal((await browser().call("POST", "/api/my/code", { code: "CX00A001", phone: PHONE_A, extra: 1 })).json.code, "invalid_input");

    // ── Sign in: wrong code, right code, fresh session id ───────────────────────────────────────────
    const a = browser();
    await age(PHONE_A);
    assert.equal((await a.call("POST", "/api/my/code", { code: "cx00-a001", phone: "(555) 013-0001" })).status, 200);
    await customer.idle();
    const beforeVerify = a.cookie;
    assert.ok(beforeVerify, "the asking browser already has a session cookie");
    const code = otpFor(PHONE_A);
    const wrong = await a.call("POST", "/api/my/verify", { phone: PHONE_A, otp: code === "000000" ? "111111" : "000000" });
    assert.deepEqual([wrong.status, wrong.json.code], [400, "wrong_code"]);
    // Nothing is open yet.
    assert.equal((await a.call("GET", "/api/my/pieces")).status, 401);
    const ok = await a.call("POST", "/api/my/verify", { phone: PHONE_A, otp: code });
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(ok.json, { ok: true });
    assert.notEqual(a.cookie, beforeVerify, "the session id changes when the customer signs in");
    // The id from before sign-in opens nothing (session fixation).
    const fixated = browser();
    fixated.cookie = beforeVerify;
    assert.equal((await fixated.call("GET", "/api/my/pieces")).status, 401);
    // A spent code does not work twice.
    assert.equal((await browser().call("POST", "/api/my/verify", { phone: PHONE_A, otp: code })).json.code, "code_expired");
    // No user, rep or access request came out of any of this.
    const made = await one<{ users: number; reps: number; requests: number }>(sql`SELECT
      (SELECT count(*)::int FROM users WHERE phone IN (${PHONE_A}, ${PHONE_B}, ${STRANGER})) AS users,
      (SELECT count(*)::int FROM sales_reps WHERE phone IN (${PHONE_A}, ${PHONE_B}, ${STRANGER})) AS reps,
      (SELECT count(*)::int FROM auth_access_requests) AS requests`);
    assert.deepEqual(made, { users: 0, reps: 0, requests: 0 });
    // The business's phone is now on its list, verified.
    const filed = await one<{ verified_at: Date | null; created_by_user_id: string | null }>(sql`SELECT verified_at, created_by_user_id FROM lead_customer_contacts WHERE lead_id = ${leadA.id} AND phone = ${PHONE_A}`);
    assert.ok(filed.verified_at);
    assert.equal(filed.created_by_user_id, null);

    // ── Business A sees A, and only the right numbers ───────────────────────────────────────────────
    const pieces = await a.call("GET", "/api/my/pieces");
    assert.equal(pieces.status, 200, pieces.text);
    assert.equal(pieces.cacheControl, "no-store");
    const codes = pieces.json.pieces.map((p: { code: string }) => p.code).sort();
    assert.deepEqual(codes, ["CX00A001", "CX00A002", "CX00A004"], "retired, in-stock and other businesses' pieces stay out");
    const first = pieces.json.pieces.find((p: { code: string }) => p.code === "CX00A001");
    assert.deepEqual(first, {
      code: "CX00A001", label: "Counter", face: "google_review", productType: "large_plate", status: "active",
      destinationUrl: "https://example.test/a1", businessName: "CU Business A", scans7: 3, scans30: 5, lastScanAt: first.lastScanAt,
    });
    assert.ok(first.lastScanAt);
    assert.deepEqual(pieces.json.totals, { pieces: 3, live: 1, scans7: 3, scans30: 5 });
    // Nothing else about the piece, the seller or the organization leaks.
    assert.doesNotMatch(pieces.text, /cost|repId|rep_id|organization|stock|"id"|CX00B001/i);

    const detail = await a.call("GET", "/api/my/pieces/CX00A001");
    assert.equal(detail.status, 200, detail.text);
    assert.deepEqual([detail.json.scans7, detail.json.scans30, detail.json.qr30, detail.json.nfc30], [3, 5, 3, 2]);
    assert.equal(detail.json.daily.reduce((n: number, d: { qr: number }) => n + d.qr, 0), 3);
    assert.equal(detail.json.daily.reduce((n: number, d: { nfc: number }) => n + d.nfc, 0), 2);
    assert.ok(detail.json.daily.length >= 30 && detail.json.daily.length <= 32);
    assert.doesNotMatch(detail.text, /cost|repId|rep_id|organization|stock|"id"/i);
    // Lower-case, spaced codes work; another business's piece, a missing one and junk all look the same.
    assert.equal((await a.call("GET", "/api/my/pieces/cx00-a001")).status, 200);
    const foreign = await a.call("GET", "/api/my/pieces/CX00B001");
    const missing = await a.call("GET", "/api/my/pieces/CX00ZZZ9");
    const junk = await a.call("GET", "/api/my/pieces/%24%24");
    const inStock = await a.call("GET", "/api/my/pieces/CX00F001");
    for (const res of [foreign, missing, junk, inStock]) assert.deepEqual([res.status, res.json], [404, { message: "Not found" }]);

    const contact = await a.call("GET", "/api/my/contact");
    assert.equal(contact.status, 200, contact.text);
    assert.deepEqual(contact.json.sellers, [{ businessName: "CU Business A", name: "CU Rep A", phone: REP_A_PHONE }]);
    assert.doesNotMatch(contact.text, /repId|rep_id|"id"|email/);

    // ── Business B is a world of its own ─────────────────────────────────────────────────────────────
    const b = browser();
    assert.equal((await signIn(b, "CX00B001", PHONE_B)).status, 200);
    const bPieces = await b.call("GET", "/api/my/pieces");
    assert.deepEqual(bPieces.json.pieces.map((p: { code: string }) => p.code), ["CX00B001"]);
    assert.deepEqual([bPieces.json.pieces[0].scans7, bPieces.json.pieces[0].scans30], [1, 1]);
    assert.equal((await b.call("GET", "/api/my/pieces/CX00A001")).status, 404);
    // Rep B has no phone on the rep profile: the one on the login stands in.
    assert.deepEqual((await b.call("GET", "/api/my/contact")).json.sellers, [{ businessName: "CU Business B", name: "CU Rep B", phone: "+15550140002" }]);
    // B's phone, A's piece code: nothing is sent (it is not B's piece).
    const before = sent.length;
    assert.equal((await browser().call("POST", "/api/my/code", { code: "CX00A001", phone: PHONE_B })).status, 200);
    await customer.idle();
    assert.equal(sent.length, before);

    // ── A customer session is nothing to the team's API, and a team session is nothing to /my ───────────
    for (const [method, path] of [
      ["GET", "/api/xpot/me"],
      ["GET", "/api/xpot/leads"],
      ["GET", `/api/xpot/leads/${leadA.id}`],
      ["GET", "/api/xpot/tags?mine=1"],
      ["GET", "/api/xpot/tags/dashboard"],
      ["GET", "/api/xpot/admin/tag-batches"],
      ["GET", "/api/xpot/admin/reps"],
      ["GET", `/api/xpot/leads/${leadA.id}/customer-contacts`],
      ["POST", `/api/xpot/leads/${leadA.id}/customer-contacts`],
    ] as const) {
      const res = await a.call(method, path, method === "POST" ? { phone: STRANGER } : undefined);
      assert.equal(res.status, 401, `${method} ${path} -> ${res.status} ${res.text}`);
    }
    const repSession = await team("cu-a");
    assert.equal((await repSession.call("GET", "/api/my/pieces")).status, 401, "a rep is not a customer");
    const adminSession = await team("cu-admin");
    assert.equal((await adminSession.call("GET", "/api/my/pieces")).status, 401, "an admin is not a customer either");

    // A team session in the same browser survives the customer signing in and out, and stays separate.
    assert.equal((await signIn(repSession, "CX00A001", PHONE_A)).status, 200);
    assert.deepEqual((await repSession.call("GET", "/test/session")).json, { userId: "cu-a", customerPhone: PHONE_A });
    assert.equal((await repSession.call("GET", "/api/my/pieces")).status, 200);
    assert.equal((await repSession.call("POST", "/api/my/sign-out")).status, 200);
    assert.equal((await repSession.call("GET", "/api/my/pieces")).status, 401);
    assert.deepEqual((await repSession.call("GET", "/test/session")).json, { userId: "cu-a", customerPhone: null });
    assert.equal((await repSession.call("GET", "/api/xpot/me")).status, 200);

    // ── Sign-out ─────────────────────────────────────────────────────────────────────────────────────
    assert.equal((await a.call("POST", "/api/my/sign-out")).status, 200);
    assert.equal((await a.call("GET", "/api/my/pieces")).status, 401);
    assert.equal((await a.call("POST", "/api/my/sign-out")).status, 200, "signing out twice is fine");

    // ── Brute force: a number nobody texted, the wrong codes, the limits ────────────────────────────────
    assert.equal((await browser().call("POST", "/api/my/verify", { phone: STRANGER, otp: "123456" })).json.code, "code_expired");
    const guess = browser();
    await age(PHONE_B);
    assert.equal((await guess.call("POST", "/api/my/code", { code: "CX00B001", phone: PHONE_B })).status, 200);
    await customer.idle();
    const real = otpFor(PHONE_B);
    const wrongOtp = real === "123456" ? "654321" : "123456";
    const tries = [];
    for (let i = 0; i < 5; i++) tries.push((await guess.call("POST", "/api/my/verify", { phone: PHONE_B, otp: wrongOtp })).json.code);
    assert.deepEqual(tries, ["wrong_code", "wrong_code", "wrong_code", "wrong_code", "wrong_code"]);
    // Five wrong tries burn the code, the right one included.
    assert.equal((await guess.call("POST", "/api/my/verify", { phone: PHONE_B, otp: real })).json.code, "too_many_attempts");

    // The route limit by network address and by phone.
    const fixedIp = "203.0.113.7";
    const ipResults = [];
    for (let i = 0; i < 13; i++) ipResults.push((await browser().call("POST", "/api/my/code", { code: "CX00ZZZ9", phone: `+1555013${String(1000 + i)}` }, fixedIp)).status);
    assert.deepEqual(ipResults, [...Array(12).fill(200), 429]);
    const phoneResults = [];
    for (let i = 0; i < 7; i++) phoneResults.push((await browser().call("POST", "/api/my/code", { code: "CX00ZZZ9", phone: "+15550139999" })).status);
    assert.deepEqual(phoneResults, [...Array(6).fill(200), 429]);

    // ── The seller side ─────────────────────────────────────────────────────────────────────────────
    const EXTRA = "+15550130002";
    const list0 = await repA.call("GET", `/api/xpot/leads/${leadA.id}/customer-contacts`);
    assert.equal(list0.status, 200, list0.text);
    assert.equal(list0.json.businessPhone, PHONE_A);
    assert.deepEqual(list0.json.contacts.map((c: { phone: string }) => c.phone), [PHONE_A]);
    const added = await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: "(555) 013-0002" });
    assert.equal(added.status, 201, added.text);
    assert.deepEqual(added.json.contacts.map((c: { phone: string }) => c.phone).sort(), [PHONE_A, EXTRA]);
    assert.equal((await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: EXTRA })).status, 201, "adding twice is fine");
    assert.equal((await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: "nope" })).json.code, "invalid_phone");
    const row = await one<{ created_by_user_id: string }>(sql`SELECT created_by_user_id FROM lead_customer_contacts WHERE lead_id = ${leadA.id} AND phone = ${EXTRA}`);
    assert.equal(row.created_by_user_id, "cu-a");

    // The seller-added phone signs in with a piece of that business; it sees A, not B.
    const extra = browser();
    assert.equal((await signIn(extra, "CX00A001", EXTRA)).status, 200);
    assert.equal((await extra.call("GET", "/api/my/pieces")).json.pieces.length, 3);
    // Removing it takes effect on its very next request, session or not.
    const removed = await repA.call("DELETE", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: EXTRA });
    assert.equal(removed.status, 200, removed.text);
    assert.deepEqual(removed.json.contacts.map((c: { phone: string }) => c.phone), [PHONE_A]);
    assert.equal((await extra.call("GET", "/api/my/pieces")).status, 401);
    // And it cannot ask for a new code.
    const sentBefore = sent.length;
    await age(EXTRA);
    assert.equal((await browser().call("POST", "/api/my/code", { code: "CX00A001", phone: EXTRA })).status, 200);
    await customer.idle();
    assert.equal(sent.length, sentBefore);
    // The business's own phone opens the panel by itself: it cannot be removed from the list.
    const refusedOwn = await repA.call("DELETE", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: PHONE_A });
    assert.deepEqual([refusedOwn.status, refusedOwn.json.code], [409, "business_phone"]);

    // Who may change a business's phones: whoever can use the lead, nobody else.
    const repB = await team("cu-b");
    const member = await team("cu-m");
    const admin = await team("cu-admin");
    for (const [who, label] of [[repB, "a rep of another organization"], [member, "a plain member of its organization"]] as const) {
      for (const [method, body] of [["GET", undefined], ["POST", { phone: STRANGER }], ["DELETE", { phone: PHONE_A }]] as const) {
        const res = await who.call(method, `/api/xpot/leads/${leadA.id}/customer-contacts`, body);
        assert.equal(res.status, 404, `${label}: ${method} -> ${res.status} ${res.text}`);
        assert.equal(res.json.code, "lead_not_found");
      }
    }
    assert.equal((await repA.call("GET", `/api/xpot/leads/${leadB.id}/customer-contacts`)).status, 404);
    assert.equal((await repA.call("GET", `/api/xpot/leads/999999/customer-contacts`)).status, 404);
    assert.equal((await repA.call("GET", `/api/xpot/leads/abc/customer-contacts`)).status, 404);
    const stillA = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM lead_customer_contacts WHERE lead_id = ${leadA.id}`);
    assert.equal(stillA.n, 1, "the refused calls changed nothing");
    assert.equal((await admin.call("GET", `/api/xpot/leads/${leadB.id}/customer-contacts`)).status, 200);
    assert.equal((await repB.call("POST", `/api/xpot/leads/${leadB.id}/customer-contacts`, { phone: STRANGER })).status, 201);

    // A business can have only so many phones.
    for (let i = 0; i < 9; i++) assert.equal((await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: `+155501320${String(10 + i)}` })).status, 201);
    const tooMany = await repA.call("POST", `/api/xpot/leads/${leadA.id}/customer-contacts`, { phone: "+15550132099" });
    assert.deepEqual([tooMany.status, tooMany.json.code], [409, "too_many_contacts"]);

    // Taking a lead away deletes its list with it.
    await db.execute(sql`DELETE FROM tags WHERE lead_id = ${leadB.id}`);
    await db.execute(sql`DELETE FROM sales_leads WHERE id = ${leadB.id}`);
    assert.equal((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM lead_customer_contacts WHERE lead_id = ${leadB.id}`)).n, 0);
    assert.equal((await b.call("GET", "/api/my/pieces")).status, 401, "a deleted business leaves no panel behind");
  } finally {
    if (prev === undefined) delete process.env.CUSTOMER_PANEL_ENABLED;
    else process.env.CUSTOMER_PANEL_ENABLED = prev;
    server.close();
    await clean();
  }
}, 120_000);
