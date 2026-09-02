// Phase 0 — the authorization fixes the audit called for (SEG-01…08, DAT-01).
//
// These are the first route-level tests in the repo. They exercise the real
// Express routers with a mocked storage layer, so what is asserted is the
// handler's own decision — who gets 403, what a rep is allowed to see — rather
// than a re-implementation of it.

import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Storage double ──────────────────────────────────────────────────────────

const store = {
  reps: new Map<number, any>(),
  leads: new Map<number, any>(),
  visits: new Map<number, any>(),
  tasks: [] as any[],
  opportunities: [] as any[],
  contacts: [] as any[],
  repUpdates: [] as { id: number; data: any }[],
  leadUpdates: [] as { id: number; data: any }[],
  upserts: [] as any[],
};

const storage = {
  getSalesRepByUserId: vi.fn(async (userId: string) =>
    [...store.reps.values()].find((r) => r.userId === userId),
  ),
  getSalesRep: vi.fn(async (id: number) => store.reps.get(id)),
  upsertSalesRep: vi.fn(async (input: any) => {
    store.upserts.push(input);
    const existing = [...store.reps.values()].find((r) => r.userId === input.userId);
    const rep = existing ? { ...existing, ...input } : { id: store.reps.size + 100, ...input };
    store.reps.set(rep.id, rep);
    return rep;
  }),
  updateSalesRepFields: vi.fn(async (id: number, data: any) => {
    store.repUpdates.push({ id, data });
    const rep = { ...store.reps.get(id), ...data };
    store.reps.set(id, rep);
    return rep;
  }),
  getSalesLead: vi.fn(async (id: number) => store.leads.get(id)),
  updateSalesLead: vi.fn(async (id: number, data: any) => {
    store.leadUpdates.push({ id, data });
    const lead = { ...store.leads.get(id), ...data };
    store.leads.set(id, lead);
    return lead;
  }),
  getSalesVisit: vi.fn(async (id: number) => store.visits.get(id)),
  createSalesVisit: vi.fn(async (input: any) => ({ id: 900, ...input })),
  getActiveSalesVisitForRep: vi.fn(async () => undefined),
  getSalesAppSettings: vi.fn(async () => ({
    checkInRequiresGps: true,
    defaultGeofenceRadiusMeters: 150,
    allowManualOverride: true,
  })),
  listSalesLeadLocations: vi.fn(async () => []),
  listSalesLeadContacts: vi.fn(async (leadId: number) => store.contacts.filter((c) => c.leadId === leadId)),
  createSalesLeadContact: vi.fn(async (input: any) => ({ id: 1, ...input })),
  listSalesTasks: vi.fn(async (filters: any = {}) =>
    store.tasks.filter((t) => (filters.repId ? t.repId === filters.repId : true)),
  ),
  updateSalesTask: vi.fn(async (id: number, data: any) => ({ id, ...data })),
  listSalesOpportunities: vi.fn(async (filters: any = {}) =>
    store.opportunities.filter((o) => (filters.repId ? o.repId === filters.repId : true)),
  ),
  updateSalesOpportunity: vi.fn(async (id: number, data: any) => ({ id, ...data })),
  listSalesVisits: vi.fn(async () => []),
  listSalesReps: vi.fn(async () => [...store.reps.values()]),
  listSalesSyncEvents: vi.fn(async () => []),
  getIntegrationSettings: vi.fn(async () => undefined),
  listXphereIntegrations: vi.fn(async () => []),
  getXphereIntegrationByUserId: vi.fn(async () => undefined),
  upsertXphereIntegration: vi.fn(async () => ({})),
  listRecentSalesVisits: vi.fn(async () => ({ data: [], total: 0 })),
  createSalesSyncEvent: vi.fn(async () => ({})),
  getSalesVisitNote: vi.fn(async () => undefined),
};

