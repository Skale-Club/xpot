// Tasks follow management mode like every other list: with "X-Xpot-View: rep"
// (management mode off, client/src/lib/adminMode.ts) a manager's "Whole team"
// and "?repId=" ask for nothing more than their own tasks.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

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

const { createTasksRouter } = await import("../server/routes/xpot/tasks.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

let ids: { boss: number; rep: number };

beforeAll(async () => {
  await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ('boss', '+15550007001', 'Boss', true), ('field', '+15550007002', 'Field', false)`);
  const boss = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('boss', 'Boss', 'admin', true) RETURNING id`)).id;
  const rep = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('field', 'Field', 'rep', true) RETURNING id`)).id;
  const org = (await one(`INSERT INTO organizations (name, slug) VALUES ('Scope Team', 'scope-team') RETURNING id`)).id;
  await q(`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member')`, [org, boss, rep]);
  await q(`INSERT INTO sales_tasks (organization_id, rep_id, type, title, status) VALUES ($1, $2, 'call', 'boss task', 'pending'), ($1, $3, 'call', 'rep task', 'pending')`, [org, boss, rep]);
  ids = { boss, rep };
});

async function titles(path: string, view?: "rep") {
  const server = express();
  server.use((req, _res, next) => {
    (req as any).session = { userId: "boss", email: null, firstName: "Boss", isAdmin: true };
    next();
  });
  server.use("/api/xpot", createTasksRouter());
  return new Promise<string[]>((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: view ? { "X-Xpot-View": view } : undefined });
        expect(response.status).toBe(200);
        resolve(((await response.json()) as Array<{ title: string }>).map((task) => task.title).sort());
      } catch (error) {
        reject(error);
      } finally {
        listener.close();
      }
    });
  });
}

test("in management mode a manager's Whole team lists everyone's tasks", async () => {
  expect(await titles("/api/xpot/tasks?all=true")).toEqual(["boss task", "rep task"]);
  expect(await titles(`/api/xpot/tasks?repId=${ids.rep}`)).toEqual(["rep task"]);
});

test("with management mode off the same requests list only the manager's own tasks", async () => {
  expect(await titles("/api/xpot/tasks?all=true", "rep")).toEqual(["boss task"]);
  expect(await titles(`/api/xpot/tasks?repId=${ids.rep}`, "rep")).toEqual(["boss task"]);
  expect(await titles("/api/xpot/tasks", "rep")).toEqual(["boss task"]);
});
