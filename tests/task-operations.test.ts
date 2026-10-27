import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

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
const { createTask, updateTask } = await import("../server/tasks/service.js");
const { createInboundRouter } = await import("../server/routes/xpot/inbound.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

beforeAll(async () => {
  await q(`INSERT INTO users (id, email) VALUES ('voice-user', 'voice@xpot.test')`);
  const [rep] = await q(`INSERT INTO sales_reps (user_id, display_name) VALUES ('voice-user', 'Voice Rep') RETURNING id`);
  const [org] = await q(`INSERT INTO organizations (name, slug) VALUES ('Voice Org', 'voice-org') RETURNING id`);
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')`, [org.id, rep.id]);
  const [lead] = await q(`INSERT INTO sales_leads (organization_id, owner_rep_id, name) VALUES ($1, $2, 'Audio Customer') RETURNING id`, [org.id, rep.id]);
  await q(`UPDATE sales_leads SET xphere_ref = 'account:11111111-1111-4111-8111-111111111111' WHERE id = $1`, [lead.id]);
  const [visit] = await q(`INSERT INTO sales_visits (rep_id, lead_id, status) VALUES ($1, $2, 'completed') RETURNING id`, [rep.id, lead.id]);
  await q(`INSERT INTO xphere_integrations (user_id, inbound_api_key, is_enabled) VALUES ('voice-user', 'xpot_bidirectional_test', true)`);
  (globalThis as any).__taskFixture = { rep, org, lead, visit };
});

describe("Xphere inbound task mirror", () => {
  it("creates, updates, and ignores stale retries without duplicating the task", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/xpot", createInboundRouter());
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    const post = async (body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/xpot/inbound/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer xpot_bidirectional_test" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const externalId = "22222222-2222-4222-8222-222222222222";
    const base = {
      externalId,
      operation: "upsert",
      occurredAt: "2026-10-13T12:00:00.000Z",
      task: {
        title: "Xphere callback",
        description: "Created in Xphere",
        dueAt: "2026-10-20T14:00:00.000Z",
        priority: "high",
        status: "todo",
        entityType: "account",
        entityId: "11111111-1111-4111-8111-111111111111",
      },
    };
    const created = await post(base);
    expect(created.status).toBe(200);
    expect(created.body.action).toBe("created");

    const completed = await post({
      ...base,
      occurredAt: "2026-10-13T13:00:00.000Z",
      task: { ...base.task, title: "Completed in Xphere", status: "done" },
    });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ action: "updated", taskId: created.body.taskId });

    const stale = await post({
      ...base,
      occurredAt: "2026-10-13T12:30:00.000Z",
      task: { ...base.task, title: "Stale title" },
    });
    expect(stale.status).toBe(200);
    expect(stale.body.action).toBe("stale");

    const rows = await q(`SELECT * FROM sales_tasks WHERE xphere_task_id = $1`, [externalId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Completed in Xphere", status: "completed", source: "integration" });
    server.close();
  });
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

describe("idempotent create (security review A06)", () => {
  it("gives a repeat its own task back and refuses the key to a teammate", async () => {
    const { rep, org } = (globalThis as any).__taskFixture;
    await q(`INSERT INTO users (id, email) VALUES ('mate-user', 'mate@xpot.test')`);
    const [mate] = await q(`INSERT INTO sales_reps (user_id, display_name) VALUES ('mate-user', 'Mate') RETURNING id`);
    await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'member')`, [org.id, mate.id]);
    const actorOf = (r: any, userId: string) => ({
      rep: { ...r, role: "rep", isActive: true, modules: ["visits"] },
      user: { userId, email: null, firstName: null, lastName: null, isAdmin: false },
    }) as any;
    const owner = actorOf(rep, "voice-user");
    const input = { title: "Private follow-up", idempotencyKey: "a06-key", organizationId: org.id } as any;

    const first = await createTask({ actor: owner, source: "manual", input, skipXphereSync: true });
    const again = await createTask({ actor: owner, source: "manual", input, skipXphereSync: true });
    expect(again.id).toBe(first.id);

    await expect(createTask({ actor: actorOf(mate, "mate-user"), source: "manual", input, skipXphereSync: true }))
      .rejects.toMatchObject({ status: 409 });
    expect((await q(`SELECT count(*)::int AS count FROM sales_tasks WHERE idempotency_key = 'a06-key'`))[0].count).toBe(1);
  });
});
