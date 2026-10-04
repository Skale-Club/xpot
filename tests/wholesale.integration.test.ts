// Wholesale codes against a real Postgres: issued on approval, checked by the
// Stuscle store through the shared-secret endpoint, dead once the rep is
// blocked or the code is reissued. Skipped unless TAGS_INTEGRATION=1 and
// DATABASE_URL points at a disposable, migrated database.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";
const SECRET = "test-wholesale-secret-123456";

test.skipIf(!enabled)("wholesale codes: issue, verify, block, reissue", async () => {
  const { registerWholesaleRoutes, assignWholesaleCode } = await import("../server/wholesale/index.js");
  const accounts = await import("../server/routes/xpot/resellerAccounts.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const { storage } = await import("../server/storage.js");
  const { formatWholesaleCode } = await import("../shared/wholesale.js");

  const clean = async () => {
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+1555014%')`);
    await db.execute(sql`DELETE FROM users WHERE phone LIKE '+1555014%'`);
  };
  await clean();

  const app = express();
  app.use(express.json());
  registerWholesaleRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const verify = async (code: string, secret: string | null = SECRET) => {
    const res = await fetch(`${base}/api/integrations/stuscle/wholesale/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ code }),
    });
    return { status: res.status, json: await res.json() };
  };
  const actor = { userId: "ws-admin", isAdmin: true };

  try {
    // Not configured: the store gets a clear 503, never a "yes".
    delete process.env.XPOT_WHOLESALE_SECRET;
    assert.equal((await verify("XP-ABCD-1234")).status, 503);
    process.env.XPOT_WHOLESALE_SECRET = SECRET;

    // A sign-up waiting for approval has no code; approval issues one.
    const [u] = (await db.execute(sql`INSERT INTO users (phone, first_name) VALUES ('+15550140001', 'Maria') RETURNING id`)).rows as any[];
    const pending = await storage.upsertSalesRep({ userId: u.id, displayName: "Maria Souza", phone: "+15550140001", isActive: false });
    assert.equal(pending.wholesaleCode ?? null, null);
    const approved = await accounts.approveRep(pending.id, undefined, actor);
    assert.match(approved.wholesaleCode, /^XP[0-9A-HJKMNP-TV-Z]{8}$/);
    const code = formatWholesaleCode(approved.wholesaleCode);

    // Wrong or missing secret.
    assert.equal((await verify(code, "nope")).status, 401);
    assert.equal((await verify(code, null)).status, 401);

    // Valid, however it is typed.
    assert.deepEqual((await verify(code)).json, { valid: true, reseller: { id: pending.id, name: "Maria Souza" } });
    assert.equal((await verify(code.toLowerCase().replace(/-/g, " "))).json.valid, true);
    assert.deepEqual((await verify("XP-0000-0000")).json, { valid: false, reason: "unknown" });
    assert.deepEqual((await verify("hello")).json, { valid: false, reason: "unknown" });

    // Blocked: inactive at once; unblocked: same code works again.
    await accounts.blockRep(pending.id, "Partnership ended", actor);
    assert.deepEqual((await verify(code)).json, { valid: false, reason: "inactive" });
    const back = await accounts.unblockRep(pending.id, actor);
    assert.equal(formatWholesaleCode(back.wholesaleCode), code);
    assert.equal((await verify(code)).json.valid, true);

    // Reissued: the old code is dead, the new one works.
    const fresh = formatWholesaleCode(await assignWholesaleCode(pending.id));
    assert.notEqual(fresh, code);
    assert.equal((await verify(code)).json.valid, false);
    assert.equal((await verify(fresh)).json.valid, true);

    // Access created by an admin comes with a code too.
    const created = await accounts.createResellerAccount(
      accounts.resellerAccountSchema.parse({ displayName: "João", phone: "5550140002" }),
      actor,
    );
    assert.equal((await verify(created.wholesaleCode)).json.valid, true);
  } finally {
    server.close();
    await clean();
    await pool.end();
  }
});
