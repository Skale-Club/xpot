// Admin-created reseller logins against a real Postgres, with the Supabase
// Auth admin API replaced by an in-memory fake. Skipped unless
// TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database.
import { test } from "vitest";
import assert from "node:assert/strict";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("reseller accounts: create, duplicates, roles, password reset", async () => {
  const { createResellerAccount, resetRepPassword, resellerAccountSchema, AccountError } = await import("../server/routes/xpot/resellerAccounts.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");

  const clean = async () => {
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'ra-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'ra-%'`);
  };
  await clean();

  const logins = new Map<string, string>();
  const passwords = new Map<string, string>();
  const auth = {
    async createUser(email: string, password: string) {
      if (logins.has(email)) throw new AccountError("This email already has a login.", 409);
      const id = `ra-${logins.size + 1}`;
      logins.set(email, id);
      passwords.set(id, password);
      return { id };
    },
    async setPassword(userId: string, password: string) {
      passwords.set(userId, password);
    },
  };

  try {
    const input = resellerAccountSchema.parse({ email: " Joao@Example.com ", password: "s3cret-pass", displayName: "João Silva", modules: ["tags"] });
    const rep = await createResellerAccount(input, false, auth);
    assert.equal(rep.isActive, true);
    assert.deepEqual(rep.modules, ["tags"]);
    assert.equal(rep.role, "rep");
    assert.equal(rep.email, "joao@example.com");
    const [user] = (await db.execute(sql`SELECT email, first_name, last_name, is_admin FROM users WHERE id = ${rep.userId}`)).rows as any[];
    assert.deepEqual(user, { email: "joao@example.com", first_name: "João", last_name: "Silva", is_admin: false });

    // Same email again: refused before touching Supabase.
    await assert.rejects(createResellerAccount(input, false, auth), (err: any) => err.status === 409);
    assert.equal(logins.size, 1);

    // Managers can't mint admins; admins can.
    const adminInput = resellerAccountSchema.parse({ email: "boss@example.com", password: "s3cret-pass", displayName: "Boss", role: "admin" });
    await assert.rejects(createResellerAccount(adminInput, false, auth), (err: any) => err.status === 403);
    const admin = await createResellerAccount(adminInput, true, auth);
    const [adminUser] = (await db.execute(sql`SELECT is_admin FROM users WHERE id = ${admin.userId}`)).rows as any[];
    assert.equal(adminUser.is_admin, true);

    // Password reset: any rep by a manager, an admin only by an admin.
    await resetRepPassword(rep.id, "new-pass-123", false, auth);
    assert.equal(passwords.get(rep.userId!), "new-pass-123");
    await assert.rejects(resetRepPassword(admin.id, "x-pass-1234", false, auth), (err: any) => err.status === 403);
    await assert.rejects(resetRepPassword(999_999, "x-pass-1234", true, auth), (err: any) => err.status === 404);

    // Validation.
    assert.equal(resellerAccountSchema.safeParse({ email: "a@b.co", password: "short", displayName: "A" }).success, false);
    assert.equal(resellerAccountSchema.safeParse({ email: "a@b.co", password: "long-enough", displayName: "A", modules: [] }).success, false);
  } finally {
    await clean();
    await pool.end();
  }
});
