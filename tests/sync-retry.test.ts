// POST /sync/retry for a sales_lead.
//
// A lead goes to Xphere when it is created and to GHL on a flush, and a failure
// of either lands in sales_sync_events as "sales_lead". The retry used to call
// only GHL, so a lead whose Xphere push failed (e.g. the key lacked
// prospects:write) could never be re-sent. These tests pin that the retry sends
// the lead to whichever side it hasn't reached yet, and nowhere else.

import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  reps: new Map<number, any>(),
  leads: new Map<number, any>(),
};

const storage = {
  getSalesRepByUserId: vi.fn(async (userId: string) =>
    [...store.reps.values()].find((r) => r.userId === userId),
  ),
  getSalesLead: vi.fn(async (id: number) => store.leads.get(id)),
};

vi.mock("../server/storage.js", () => ({ storage }));
vi.mock("../server/storage-sales.js", () => ({ salesStorage: { getSale: vi.fn() } }));
vi.mock("../server/routes/xpot/xphere-sync.js", () => ({ syncSaleToXphere: vi.fn() }));

const helpers = {
  syncLeadToGhl: vi.fn(async () => ({ synced: true })),
  syncLeadToXphere: vi.fn(async () => ({ synced: true })),
  syncVisitToGhl: vi.fn(async () => ({ synced: true })),
  syncTaskToGhl: vi.fn(async () => ({ synced: true })),
  syncOpportunityToGhl: vi.fn(async () => ({ synced: true })),
};
vi.mock("../server/routes/xpot/helpers.js", () => helpers);

const { createSyncRouter } = await import("../server/routes/xpot/sync.js");

const REP_A = { id: 1, userId: "user-a", displayName: "Rep A", role: "rep", isActive: true };
const REP_B = { id: 2, userId: "user-b", displayName: "Rep B", role: "rep", isActive: true };

function appFor(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, isAdmin: false };
    next();
  });
  app.use(createSyncRouter());
  return app;
}

function retry(userId: string, entityId: number): Promise<{ status: number; body: any }> {
  const app = appFor(userId);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${port}/sync/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "sales_lead", entityId: String(entityId) }),
        });
        resolve({ status: res.status, body: await res.json() });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.reps = new Map([[1, { ...REP_A }], [2, { ...REP_B }]]);
  store.leads = new Map([
    [10, { id: 10, ownerRepId: 1, xphereRef: null, ghlContactId: null }],
    [11, { id: 11, ownerRepId: 1, xphereRef: "account:abc", ghlContactId: null }],
    [12, { id: 12, ownerRepId: 1, xphereRef: null, ghlContactId: "ghl-1" }],
    [13, { id: 13, ownerRepId: 1, xphereRef: "account:abc", ghlContactId: "ghl-1" }],
    [20, { id: 20, ownerRepId: 2, xphereRef: null, ghlContactId: null }],
  ]);
});

describe("POST /sync/retry — sales_lead", () => {
  it("re-sends to both Xphere and GHL when the lead reached neither", async () => {
    const res = await retry("user-a", 10);
    expect(res.status).toBe(200);
    expect(helpers.syncLeadToXphere).toHaveBeenCalledWith(10);
    expect(helpers.syncLeadToGhl).toHaveBeenCalledWith(10);
    expect(res.body).toEqual({ synced: true, results: [{ synced: true }, { synced: true }] });
  });

  it("skips Xphere once the lead has an xphereRef", async () => {
    await retry("user-a", 11);
    expect(helpers.syncLeadToXphere).not.toHaveBeenCalled();
    expect(helpers.syncLeadToGhl).toHaveBeenCalledWith(11);
  });

  it("re-sends only to Xphere when GHL already has the contact", async () => {
    await retry("user-a", 12);
    expect(helpers.syncLeadToXphere).toHaveBeenCalledWith(12);
    expect(helpers.syncLeadToGhl).not.toHaveBeenCalled();
  });

  it("does nothing for a lead that already landed on both sides", async () => {
    const res = await retry("user-a", 13);
    expect(helpers.syncLeadToXphere).not.toHaveBeenCalled();
    expect(helpers.syncLeadToGhl).not.toHaveBeenCalled();
    expect(res.body).toEqual({ synced: true, results: [] });
  });

  it("reports synced:false when either side fails", async () => {
    helpers.syncLeadToXphere.mockResolvedValueOnce({ synced: false, message: "Xphere HTTP 403" } as any);
    const res = await retry("user-a", 10);
    expect(res.body.synced).toBe(false);
    expect(res.body.results[0]).toEqual({ synced: false, message: "Xphere HTTP 403" });
  });

  it("rejects a rep retrying another rep's lead", async () => {
    const res = await retry("user-a", 20);
    expect(res.status).toBe(403);
    expect(helpers.syncLeadToXphere).not.toHaveBeenCalled();
    expect(helpers.syncLeadToGhl).not.toHaveBeenCalled();
  });
});
