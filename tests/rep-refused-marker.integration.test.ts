// A refused sign-up is marked explicitly (sales_reps.refused_at, BACKLOG
// UXR-26), so People lists it as "Refused" whatever its reason says; unblocking
// clears it, and migration 0055 marks the refusals made before it from the
// default refusal texts they stored. Against the real migrations (PGlite).

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const accounts = await import("../server/routes/xpot/resellerAccounts.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

const manager = { userId: "rm-manager", isAdmin: false };
let seq = 0;
async function person(opts: { active?: boolean; blockedReason?: string | null } = {}) {
  seq += 1;
  const userId = `rm-${seq}`;
  await q(`INSERT INTO users (id, phone, first_name) VALUES ($1, $2, $1)`, [userId, `+1555800${String(seq).padStart(4, "0")}`]);
  const blocked = opts.blockedReason !== undefined;
  return (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active, blocked_at, blocked_reason)
    VALUES ($1, $1, 'rep', $2, $3, $4) RETURNING id`, [userId, opts.active ?? false, blocked ? new Date("2026-10-01T12:00:00Z").toISOString().replace("Z", "") : null, opts.blockedReason ?? null])).id as number;
}
const listed = async (id: number) => (await accounts.listRepsWithAccess()).find((rep) => rep.id === id);

beforeEach(async () => {
  await q(`TRUNCATE sales_reps, users RESTART IDENTITY CASCADE`);
});

describe("refusing a sign-up", () => {
  it("marks it, so People lists it as refused whatever the reason says", async () => {
    const applicant = await person();
    const refused = await accounts.refuseRep(applicant, "Lives too far", manager);
    expect(refused.refusedAt).toBeInstanceOf(Date);
    expect(refused.blockedReason).toBe("Sign-up refused: Lives too far");
    expect(await listed(applicant)).toMatchObject({ access: "blocked", refused: true });
    // The reason does not decide: a refusal whose text was edited stays a refusal.
    await q(`UPDATE sales_reps SET blocked_reason = 'Lives too far' WHERE id = $1`, [applicant]);
    expect((await listed(applicant))?.refused).toBe(true);
  });

  it("is cleared by unblocking, and a plain block is never a refusal", async () => {
    const applicant = await person();
    await accounts.refuseRep(applicant, null, manager);
    const back = await accounts.unblockRep(applicant, manager);
    expect(back.refusedAt).toBeNull();
    expect(await listed(applicant)).toMatchObject({ access: "active", refused: false });

    // Even with a reason that looks like a refusal, a block is a block.
    const partner = await person({ active: true });
    await accounts.blockRep(partner, "Sign-up refused", manager);
    expect(await listed(partner)).toMatchObject({ access: "blocked", refused: false });
  });
});

describe("migration 0055", () => {
  it("marks the refusals made before the marker from their default texts", async () => {
    const english = await person({ blockedReason: "Sign-up refused" });
    const withNote = await person({ blockedReason: "Sign-up refused: no car" });
    const portuguese = await person({ blockedReason: "  Cadastro recusado  " });
    const spanish = await person({ blockedReason: "Registro rechazado: sin auto" });
    const ended = await person({ blockedReason: "Partnership ended" });
    const lookalike = await person({ blockedReason: "Sign-up refusedness" });
    const pending = await person();

    await pg.client.exec(readFileSync(join(process.cwd(), "migrations", "0055_rep_refused_at.sql"), "utf8"));

    const refusedIds = (await q(`SELECT id FROM sales_reps WHERE refused_at IS NOT NULL ORDER BY id`)).map((row) => row.id);
    expect(refusedIds).toEqual([english, withNote, portuguese, spanish]);
    expect([ended, lookalike, pending].some((id) => refusedIds.includes(id))).toBe(false);
    // The refusal keeps the moment of the block.
    expect(new Date((await one(`SELECT refused_at FROM sales_reps WHERE id = $1`, [english])).refused_at).toISOString())
      .toBe("2026-10-01T12:00:00.000Z");
    expect((await listed(portuguese))?.refused).toBe(true);
    expect((await listed(ended))?.refused).toBe(false);

    // Running it again changes nothing.
    await pg.client.exec(readFileSync(join(process.cwd(), "migrations", "0055_rep_refused_at.sql"), "utf8"));
    expect((await q(`SELECT id FROM sales_reps WHERE refused_at IS NOT NULL ORDER BY id`)).map((row) => row.id)).toEqual(refusedIds);
  });
});
