// The Xpot → Xphere CRM mirror: what each sale and each interest sends.
//
// These pin the payload of POST /api/v1/sync as Xpot builds it — the per-sale
// opportunity key, the interest-to-sale conversion, the note with the items —
// against a mocked storage and database. The receiving side is pinned in the
// xphere repo by tests/crm-mirror-xpot.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSale = vi.fn();
const getSalesLead = vi.fn();
const getSalesRep = vi.fn();
const getXphereIntegrationByUserId = vi.fn();
const createSalesSyncEvent = vi.fn(async () => ({}));

vi.mock("../server/storage-sales.js", () => ({ salesStorage: { getSale } }));
vi.mock("../server/storage.js", () => ({
  storage: { getSalesLead, getSalesRep, getXphereIntegrationByUserId, createSalesSyncEvent },
}));

// A drizzle stand-in: every chain resolves to whatever the test queued next.
const dbResults: unknown[][] = [];
vi.mock("../server/db.js", () => {
  const chain = (): any => {
    const q: any = {};
    for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve(dbResults.shift() ?? []);
    return q;
  };
  return { db: { select: () => chain() } };
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { syncSaleToXphere, syncInterestToXphere } = await import("../server/routes/xpot/xphere-sync.js");

const lead = { id: 42, name: "Barbearia do Zé", ownerRepId: 10, phone: "+13055550100", email: null, industry: "barber", website: null };
const tenant = () => {
  getSalesLead.mockResolvedValue(lead);
  getSalesRep.mockResolvedValue({ id: 10, userId: "user-1" });
  getXphereIntegrationByUserId.mockResolvedValue({ isEnabled: true, apiKey: "xph_test", apiUrl: "https://xphere.app" });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
};
const body = () => JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
});

describe("a sale is its own won opportunity", () => {
  it("keys the opportunity on the sale, carries the sale's value, lists the items in the note", async () => {
    tenant();
    getSale.mockResolvedValue({
      sale: { id: 7, leadId: 42, status: "completed", kind: "direct", totalCents: 60000, currency: "USD", paymentStatus: "paid", notes: null },
      items: [{ quantity: 1, description: "Landing Page Website", totalCents: 60000 }],
      lead: { id: 42, name: lead.name },
    });
    dbResults.push([{ addressLine1: "Rua A, 1" }]); // locations
    dbResults.push([]);                              // sync events: no interest pending

    const result = await syncSaleToXphere(7);

    expect(result).toEqual({ synced: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://xphere.app/api/v1/sync");
    const b = body();
    expect(b.source).toBe("xpot");
    expect(b.company).toMatchObject({ id: "42", name: "Barbearia do Zé", address: "Rua A, 1" });
    expect(b.opportunity).toMatchObject({
      pipeline: "Xpot Field Sales", external_id: "sale-7", stage: "Customer", status: "won", value: 600, currency: "USD",
    });
    expect(b.opportunity.title).toBe("Barbearia do Zé — 1× Landing Page Website");
    expect(b.note.content).toContain("1 × Landing Page Website — $600.00");
    expect(createSalesSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: "xphere", entityType: "sales_sale", entityId: "7", status: "synced",
      payload: expect.objectContaining({ convertedInterest: false }),
    }));
  });

  it("the first sale after an interest converts that opportunity instead of opening another", async () => {
    tenant();
    getSale.mockResolvedValue({
      sale: { id: 8, leadId: 42, status: "completed", kind: "direct", totalCents: 60000, currency: "USD", paymentStatus: "paid", notes: null },
      items: [{ quantity: 1, description: "site", totalCents: 60000 }],
      lead: null,
    });
    dbResults.push([]); // locations
    dbResults.push([   // sync events: an interest was mirrored, nothing converted it yet
      { entityType: "sales_lead", payload: { leadId: 42, interest: "site" } },
    ]);

    await syncSaleToXphere(8);

    expect(body().opportunity.external_id).toBe("lead-42-interest");
    expect(createSalesSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ convertedInterest: true }),
    }));
  });

  it("a second sale after the conversion gets its own key", async () => {
    tenant();
    getSale.mockResolvedValue({
      sale: { id: 9, leadId: 42, status: "completed", kind: "consignment_settlement", totalCents: 5000, currency: "USD", paymentStatus: "paid", notes: null },
      items: [{ quantity: 10, description: "3D Printed Keychain", totalCents: 5000 }],
      lead: null,
    });
    dbResults.push([]);
    dbResults.push([
      { entityType: "sales_lead", payload: { leadId: 42, interest: "site" } },
      { entityType: "sales_sale", payload: { leadId: 42, convertedInterest: true } },
    ]);

    await syncSaleToXphere(9);

    expect(body().opportunity.external_id).toBe("sale-9");
    expect(body().note.title).toBe("Consignment settlement");
  });

  it("a cancelled sale is not mirrored", async () => {
    getSale.mockResolvedValue({ sale: { id: 1, status: "cancelled" }, items: [], lead: null });
    expect(await syncSaleToXphere(1)).toEqual({ synced: false, message: "Sale is cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records the failure with the upstream reason so the dashboard can retry it", async () => {
    tenant();
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "no_pipeline" });
    getSale.mockResolvedValue({
      sale: { id: 3, leadId: 42, status: "completed", kind: "direct", totalCents: 100, currency: "USD", paymentStatus: "paid", notes: null },
      items: [], lead: null,
    });
    dbResults.push([]); dbResults.push([]);

    const result = await syncSaleToXphere(3);

    expect(result.synced).toBe(false);
    expect(createSalesSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed", lastError: expect.stringContaining("422"),
    }));
  });
});

describe("interest opens one deal per lead", () => {
  it("keys on the lead so the eventual sale can take it over", async () => {
    tenant();
    dbResults.push([{ totalCents: 0, count: 0, currency: "USD" }]); // lifetime: not a customer
    dbResults.push([]);                                              // locations

    await syncInterestToXphere({ leadId: 42, title: "Come back about the site", interest: "site", dueAt: new Date("2026-09-08T00:00:00Z"), evidence: "pediu pra voltar" });

    const b = body();
    expect(b.event).toBe("interest.recorded");
    expect(b.opportunity).toMatchObject({ external_id: "lead-42-interest", stage: "Interested", status: "open", value: 0 });
    expect(b.note.content).toContain("Interested in: site");
    expect(b.note.content).toContain("Come back by 2026-09-08");
  });

  it("an existing customer showing new interest gets a fresh deal, not their old one reopened", async () => {
    tenant();
    dbResults.push([{ totalCents: 60000, count: 1, currency: "USD" }]); // already bought
    dbResults.push([]);

    await syncInterestToXphere({ leadId: 42, title: "Wants ads too", interest: "ads" });

    const key = body().opportunity.external_id as string;
    expect(key.startsWith("lead-42-interest-")).toBe(true);
    expect(key).not.toBe("lead-42-interest");
  });
});
