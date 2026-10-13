import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";

const pg = vi.hoisted(() => ({ client: null as any }));
vi.mock("../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(dir, file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { applyAction } = await import("../server/routes/xpot/visit-actions.js");
const { updateTask } = await import("../server/tasks/service.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

beforeAll(async () => {
  await q(`INSERT INTO users (id, email) VALUES ('voice-user', 'voice@xpot.test')`);
  const [rep] = await q(`INSERT INTO sales_reps (user_id, display_name) VALUES ('voice-user', 'Voice Rep') RETURNING id`);
  const [org] = await q(`INSERT INTO organizations (name, slug) VALUES ('Voice Org', 'voice-org') RETURNING id`);
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [org.id, rep.id]);
  const [lead] = await q(`INSERT INTO sales_leads (organization_id, owner_rep_id, name) VALUES ($1, $2, 'Audio Customer') RETURNING id`, [org.id, rep.id]);
  const [visit] = await q(`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [rep.id, lead.id]);
  (globalThis as any).__taskFixture = { rep, org, lead, visit };
});

describe("canonical task lifecycle from visit audio", () => {
  it("applies a confirmed follow-up once, preserving voice evidence and lifecycle timestamps", async () => {
    const { rep, lead, visit } = (globalThis as any).__taskFixture;
    const actor = {
      rep: { ...rep, role: "rep", isActive: true, modules: ["visits"] },
      user: { userId: "voice-user", email: "voice@xpot.test", firstName: null, lastName: null, isAdmin: false },
    };
    const row = {
      id: 77, visitId: visit.id, leadId: lead.id, repId: rep.id, type: "follow_up", status: "proposed",
      payload: { type: "follow_up", title: "Return with the website proposal", interest: "website", inDays: 7, evidence: "asked me to return next week" },
      evidence: "asked me to return next week", confidence: 96, resultRef: null, error: null, appliedAt: null, createdAt: new Date(), updatedAt: new Date(),
    } as any;

    const first = await applyAction(row, { actor, repId: rep.id, visitId: visit.id, leadId: lead.id });
    const second = await applyAction(row, { actor, repId: rep.id, visitId: visit.id, leadId: lead.id });
    expect(second).toBe(first);

    const [task] = await q(`SELECT * FROM sales_tasks WHERE id = $1`, [Number(first.split(":")[1])]);
    expect(task).toMatchObject({ source: "voice", priority: "medium", status: "pending", visit_id: visit.id, lead_id: lead.id });
    expect(task.description).toContain("website");
    expect(task.description).toContain("asked me to return next week");
    expect((await q(`SELECT count(*)::int AS count FROM sales_tasks WHERE idempotency_key = 'visit-action-77'`))[0].count).toBe(1);

    const started = await updateTask(actor as any, task.id, { status: "in_progress" });
    expect(started.status).toBe("in_progress");
    const completed = await updateTask(actor as any, task.id, { status: "completed" });
    expect(completed.completedAt).toBeTruthy();
    const reopened = await updateTask(actor as any, task.id, { status: "pending" });
    expect(reopened.completedAt).toBeNull();
  });
});
