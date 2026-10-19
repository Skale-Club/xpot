import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, expect, test, vi } from "vitest";

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const directory = join(process.cwd(), "migrations");
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(directory, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { db } = await import("../server/db.js");
const { storage } = await import("../server/storage.js");
const { sql } = await import("drizzle-orm");

afterAll(async () => pg.client?.close());

test("open follow-up tasks per company feed the Companies Follow-up chip", async () => {
  const [ids] = (await db.execute(sql`
    WITH u AS (
      INSERT INTO users (id, phone, first_name) VALUES ('fu-a', '+15550001001', 'A'), ('fu-b', '+15550001002', 'B') RETURNING id
    ), r AS (
      INSERT INTO sales_reps (user_id, display_name, role, is_active)
      SELECT id, id, 'rep', true FROM u RETURNING id, user_id
    ), o AS (
      INSERT INTO organizations (name, slug) VALUES ('Follow Team', 'follow-team') RETURNING id
    ), l AS (
      INSERT INTO sales_leads (organization_id, name)
      SELECT o.id, n FROM o, (VALUES ('Due Co'), ('Undated Co'), ('Done Co'), ('Other Rep Co')) AS v(n) RETURNING id, name
    )
    SELECT
      (SELECT id FROM r WHERE user_id = 'fu-a') AS rep_a,
      (SELECT id FROM r WHERE user_id = 'fu-b') AS rep_b,
      (SELECT id FROM o) AS org,
      (SELECT id FROM l WHERE name = 'Due Co') AS due,
      (SELECT id FROM l WHERE name = 'Undated Co') AS undated,
      (SELECT id FROM l WHERE name = 'Done Co') AS done,
      (SELECT id FROM l WHERE name = 'Other Rep Co') AS other
  `)).rows as Array<Record<string, number>>;

  await db.execute(sql`
    INSERT INTO sales_tasks (organization_id, lead_id, rep_id, type, title, due_at, status) VALUES
      (${ids.org}, ${ids.due}, ${ids.rep_a}, 'follow_up', 'later', '2026-11-05T10:00:00Z', 'pending'),
      (${ids.org}, ${ids.due}, ${ids.rep_a}, 'follow_up', 'sooner', '2026-11-01T10:00:00Z', 'in_progress'),
      (${ids.org}, ${ids.due}, ${ids.rep_a}, 'call', 'not a follow-up', '2026-10-20T10:00:00Z', 'pending'),
      (${ids.org}, ${ids.undated}, ${ids.rep_a}, 'follow_up', 'no date', NULL, 'pending'),
      (${ids.org}, ${ids.done}, ${ids.rep_a}, 'follow_up', 'finished', '2026-10-01T10:00:00Z', 'completed'),
      (${ids.org}, ${ids.other}, ${ids.rep_b}, 'follow_up', 'someone else', '2026-10-25T10:00:00Z', 'pending')
  `);

  const leadIds = [ids.due, ids.undated, ids.done, ids.other];
  const mine = await storage.openFollowUpsByLeadIds(leadIds, ids.rep_a);
  expect([...mine.keys()].sort()).toEqual([ids.due, ids.undated].sort());
  expect(mine.get(ids.due)?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
  expect(mine.get(ids.undated)).toBeNull();

  const everyone = await storage.openFollowUpsByLeadIds(leadIds);
  expect(everyone.has(ids.other)).toBe(true);
  expect(everyone.has(ids.done)).toBe(false);
});
