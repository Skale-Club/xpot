// Admin-managed access against a real Postgres: create by phone, approve,
// block (ends sessions), unblock, change phone, and who may do what.
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable,
// migrated database.
import { test } from "vitest";
import assert from "node:assert/strict";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("reseller access: create, approve, block, unblock, phone", async () => {
  const accounts = await import("../server/routes/xpot/resellerAccounts.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const { storage } = await import("../server/storage.js");

  const clean = async () => {
    await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' IN (SELECT id FROM users WHERE phone LIKE '+1555011%')`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id IN (SELECT id FROM users WHERE phone LIKE '+1555011%')`);
    await db.execute(sql`DELETE FROM users WHERE phone LIKE '+1555011%'`);
  };
  await clean();
  const admin = { userId: "ra-admin", isAdmin: true };
  const manager = { userId: "ra-manager", isAdmin: false };

  try {
    const input = accounts.resellerAccountSchema.parse({ displayName: "João Silva", phone: "(555) 011-0001", modules: ["tags"] });
    const rep = await accounts.createResellerAccount(input, manager);
    assert.equal(rep.isActive, true);
    assert.deepEqual(rep.modules, ["tags"]);
    assert.equal(rep.phone, "+15550110001");
    const [user] = (await db.execute(sql`SELECT phone, first_name, last_name, is_admin FROM users WHERE id = ${rep.userId}`)).rows as any[];
    assert.deepEqual(user, { phone: "+15550110001", first_name: "João", last_name: "Silva", is_admin: false });

    // Same phone again, written differently: refused.
    await assert.rejects(accounts.createResellerAccount({ ...input, phone: "+1 555 011 0001" }, admin), (err: any) => err.status === 409);
    // Not a phone.
    await assert.rejects(accounts.createResellerAccount({ ...input, phone: "12345" }, admin), (err: any) => err.status === 400);
    // Managers can't mint admins.
    const adminInput = accounts.resellerAccountSchema.parse({ displayName: "Boss", phone: "5550110002", role: "admin" });
    await assert.rejects(accounts.createResellerAccount(adminInput, manager), (err: any) => err.status === 403);
    const boss = await accounts.createResellerAccount(adminInput, admin);

    // A self sign-up waits for approval.
    const [pendingUser] = (await db.execute(sql`INSERT INTO users (phone, first_name) VALUES ('+15550110003', 'Maria') RETURNING id`)).rows as any[];
    const pending = await storage.upsertSalesRep({ userId: pendingUser.id, displayName: "Maria", phone: "+15550110003", isActive: false });
    let list = await accounts.listRepsWithAccess();
    assert.equal(list.find((r) => r.id === pending.id)?.access, "pending");
    assert.equal(list.find((r) => r.id === pending.id)?.loginPhone, "+15550110003");
    const approved = await accounts.approveRep(pending.id, ["tags"], manager);
    assert.equal(approved.isActive, true);
    assert.deepEqual(approved.modules, ["tags"]);

    // Blocking ends the rep's sessions right away.
    await db.execute(sql`INSERT INTO sessions (sid, sess, expire) VALUES ('ra-sess-1', ${JSON.stringify({ userId: pendingUser.id })}::jsonb, now() + interval '1 day')`);
    const blocked = await accounts.blockRep(pending.id, "Partnership ended", manager);
    assert.equal(blocked.isActive, false);
    assert.ok(blocked.blockedAt);
    assert.equal(blocked.blockedReason, "Partnership ended");
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM sessions WHERE sid = 'ra-sess-1'`)).rows as any[];
    assert.equal(n, 0);
    list = await accounts.listRepsWithAccess();
    assert.equal(list.find((r) => r.id === pending.id)?.access, "blocked");
    // A blocked rep is unblocked, not approved.
    await assert.rejects(accounts.approveRep(pending.id, undefined, manager), (err: any) => err.status === 409);
    const back = await accounts.unblockRep(pending.id, manager);
    assert.equal(back.isActive, true);
    assert.equal(back.blockedAt, null);

    // Managers can't touch admins; nobody can block themselves.
    await assert.rejects(accounts.blockRep(boss.id, null, manager), (err: any) => err.status === 403);
    await assert.rejects(accounts.blockRep(boss.id, null, { userId: boss.userId, isAdmin: true }), (err: any) => err.status === 400);

    // New phone for a rep: login and profile both move; a taken number is refused.
    const moved = await accounts.changeRepPhone(rep.id, { phone: "555 011 0009" }, manager);
    assert.equal(moved.phone, "+15550110009");
    const [movedUser] = (await db.execute(sql`SELECT phone FROM users WHERE id = ${rep.userId}`)).rows as any[];
    assert.equal(movedUser.phone, "+15550110009");
    await assert.rejects(accounts.changeRepPhone(rep.id, { phone: "+15550110003" }, manager), (err: any) => err.status === 409);
  } finally {
    await clean();
    await pool.end();
  }
});