vi.mock("../server/storage.js", () => ({ storage }));
// leads.ts now enriches the list with sales totals; that module reaches db.ts,
// which refuses to load without a database. None of these cases need it.
vi.mock("../server/storage-sales.js", () => ({
  salesStorage: { leadSalesBatch: vi.fn(async () => new Map()) },
}));
vi.mock("../server/integrations/ghl.js", () => ({ getGHLPipelines: vi.fn() }));
vi.mock("../server/routes/xpot/helpers.js", () => ({
  // The sync helpers are fire-and-forget in the handlers; they only need to
  // resolve to the right shape so the route can finish its response.
  syncLeadToGhl: vi.fn(async () => ({ synced: false, message: "GHL not configured" })),
  syncLeadToXphere: vi.fn(async () => ({ synced: false })),
  syncVisitToGhl: vi.fn(async () => ({ synced: false })),
  syncVisitToXphere: vi.fn(async () => ({ synced: false })),
  syncTaskToGhl: vi.fn(async () => ({ synced: false })),
  syncOpportunityToGhl: vi.fn(async () => ({ synced: false, message: "GHL not configured" })),
  analyzeVisitTranscript: vi.fn(async () => null),
  getDistanceMeters: () => 0,
}));

const { createTasksRouter } = await import("../server/routes/xpot/tasks.js");
const { createOpportunitiesRouter } = await import("../server/routes/xpot/opportunities.js");
const { createLeadsRouter } = await import("../server/routes/xpot/leads.js");
const { createVisitsRouter } = await import("../server/routes/xpot/visits.js");
const { createAdminRouter } = await import("../server/routes/xpot/admin.js");
const { ensureXpotRep } = await import("../server/routes/xpot/middleware.js");

// ─── Harness ─────────────────────────────────────────────────────────────────

const REP_A = { id: 1, userId: "user-a", displayName: "Rep A", role: "rep", isActive: true };
const REP_B = { id: 2, userId: "user-b", displayName: "Rep B", role: "rep", isActive: true };
const MANAGER = { id: 3, userId: "user-m", displayName: "Manager", role: "manager", isActive: true };

/** Mount a router behind a fake session for the given user. */
function appFor(router: express.Router, userId: string, isAdmin = false) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, isAdmin };
    next();
  });
  app.use(router);
  return app;
}

type Res = { status: number; body: any };

