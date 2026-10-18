// Whose records each list shows (server/routes/xpot/middleware.ts listScope).
// One rule for everyone: management mode off ("X-Xpot-View: rep") is the
// person's own records; on, the scope they manage: a platform manager's
// everyone (no header, as before), a Rep Admin's own organizations and never
// another ("X-Xpot-View: manage", the only thing that widens theirs). A plain
// rep can't widen anything by sending headers.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

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

const { createSalesRouter } = await import("../server/routes/xpot/sales.js");
const { createConsignmentsRouter } = await import("../server/routes/xpot/consignments.js");
const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
const { createTasksRouter } = await import("../server/routes/xpot/tasks.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

type Person = "boss" | "lead" | "mate" | "outsider";
const people: Record<Person, { id: number; admin: boolean }> = {} as any;
const nameOfRep = new Map<number, Person>();
let teamA = 0;
let teamB = 0;

beforeAll(async () => {
  // boss: the Xpot admin (a platform manager). lead: Rep Admin of Team A. mate:
  // a plain member of Team A. outsider: Rep Admin of Team B.
  for (const [person, admin] of [["boss", true], ["lead", false], ["mate", false], ["outsider", false]] as const) {
    await q(`INSERT INTO users (id, phone, first_name, is_admin) VALUES ($1, $2, $1, $3)`, [person, `+1555000${Object.keys(people).length + 81}00`, admin]);
    const rep = await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ($1, $1, $2, true) RETURNING id`, [person, admin ? "admin" : "rep"]);
    people[person] = { id: rep.id, admin };
    nameOfRep.set(rep.id, person);
  }
  teamA = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team A', 'team-a') RETURNING id`)).id;
  teamB = (await one(`INSERT INTO organizations (name, slug) VALUES ('Team B', 'team-b') RETURNING id`)).id;
  await q(
    `INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $3, 'admin'), ($1, $4, 'member'), ($2, $5, 'admin')`,
    [teamA, teamB, people.lead.id, people.mate.id, people.outsider.id],
  );
  const product = (await one(`INSERT INTO sales_products (name, base_price_cents, consignable) VALUES ('Display', 1000, true) RETURNING id`)).id;
  // One company, one sale, one consignment and one task per person (boss's in Team A).
  for (const person of ["boss", "lead", "mate", "outsider"] as Person[]) {
    const organizationId = person === "outsider" ? teamB : teamA;
    const repId = people[person].id;
    const lead = (await one(
      `INSERT INTO sales_leads (organization_id, name, owner_rep_id) VALUES ($1, $2, $3) RETURNING id`,
      [organizationId, `${person} company`, repId],
    )).id;
    await q(`INSERT INTO sales_sales (organization_id, lead_id, rep_id, subtotal_cents, total_cents) VALUES ($1, $2, $3, 1000, 1000)`, [organizationId, lead, repId]);
    await q(
      `INSERT INTO sales_consignments (organization_id, lead_id, product_id, rep_id, unit_price_cents, quantity_on_hand) VALUES ($1, $2, $3, $4, 1000, 2)`,
      [organizationId, lead, product, repId],
    );
    await q(`INSERT INTO sales_tasks (organization_id, rep_id, type, title, status) VALUES ($1, $2, 'call', $3, 'pending')`, [organizationId, repId, `${person} task`]);
  }
});

type View = "rep" | "manage" | undefined;

async function get(person: Person, path: string, view: View): Promise<any> {
  const server = express();
  server.use((req, _res, next) => {
    (req as any).session = { userId: person, email: null, firstName: person, isAdmin: people[person].admin };
    next();
  });
  server.use("/api/xpot", createSalesRouter());
  server.use("/api/xpot", createConsignmentsRouter());
  server.use("/api/xpot", createLeadsRouter());
  server.use("/api/xpot", createTasksRouter());
  return new Promise((resolve, reject) => {
    const listener = server.listen(0, async () => {
      const { port } = listener.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: view ? { "X-Xpot-View": view } : undefined });
        expect(response.status, path).toBe(200);
        resolve(await response.json());
      } catch (error) {
        reject(error);
      } finally {
        listener.close();
      }
    });
  });
}

