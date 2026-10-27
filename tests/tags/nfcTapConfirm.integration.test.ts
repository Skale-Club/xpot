// A phone opening /n/<code> checks only a chip someone signed in reported
// writing without a read-back ("programmed"); the link alone proves nothing
// (security review A10). Real SQL on PGlite.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, expect, test, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const directory = join(process.cwd(), "migrations");
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(directory, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { confirmNfcFromTap } = await import("../../server/tags/repository.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

afterAll(async () => pg.client?.close());

test("only a reported write is promoted to verified by a tap", async () => {
  const [org] = await q(`INSERT INTO organizations (name, slug) VALUES ('Tap', 'tap-org') RETURNING id`);
  const statuses = ["not_programmed", "programmed", "failed", "verified", "locked"];
  const ids: Record<string, string> = {};
  for (const [i, status] of statuses.entries()) {
    const [tag] = await q(
      `INSERT INTO tags (organization_id, public_code, product_type, nfc_provisioning_status) VALUES ($1, $2, 'keychain', $3) RETURNING id`,
      [org.id, `TAP0000${i}`, status],
    );
    ids[status] = tag.id;
  }
  for (const id of Object.values(ids)) await confirmNfcFromTap(id);
  const after = Object.fromEntries((await q(`SELECT id, nfc_provisioning_status FROM tags`)).map((r) => [r.id, r.nfc_provisioning_status]));
  expect(Object.fromEntries(statuses.map((s) => [s, after[ids[s]]]))).toEqual({
    not_programmed: "not_programmed",
    programmed: "verified",
    failed: "failed",
    verified: "verified",
    locked: "locked",
  });
});