function request(app: express.Express, method: string, path: string, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        resolve({ status: res.status, body: text ? JSON.parse(text) : null });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

beforeEach(() => {
  store.reps = new Map([[1, { ...REP_A }], [2, { ...REP_B }], [3, { ...MANAGER }]]);
  store.leads = new Map([
    [10, { id: 10, name: "A's lead", ownerRepId: 1, status: "lead" }],
    [20, { id: 20, name: "B's lead", ownerRepId: 2, status: "prospect" }],
  ]);
  store.visits = new Map();
  store.tasks = [
    { id: 100, repId: 1, leadId: 10, title: "A's task", status: "pending" },
    { id: 200, repId: 2, leadId: 20, title: "B's task", status: "pending" },
  ];
  store.opportunities = [
    { id: 300, repId: 1, leadId: 10, title: "A's deal", status: "open" },
    { id: 400, repId: 2, leadId: 20, title: "B's deal", status: "open" },
  ];
  store.contacts = [{ id: 1, leadId: 20, name: "B's contact" }];
  store.repUpdates = [];
  store.leadUpdates = [];
  store.upserts = [];
});

// ─── SEG-01 ──────────────────────────────────────────────────────────────────

describe("SEG-01 — a new account does not get live access on its own", () => {
  it("provisions a dormant rep for an unknown non-admin user", async () => {
    const req: any = { session: { userId: "brand-new", email: "new@x.test", isAdmin: false } };
    const actor = await ensureXpotRep(req);
    expect(actor!.rep.isActive).toBe(false);
    expect(store.upserts.at(-1)).toMatchObject({ isActive: false, role: "rep" });
  });

  it("trusts a platform admin — they are who would approve the others", async () => {
    const req: any = { session: { userId: "the-admin", email: "admin@x.test", isAdmin: true } };
    const actor = await ensureXpotRep(req);
    expect(actor!.rep.isActive).toBe(true);
    expect(actor!.rep.role).toBe("admin");
  });

  it("leaves an already-active rep alone", async () => {
    const req: any = { session: { userId: "user-a", email: "a@x.test", isAdmin: false } };
    const actor = await ensureXpotRep(req);
    expect(actor!.rep.isActive).toBe(true);
    expect(store.upserts).toHaveLength(0);
  });
});

// ─── SEG-02 / SEG-03 ─────────────────────────────────────────────────────────

describe("SEG-02 — a rep cannot edit another rep's task", () => {
  const router = createTasksRouter();

  it("rejects a cross-rep edit with 403", async () => {
    const res = await request(appFor(router, "user-a"), "PATCH", "/tasks/200", { status: "completed" });
    expect(res.status).toBe(403);
    expect(storage.updateSalesTask).not.toHaveBeenCalled();
  });

  it("allows a rep to edit their own task", async () => {
    const res = await request(appFor(router, "user-a"), "PATCH", "/tasks/100", { status: "completed" });
    expect(res.status).toBe(200);
    expect(storage.updateSalesTask).toHaveBeenCalledWith(100, expect.objectContaining({ status: "completed" }));
  });

  it("lets a manager edit any task", async () => {
    const res = await request(appFor(router, "user-m"), "PATCH", "/tasks/100", { status: "completed" });
    expect(res.status).toBe(200);
  });

  it("404s an unknown task instead of silently patching nothing", async () => {
    const res = await request(appFor(router, "user-a"), "PATCH", "/tasks/999", { status: "completed" });
    expect(res.status).toBe(404);
  });
});

describe("SEG-03 — a rep cannot edit another rep's opportunity", () => {
  const router = createOpportunitiesRouter();

  it("rejects the cross-rep edit before it can reach the CRM", async () => {
    const res = await request(appFor(router, "user-a"), "PATCH", "/opportunities/400", { value: 1 });
    expect(res.status).toBe(403);
    expect(storage.updateSalesOpportunity).not.toHaveBeenCalled();
  });

  it("allows a rep to edit their own", async () => {
    const res = await request(appFor(router, "user-a"), "PATCH", "/opportunities/300", { value: 5000 });
    expect(res.status).toBe(200);
  });
});

// ─── SEG-04 / SEG-06 ─────────────────────────────────────────────────────────

describe("SEG-04 — lead contacts are behind the same ownership rule", () => {
  const router = createLeadsRouter();

  it("refuses to list contacts on someone else's lead", async () => {
    const res = await request(appFor(router, "user-a"), "GET", "/leads/20/contacts");
    expect(res.status).toBe(403);
  });

  it("refuses to inject a contact into someone else's lead", async () => {
    const res = await request(appFor(router, "user-a"), "POST", "/leads/20/contacts", { name: "Injected" });
    expect(res.status).toBe(403);
    expect(storage.createSalesLeadContact).not.toHaveBeenCalled();
  });

  it("still serves the owner", async () => {
    const res = await request(appFor(router, "user-b"), "GET", "/leads/20/contacts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("SEG-06 — lead detail is scoped to the caller", () => {
  const router = createLeadsRouter();

  it("a rep sees only their own tasks and deals on their lead", async () => {
    const res = await request(appFor(router, "user-a"), "GET", "/leads/10");
    expect(res.status).toBe(200);
    expect(storage.listSalesOpportunities).toHaveBeenCalledWith(expect.objectContaining({ repId: 1 }));
    expect(storage.listSalesTasks).toHaveBeenCalledWith(expect.objectContaining({ repId: 1 }));
  });

  it("a manager sees everything on the lead", async () => {
    const res = await request(appFor(router, "user-m"), "GET", "/leads/10");
    expect(res.status).toBe(200);
    expect(storage.listSalesOpportunities).toHaveBeenCalledWith(expect.objectContaining({ repId: undefined }));
  });
});

// ─── SEG-05 ──────────────────────────────────────────────────────────────────

describe("SEG-05 — check-in is refused on another rep's lead", () => {
  const router = createVisitsRouter();

  it("403s, and does not touch the other rep's pipeline", async () => {
    const res = await request(appFor(router, "user-a"), "POST", "/visits/check-in", { leadId: 20 });
    expect(res.status).toBe(403);
    expect(storage.createSalesVisit).not.toHaveBeenCalled();
    expect(store.leadUpdates).toHaveLength(0);
  });

  it("allows check-in on the rep's own lead", async () => {
    const res = await request(appFor(router, "user-a"), "POST", "/visits/check-in", { leadId: 10 });
    expect(res.status).toBe(201);
  });

  it("DAT-04 — promotion and last-visit land in a single update", async () => {
    await request(appFor(router, "user-b"), "POST", "/visits/check-in", { leadId: 20 });
    expect(store.leadUpdates).toHaveLength(1);
    expect(store.leadUpdates[0].data).toMatchObject({ status: "lead" });
    expect(store.leadUpdates[0].data.lastVisitAt).toBeTruthy();
  });
});

// ─── SEG-07 ──────────────────────────────────────────────────────────────────

describe("SEG-07 — a manager cannot escalate through the reps endpoint", () => {
  const router = createAdminRouter();

  it("refuses to overwrite an existing rep via POST", async () => {
    const res = await request(appFor(router, "user-m"), "POST", "/admin/reps", {
      userId: "user-m", displayName: "Manager", role: "admin",
    });
    expect(res.status).toBe(409);
    expect(store.reps.get(3).role).toBe("manager");
  });

  it("refuses to create a manager/admin when the caller is only a manager", async () => {
    const res = await request(appFor(router, "user-m"), "POST", "/admin/reps", {
      userId: "someone-new", displayName: "New", role: "admin",
    });
    expect(res.status).toBe(403);
  });

  it("refuses a role change by a manager on PATCH", async () => {
    const res = await request(appFor(router, "user-m"), "PATCH", "/admin/reps/1", { role: "admin" });
    expect(res.status).toBe(403);
    expect(store.repUpdates).toHaveLength(0);
  });

  it("refuses self-promotion even for an admin", async () => {
    const res = await request(appFor(router, "user-m", true), "PATCH", "/admin/reps/3", { role: "admin" });
    expect(res.status).toBe(400);
  });

  it("refuses self-deactivation, which would lock the panel", async () => {
    const res = await request(appFor(router, "user-m", true), "PATCH", "/admin/reps/3", { isActive: false });
    expect(res.status).toBe(400);
  });

  it("lets a manager activate a dormant rep — the SEG-01 approval path", async () => {
    store.reps.set(4, { id: 4, userId: "user-new", displayName: "New", role: "rep", isActive: false });
    const res = await request(appFor(router, "user-m"), "PATCH", "/admin/reps/4", { isActive: true });
    expect(res.status).toBe(200);
    expect(store.repUpdates).toContainEqual({ id: 4, data: { isActive: true } });
  });

  it("lets a platform admin change someone else's role", async () => {
    const res = await request(appFor(router, "user-m", true), "PATCH", "/admin/reps/1", { role: "manager" });
    expect(res.status).toBe(200);
    expect(store.reps.get(1).role).toBe("manager");
  });
});

// ─── SEG-08 ──────────────────────────────────────────────────────────────────

describe("SEG-08 — one rule for who sees everything", () => {
  it("a role=manager rep sees all tasks with ?all=true, like they do for leads", async () => {
    const res = await request(appFor(createTasksRouter(), "user-m"), "GET", "/tasks?all=true");
    expect(res.status).toBe(200);
    expect(storage.listSalesTasks).toHaveBeenCalledWith(expect.objectContaining({ repId: undefined }));
  });

  it("a plain rep is still scoped to their own, ?all=true or not", async () => {
    const res = await request(appFor(createTasksRouter(), "user-a"), "GET", "/tasks?all=true");
    expect(res.status).toBe(200);
    expect(storage.listSalesTasks).toHaveBeenCalledWith(expect.objectContaining({ repId: 1 }));
  });

  it("the same rule governs opportunities", async () => {
    await request(appFor(createOpportunitiesRouter(), "user-m"), "GET", "/opportunities?all=true");
    expect(storage.listSalesOpportunities).toHaveBeenCalledWith(expect.objectContaining({ repId: undefined }));
  });
});