/** Whose records each list holds, by person. */
async function lists(person: Person, view: View) {
  const reps = (ids: number[]) => ids.map((id) => nameOfRep.get(id)).sort();
  const [sales, consignments, leads, tasks, summary] = await Promise.all([
    get(person, "/api/xpot/sales", view),
    get(person, "/api/xpot/consignments", view),
    get(person, "/api/xpot/leads", view),
    get(person, "/api/xpot/tasks?all=true", view),
    get(person, "/api/xpot/sales/summary?days=30", view),
  ]);
  return {
    sales: reps(sales.map((row: any) => row.sale.repId)),
    consignments: reps(consignments.map((row: any) => row.consignment.repId)),
    companies: reps(leads.map((lead: any) => lead.ownerRepId)),
    tasks: reps(tasks.map((task: any) => task.repId)),
    summarySales: summary.sales.periodCount,
    summaryShops: summary.consignment.activeCount,
  };
}

const only = (person: Person, count = 1) => ({
  sales: [person], consignments: [person], companies: [person], tasks: [person], summarySales: count, summaryShops: count,
});

describe("a Rep Admin", () => {
  test("with management mode off sees only their own records", async () => {
    expect(await lists("lead", "rep")).toEqual(only("lead"));
  });

  test("calling without the header gets their own records too", async () => {
    expect(await lists("lead", undefined)).toEqual(only("lead"));
  });

  test("in management mode sees their organization's records, never another organization's", async () => {
    const team = ["boss", "lead", "mate"];
    expect(await lists("lead", "manage")).toEqual({
      sales: team, consignments: team, companies: team, tasks: team, summarySales: 3, summaryShops: 3,
    });
  });

  test("asking for their own repId stays personal in management mode (the Dashboard)", async () => {
    const summary = await get("lead", `/api/xpot/sales/summary?days=30&repId=${people.lead.id}`, "manage");
    expect(summary.sales.periodCount).toBe(1);
    expect(summary.consignment.activeCount).toBe(1);
  });

  test("in management mode can open a teammate's consignment, not another organization's", async () => {
    const [mates] = await q(`SELECT id FROM sales_consignments WHERE rep_id = $1`, [people.mate.id]);
    const detail = await get("lead", `/api/xpot/consignments/${mates.id}`, "manage");
    expect(detail.consignment.repId).toBe(people.mate.id);
  });

  test("can't use a manager's organization filter", async () => {
    const companies = await get("lead", `/api/xpot/leads?organizationId=${teamB}`, "manage");
    expect(companies.map((lead: any) => nameOfRep.get(lead.ownerRepId)).sort()).toEqual(["boss", "lead", "mate"]);
  });
});

describe("a plain rep", () => {
  test("can't widen their lists with the management header", async () => {
    expect(await lists("mate", "manage")).toEqual(only("mate"));
    expect(await lists("mate", undefined)).toEqual(only("mate"));
  });

  test("can't open a teammate's consignment", async () => {
    const [leads] = await q(`SELECT id FROM sales_consignments WHERE rep_id = $1`, [people.lead.id]);
    const server = express();
    server.use((req, _res, next) => {
      (req as any).session = { userId: "mate", email: null, firstName: "mate", isAdmin: false };
      next();
    });
    server.use("/api/xpot", createConsignmentsRouter());
    const status = await new Promise<number>((resolve) => {
      const listener = server.listen(0, async () => {
        const { port } = listener.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${port}/api/xpot/consignments/${leads.id}`, { headers: { "X-Xpot-View": "manage" } });
        listener.close();
        resolve(response.status);
      });
    });
    expect(status).toBe(403);
  });
});

describe("a platform manager", () => {
  const everyone = ["boss", "lead", "mate", "outsider"];

  test("in management mode sees everyone, with or without the header (unchanged)", async () => {
    const wide = { sales: everyone, consignments: everyone, companies: everyone, tasks: everyone, summarySales: 4, summaryShops: 4 };
    expect(await lists("boss", "manage")).toEqual(wide);
    expect(await lists("boss", undefined)).toEqual(wide);
  });

  test("with management mode off sees only their own", async () => {
    expect(await lists("boss", "rep")).toEqual(only("boss"));
  });

  test("filters Companies and Sales by one organization in management mode", async () => {
    const companies = await get("boss", `/api/xpot/leads?organizationId=${teamB}`, "manage");
    expect(companies.map((lead: any) => nameOfRep.get(lead.ownerRepId))).toEqual(["outsider"]);
    const sales = await get("boss", `/api/xpot/sales?organizationId=${teamB}`, "manage");
    expect(sales.map((row: any) => nameOfRep.get(row.sale.repId))).toEqual(["outsider"]);
  });

  test("ignores the organization filter with management mode off", async () => {
    const companies = await get("boss", `/api/xpot/leads?organizationId=${teamB}`, "rep");
    expect(companies.map((lead: any) => nameOfRep.get(lead.ownerRepId))).toEqual(["boss"]);
  });
});
