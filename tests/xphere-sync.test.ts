// Contract tests for the Xpot → Xphere sync boundary (server/routes/xpot/helpers.ts).
//
// syncLeadToXphere() and syncVisitToXphere() are fire-and-forget: a request
// or response-shape drift on Xphere's side fails silently in production
// (visible only in sales_sync_events). These tests pin the exact payloads
// sent to, and responses expected from, Xphere's POST /api/v1/prospects and
// POST /api/integrations/xpot/visits — mirrored in the xphere repo by
// tests/xpot-integration-contract.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSalesLead = vi.fn();
const getSalesRep = vi.fn();
const getXphereIntegrationByUserId = vi.fn();
const updateSalesLead = vi.fn();
const createSalesSyncEvent = vi.fn();
const getSalesVisit = vi.fn();
const getSalesVisitNote = vi.fn();

vi.mock("../server/storage.js", () => ({
  storage: {
    getSalesLead,
    getSalesRep,
    getXphereIntegrationByUserId,
    updateSalesLead,
    createSalesSyncEvent,
    getSalesVisit,
    getSalesVisitNote,
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { syncLeadToXphere, syncVisitToXphere } = await import("../server/routes/xpot/helpers.js");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("syncLeadToXphere", () => {
  it("skips leads that originated from Xphere to avoid an echo loop", async () => {
    getSalesLead.mockResolvedValue({ id: 1, source: "xphere" });

    const result = await syncLeadToXphere(1);

    expect(result).toEqual({ synced: false, message: "xphere source — skip to prevent loop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when the owner rep has no enabled Xphere integration", async () => {
    getSalesLead.mockResolvedValue({ id: 2, source: "field", ownerRepId: 10 });
    getSalesRep.mockResolvedValue({ id: 10, userId: "user-1" });
    getXphereIntegrationByUserId.mockResolvedValue({ isEnabled: false, apiKey: "xph_test" });

    const result = await syncLeadToXphere(2);

    expect(result).toEqual({ synced: false, message: "Xphere not configured or disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the exact payload Xphere's POST /api/v1/prospects expects, as a company-kind prospect, and stores the returned account ref", async () => {
    getSalesLead.mockResolvedValue({
      id: 3,
      source: "field",
      ownerRepId: 10,
      name: "Acme Roofing",
      email: "jane@acmeroofing.com",
      phone: "+13055550100",
      legalName: "Acme Roofing LLC",
      industry: "Roofing",
    });
    getSalesRep.mockResolvedValue({ id: 10, userId: "user-1" });
    getXphereIntegrationByUserId.mockResolvedValue({
      isEnabled: true,
      apiKey: "xph_test",
      apiUrl: "https://xphere.app",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        source_id: "run-1",
        total: 1,
        created: 1,
        updated: 0,
        skipped: 0,
        results: [{ id: "account-new-1", kind: "company", action: "created" }],
      }),
    });

    const result = await syncLeadToXphere(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://xphere.app/api/v1/prospects",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer xph_test" },
        body: JSON.stringify({
          source: { type: "xpot" },
          prospects: [
            {
              kind: "company",
              name: "Acme Roofing",
              phone: "+13055550100",
              source_id: "3",
              custom_fields: {
                email: "jane@acmeroofing.com",
                legal_name: "Acme Roofing LLC",
                industry: "Roofing",
              },
            },
          ],
        }),
      }),
    );
    expect(updateSalesLead).toHaveBeenCalledWith(3, { xphereRef: "account:account-new-1" });
    expect(createSalesSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "sales_lead", entityId: "3", status: "synced" }),
    );
    expect(result).toEqual({ synced: true });
  });

  it("logs a failed sync event and never throws when Xphere responds with an error", async () => {
    getSalesLead.mockResolvedValue({ id: 4, source: "field", ownerRepId: 10, name: "Jane" });
    getSalesRep.mockResolvedValue({ id: 10, userId: "user-1" });
    getXphereIntegrationByUserId.mockResolvedValue({
      isEnabled: true,
      apiKey: "xph_test",
      apiUrl: "https://xphere.app",
    });
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => "Invalid or revoked API key" });

    const result = await syncLeadToXphere(4);

    expect(result).toEqual({ synced: false, message: "Xphere HTTP 401" });
    expect(createSalesSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "sales_lead", entityId: "4", status: "failed" }),
    );
    expect(updateSalesLead).not.toHaveBeenCalled();
  });
});

describe("syncVisitToXphere", () => {
  it("skips visits whose lead has no Xphere ref", async () => {
    getSalesVisit.mockResolvedValue({ id: 1, leadId: 5 });
    getSalesLead.mockResolvedValue({ id: 5, xphereRef: null });

    const result = await syncVisitToXphere(1);

    expect(result).toEqual({ synced: false, message: "Lead has no Xphere ref" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("splits the stored contact:{id} ref into xphere_id/xphere_kind on the outbound payload", async () => {
    getSalesVisit.mockResolvedValue({ id: 2, leadId: 6, checkedOutAt: "2026-07-01T18:30:00.000Z" });
    getSalesLead.mockResolvedValue({ id: 6, ownerRepId: 10, xphereRef: "contact:contact-1" });
    getSalesRep.mockResolvedValue({ id: 10, userId: "user-1" });
    getXphereIntegrationByUserId.mockResolvedValue({
      isEnabled: true,
      apiKey: "xph_test",
      apiUrl: "https://xphere.app",
    });
    getSalesVisitNote.mockResolvedValue({ outcome: "interested", summary: "Follow up next week", sentiment: "positive" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    const result = await syncVisitToXphere(2);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://xphere.app/api/integrations/xpot/visits",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer xph_test" },
        body: JSON.stringify({
          xphere_id: "contact-1",
          xphere_kind: "contact",
          outcome: "interested",
          summary: "Follow up next week",
          sentiment: "positive",
          occurred_at: "2026-07-01T18:30:00.000Z",
        }),
      }),
    );
    expect(result).toEqual({ synced: true });
  });
});
