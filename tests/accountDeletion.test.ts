// Account deletion and lead/visit file cleanup against real SQL: the repo's
// migrations applied to an in-process Postgres (PGlite), so foreign keys,
// cascades and the jsonb photo lookups behave as in production. File storage
// is in memory (tests/helpers/memoryStore.ts).

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore, type MemoryStore } from "./helpers/memoryStore.js";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  // scripts/migrate.ts creates this before running the files; 0007 refers to it.
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(dir, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { storage } = await import("../server/storage.js");
const { deleteRepAccount, AccountDeletionError } = await import("../server/accountDeletion.js");
const { setFileStoresForTests } = await import("../server/lib/files.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

let r2: MemoryStore;
let pub: MemoryStore;

async function seedUser(id: string, phone: string, extra: Record<string, unknown> = {}) {
  await q(`INSERT INTO users (id, phone, first_name, email, profile_image_url, is_admin) VALUES ($1, $2, $3, $4, $5, $6)`, [
    id, phone, extra.firstName ?? "Name", extra.email ?? null, extra.profileImageUrl ?? null, extra.isAdmin ?? false,
  ]);
  const rep = await one(
    `INSERT INTO sales_reps (user_id, display_name, phone, email, avatar_url, wholesale_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [id, extra.displayName ?? id, phone, extra.email ?? null, extra.avatarUrl ?? null, extra.wholesaleCode ?? null],
  );
  return rep.id as number;
}

const lead = async (name: string, ownerRepId: number | null, photos: string[] = []) =>
  (await one(`INSERT INTO sales_leads (name, owner_rep_id, photos) VALUES ($1, $2, $3::jsonb) RETURNING id`, [name, ownerRepId, JSON.stringify(photos)])).id as number;
const visit = async (repId: number, leadId: number, audio?: string) => {
  const v = (await one(`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [repId, leadId])).id as number;
  if (audio !== undefined) await q(`INSERT INTO sales_visit_notes (visit_id, audio_url, created_by_rep_id) VALUES ($1, $2, $3)`, [v, audio, repId]);
  return v;
};

beforeAll(async () => {
  // Make sure the mock factory ran.
  await storage.listSalesReps();
});

beforeEach(async () => {
  await q(`TRUNCATE sessions, auth_phone_codes, sales_sale_items, sales_sales, sales_visit_actions, sales_tasks, sales_opportunities_local,
           sales_visit_notes, sales_visits, sales_lead_contacts, sales_lead_locations, sales_leads, xphere_integrations,
           mcp_oauth_tokens, mcp_oauth_codes, mcp_tokens, sales_reps, users RESTART IDENTITY CASCADE`);
  r2 = memoryStore("r2");
  pub = memoryStore("supabase");
  setFileStoresForTests({ r2, supabase: null, public: pub });
});

describe("lead and visit deletes report their files", () => {
  it("deleteSalesLead returns the lead's photos and its visits' voice notes", async () => {
    const rep = await seedUser("u-1", "+15550000001");
    const l = await lead("Cafe", rep, ["r2:photos/1/lead_1_1.jpg", "https://x.supabase.co/storage/v1/object/public/uploads/photos/1/lead_1_0.jpg"]);
    await visit(rep, l, "r2:audio/1/visit_1_1.webm");
    await visit(rep, l); // a visit without a voice note
    const files = await storage.deleteSalesLead(l);
    expect(files.sort()).toEqual([
      "https://x.supabase.co/storage/v1/object/public/uploads/photos/1/lead_1_0.jpg",
      "r2:audio/1/visit_1_1.webm",
      "r2:photos/1/lead_1_1.jpg",
    ]);
    expect(await one(`SELECT count(*)::int AS n FROM sales_leads`)).toEqual({ n: 0 });
  });

  it("deleteSalesVisit returns the note's voice note", async () => {
    const rep = await seedUser("u-1", "+15550000001");
    const l = await lead("Cafe", rep);
    const v = await visit(rep, l, "r2:audio/1/visit_9_1.webm");
    expect(await storage.deleteSalesVisit(v)).toEqual(["r2:audio/1/visit_9_1.webm"]);
    const bare = await visit(rep, l);
    expect(await storage.deleteSalesVisit(bare)).toEqual([]);
  });

  it("finds the lead or visit that holds a file reference", async () => {
    const rep = await seedUser("u-1", "+15550000001");
    const l = await lead("Cafe", rep, ["r2:photos/1/a.jpg", "r2:photos/1/b.jpg"]);
    const v = await visit(rep, l, "r2:audio/1/v.webm");
    expect(await storage.findLeadIdByPhoto("r2:photos/1/b.jpg")).toBe(l);
    expect(await storage.findLeadIdByPhoto("r2:photos/1/zzz.jpg")).toBeUndefined();
    expect(await storage.findVisitIdByAudio("r2:audio/1/v.webm")).toBe(v);
    expect(await storage.findVisitIdByAudio("r2:audio/1/nope.webm")).toBeUndefined();
  });
});

describe("deleting a rep's account", () => {
  const admin = { userId: "u-admin", isAdmin: true };

  it("deletes their data and files, keeps sales under an anonymous placeholder", async () => {
    await seedUser("u-admin", "+15550000009", { isAdmin: true });
    const avatar = "https://x.supabase.co/storage/v1/object/public/uploads/avatars/1/me.jpg";
    const a = await seedUser("u-a", "+15550000001", { displayName: "Ana Souza", email: "ana@x.test", avatarUrl: avatar, wholesaleCode: "XPAAAA1111" });
    const b = await seedUser("u-b", "+15550000002", { displayName: "Bruno" });
    const aPhoto = (n: string) => `r2:photos/${a}/${n}.jpg`;
    const bPhoto = (n: string) => `r2:photos/${b}/${n}.jpg`;

    // Ana's businesses: one plain, one with a sale (must stay).
    const plain = await lead("Plain", a, [aPhoto("plain")]);
    const sold = await lead("Sold", a, [aPhoto("sold"), bPhoto("sold")]);
    await q(`INSERT INTO sales_sales (lead_id, rep_id, total_cents) VALUES ($1, $2, 5000)`, [sold, a]);
    // Bruno's business, with a photo Ana took there.
    const brunos = await lead("Brunos", b, [aPhoto("brunos"), bPhoto("brunos")]);

    await visit(a, plain, `r2:audio/${a}/visit_1.webm`);
    await visit(b, plain, `r2:audio/${b}/visit_2.webm`); // goes with Ana's deleted business
    const anaOnSold = await visit(a, sold, `r2:audio/${a}/visit_3.webm`);
    await visit(a, brunos, `r2:audio/${a}/visit_4.webm`);
    const brunoVisit = await visit(b, brunos, `r2:audio/${b}/visit_5.webm`);
    await q(`UPDATE sales_sales SET visit_id = $1`, [anaOnSold]);
    await q(`INSERT INTO sales_tasks (rep_id, lead_id, title) VALUES ($1, $2, 'call back')`, [a, brunos]);
    await q(`INSERT INTO sales_tasks (rep_id, lead_id, visit_id, title) VALUES ($1, $2, $3, 'bruno task')`, [b, brunos, brunoVisit]);
    await q(`INSERT INTO sales_opportunities_local (lead_id, rep_id, title) VALUES ($1, $2, 'deal')`, [brunos, a]);
    await q(`INSERT INTO sessions (sid, sess, expire) VALUES ('s1', '{"userId":"u-a"}', NOW() + interval '1 day'), ('s2', '{"userId":"u-b"}', NOW() + interval '1 day')`);
    await q(`INSERT INTO auth_phone_codes (phone, code_hash, expires_at) VALUES ('+15550000001', 'h', NOW())`);

    // Everything in storage, plus an orphan from before cleanup existed.
    for (const ref of [aPhoto("plain"), aPhoto("sold"), bPhoto("sold"), aPhoto("brunos"), bPhoto("brunos")]) r2.objects.set(ref.slice(3), new Uint8Array([1]));
    for (const key of [`audio/${a}/visit_1.webm`, `audio/${b}/visit_2.webm`, `audio/${a}/visit_3.webm`, `audio/${a}/visit_4.webm`, `audio/${b}/visit_5.webm`]) {
      r2.objects.set(key, new Uint8Array([1]));
    }
    r2.objects.set(`audio/${a}/orphan_old_recording.webm`, new Uint8Array([1]));
    pub.objects.set(`avatars/${a}/me.jpg`, new Uint8Array([1]));

    const result = await deleteRepAccount(a, admin);

    expect(result).toMatchObject({ account: "anonymized", leadsDeleted: 1, leadsUnassigned: 1, files: { failed: 0 } });
    // Visits: Ana's plain-business visit + Bruno's visit there (with the business), Ana's on Sold and on Bruno's.
    expect(result.visitsDeleted).toBe(4);

    // Businesses.
    expect(await one(`SELECT count(*)::int AS n FROM sales_leads WHERE id = $1`, [plain])).toEqual({ n: 0 });
    expect(await one(`SELECT owner_rep_id, photos FROM sales_leads WHERE id = $1`, [sold])).toEqual({ owner_rep_id: null, photos: [bPhoto("sold")] });
    expect(await one(`SELECT owner_rep_id, photos FROM sales_leads WHERE id = $1`, [brunos])).toEqual({ owner_rep_id: b, photos: [bPhoto("brunos")] });

    // Ana's activity is gone; Bruno's stays.
    expect(await q(`SELECT rep_id FROM sales_visits ORDER BY id`)).toEqual([{ rep_id: b }]);
    expect(await q(`SELECT title, visit_id FROM sales_tasks`)).toEqual([{ title: "bruno task", visit_id: brunoVisit }]);
    expect(await one(`SELECT count(*)::int AS n FROM sales_opportunities_local`)).toEqual({ n: 0 });

    // The sale stays, under the placeholder, without its (deleted) visit.
    expect(await one(`SELECT rep_id, visit_id, total_cents FROM sales_sales`)).toEqual({ rep_id: a, visit_id: null, total_cents: 5000 });
    const rep = await one(`SELECT display_name, email, phone, avatar_url, wholesale_code, is_active, deleted_at IS NOT NULL AS deleted FROM sales_reps WHERE id = $1`, [a]);
    expect(rep).toEqual({ display_name: "Deleted account", email: null, phone: null, avatar_url: null, wholesale_code: null, is_active: false, deleted: true });
    expect(await one(`SELECT email, phone, first_name, profile_image_url FROM users WHERE id = 'u-a'`)).toEqual({ email: null, phone: null, first_name: null, profile_image_url: null });

    // Signed out, no pending codes; Bruno untouched.
    expect(await q(`SELECT sid FROM sessions`)).toEqual([{ sid: "s2" }]);
    expect(await one(`SELECT count(*)::int AS n FROM auth_phone_codes`)).toEqual({ n: 0 });

    // Files: everything Ana uploaded (and the orphan), plus the voice note of Bruno's visit on Ana's deleted business.
    expect(Array.from(r2.objects.keys()).sort()).toEqual([`audio/${b}/visit_5.webm`, `photos/${b}/brunos.jpg`, `photos/${b}/sold.jpg`]);
    expect(pub.objects.size).toBe(0);

    // Hidden from Admin › Reps, and can't be deleted twice.
    const { listRepsWithAccess } = await import("../server/routes/xpot/resellerAccounts.js");
    expect((await listRepsWithAccess()).map((r) => r.id)).not.toContain(a);
    await expect(deleteRepAccount(a, admin)).rejects.toMatchObject({ status: 404 });
  });

  it("removes the rows outright when nothing has to be kept", async () => {
    await seedUser("u-admin", "+15550000009", { isAdmin: true });
    const a = await seedUser("u-a", "+15550000001");
    const l = await lead("Cafe", a, [`r2:photos/${a}/x.jpg`]);
    await visit(a, l, `r2:audio/${a}/v.webm`);
    r2.objects.set(`photos/${a}/x.jpg`, new Uint8Array([1]));
    r2.objects.set(`audio/${a}/v.webm`, new Uint8Array([1]));

    const result = await deleteRepAccount(a, admin);
    expect(result).toMatchObject({ account: "deleted", leadsDeleted: 1, leadsUnassigned: 0, visitsDeleted: 1 });
    expect(await one(`SELECT count(*)::int AS n FROM sales_reps WHERE id = $1`, [a])).toEqual({ n: 0 });
    expect(await one(`SELECT count(*)::int AS n FROM users WHERE id = 'u-a'`)).toEqual({ n: 0 });
    expect(r2.objects.size).toBe(0);
  });

  it("logs and reports files it could not delete, without undoing the deletion", async () => {
    await seedUser("u-admin", "+15550000009", { isAdmin: true });
    const a = await seedUser("u-a", "+15550000001");
    await lead("Cafe", a, [`r2:photos/${a}/x.jpg`]);
    r2.failRemove = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await deleteRepAccount(a, admin);
    expect(result.account).toBe("deleted");
    expect(result.files.failed).toBeGreaterThan(0);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("is for admins only, and never your own account", async () => {
    await seedUser("u-admin", "+15550000009", { isAdmin: true });
    const a = await seedUser("u-a", "+15550000001");
    const adminRep = (await one(`SELECT id FROM sales_reps WHERE user_id = 'u-admin'`)).id;
    await expect(deleteRepAccount(a, { userId: "u-m", isAdmin: false })).rejects.toBeInstanceOf(AccountDeletionError);
    await expect(deleteRepAccount(adminRep, admin)).rejects.toMatchObject({ status: 400 });
    expect(await one(`SELECT count(*)::int AS n FROM sales_reps`)).toEqual({ n: 2 });
  });
});
