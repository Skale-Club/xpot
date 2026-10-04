// Phone sign-in end to end against a real Postgres, with SMS captured in
// memory: codes, limits, sign-up waiting for approval, approval, blocking.
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("phone sign-in: code, sign-up pending, approval, blocking", async () => {
  const { registerPhoneAuthRoutes } = await import("../server/auth/phoneAuth.js");
  const accounts = await import("../server/routes/xpot/resellerAccounts.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");

  const PHONE = "+15550120001";
  const clean = async () => {
    await db.execute(sql`DELETE FROM auth_phone_codes WHERE phone LIKE '+1555012%'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+1555012%')`);
    await db.execute(sql`DELETE FROM users WHERE phone LIKE '+1555012%'`);
  };
  await clean();

  const sent: Array<{ to: string; body: string }> = [];
  const sms = { live: true, async send(to: string, body: string) { sent.push({ to, body }); } };
  const lastCode = () => /(\d{6})/.exec(sent[sent.length - 1].body)![1];
  // Lets a test ask for a new code without waiting 30 seconds.
  const age = () => db.execute(sql`UPDATE auth_phone_codes SET created_at = created_at - interval '1 minute' WHERE phone = ${PHONE}`);

  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  registerPhoneAuthRoutes(app, sms);
  app.get("/whoami", (req, res) => res.json({ userId: (req.session as any).userId ?? null }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: res.status, json: await res.json() };
  };

  try {
    assert.equal((await call("POST", "/api/auth/phone/start", { phone: "hello" })).json.code, "invalid_phone");

    // New number: code in Portuguese, typed as a local US number.
    const start = await call("POST", "/api/auth/phone/start", { phone: "(555) 012-0001", lang: "pt" });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    assert.equal(start.json.phone, PHONE);
    assert.equal(sent[0].to, PHONE);
    assert.match(sent[0].body, /^Xpot: seu código de acesso é \d{6}\./);
    // A second code right away has to wait.
    const again = await call("POST", "/api/auth/phone/start", { phone: PHONE });
    assert.equal(again.status, 429);
    assert.equal(again.json.code, "wait");

    // Wrong code, then the right one: unknown number → asked for a name.
    const code = lastCode();
    const wrong = await call("POST", "/api/auth/phone/verify", { phone: PHONE, code: code === "000000" ? "111111" : "000000" });
    assert.deepEqual([wrong.status, wrong.json.code, wrong.json.attemptsLeft], [400, "wrong_code", 4]);
    const verified = await call("POST", "/api/auth/phone/verify", { phone: PHONE, code });
    assert.equal(verified.json.status, "new");
    // A spent code doesn't work twice.
    assert.equal((await call("POST", "/api/auth/phone/verify", { phone: PHONE, code })).json.code, "code_expired");

    // Sign-up: pending, no session.
    const reg = await call("POST", "/api/auth/phone/register", { displayName: "Maria Souza" });
    assert.equal(reg.status, 201);
    assert.equal(reg.json.status, "pending");
    assert.equal((await call("GET", "/whoami")).json.userId, null);
    const [rep] = (await db.execute(sql`SELECT r.id, r.is_active, r.display_name FROM sales_reps r JOIN users u ON u.id = r.user_id WHERE u.phone = ${PHONE}`)).rows as any[];
    assert.deepEqual([rep.is_active, rep.display_name], [false, "Maria Souza"]);
    // Registering needs a freshly verified number.
    assert.equal((await call("POST", "/api/auth/phone/register", { displayName: "Someone" })).status, 401);

    const signIn = async () => {
      await age();
      await call("POST", "/api/auth/phone/start", { phone: PHONE });
      return call("POST", "/api/auth/phone/verify", { phone: PHONE, code: lastCode() });
    };
    // Still pending: told so, still no session.
    assert.equal((await signIn()).json.status, "pending");
    assert.equal((await call("GET", "/whoami")).json.userId, null);

    // Approved: signed in.
    const actor = { userId: "pa-admin", isAdmin: true };
    await accounts.approveRep(rep.id, undefined, actor);
    assert.equal((await signIn()).json.status, "active");
    assert.ok((await call("GET", "/whoami")).json.userId);

    // Blocked: told so, no session.
    await accounts.blockRep(rep.id, "Partnership ended", actor);
    cookie = "";
    assert.equal((await signIn()).json.status, "blocked");
    assert.equal((await call("GET", "/whoami")).json.userId, null);

    // Five wrong tries burn the code.
    await age();
    await call("POST", "/api/auth/phone/start", { phone: PHONE });
    for (let i = 0; i < 5; i++) await call("POST", "/api/auth/phone/verify", { phone: PHONE, code: lastCode() === "000000" ? "111111" : "000000" });
    assert.equal((await call("POST", "/api/auth/phone/verify", { phone: PHONE, code: lastCode() })).json.code, "too_many_attempts");

    // Expired code.
    await age();
    await call("POST", "/api/auth/phone/start", { phone: PHONE });
    await db.execute(sql`UPDATE auth_phone_codes SET expires_at = now() - interval '1 second' WHERE phone = ${PHONE}`);
    assert.equal((await call("POST", "/api/auth/phone/verify", { phone: PHONE, code: lastCode() })).json.code, "code_expired");

    // Codes are stored hashed.
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM auth_phone_codes WHERE phone = ${PHONE} AND code_hash = ${lastCode()}`)).rows as any[];
    assert.equal(n, 0);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
