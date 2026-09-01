// Pushing Xpot's field activity into the Xphere CRM.
//
// Xphere exposes POST /api/v1/sync — the generic mirror every sibling app
// (Xtimator, XmartMenu, Xkedule) uses to project one of its tenants into the
// caller org's CRM as Account + Contact + Opportunity + Note.
//
// ── A constraint worth knowing before reading further ────────────────────────
// runCrmMirror dedups the opportunity on (org_id, external_source, external_id),
// and the route passes company.id as BOTH the account key and the opportunity
// key. One company therefore gets exactly ONE opportunity per source, forever.
// That fits the app it was written for (Xtimator: one subscription lifecycle per
// customer). It does not fit "every sale is its own deal": a second sale to the
// same barbershop would overwrite the first, and using a per-sale id instead
// would create a duplicate ACCOUNT for every sale, which is worse.
//
// So, with the contract as it stands today, this module mirrors the RELATIONSHIP
// and not the individual deal:
//   • one opportunity per shop, carrying the running total and won once they buy
//   • one note per sale or settlement, with the itemised detail — notes are not
//     deduped upstream, so the timeline keeps every one of them
// Per-sale opportunities need a small additive change on the Xphere side
// (accepting an opportunity-level external_id); until then this is the honest
// projection rather than a lossy one.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import { salesStorage } from "../../storage-sales.js";
import { salesSales, salesSaleItems, salesLeadLocations } from "#shared/schema.js";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);

type Outcome = { synced: boolean; message?: string };

async function tenantFor(leadId: number) {
  const lead = await storage.getSalesLead(leadId);
  if (!lead) return { error: "Lead not found" as const };
  if (!lead.ownerRepId) return { error: "Lead has no owner" as const };
  const rep = await storage.getSalesRep(lead.ownerRepId);
  if (!rep) return { error: "Owner rep not found" as const };
  const integration = await storage.getXphereIntegrationByUserId(rep.userId);
  if (!integration?.isEnabled || !integration.apiKey) {
    return { error: "Xphere not configured" as const };
  }
  return {
    lead,
    apiUrl: (integration.apiUrl || "https://xphere.app").replace(/\/$/, ""),
    apiKey: integration.apiKey,
  };
}

/** Lifetime figures — the mirrored opportunity carries the relationship, not one deal. */
async function lifetimeFor(leadId: number) {
  const [row] = await db
    .select({
      totalCents: sql<number>`coalesce(sum(${salesSales.totalCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
      currency: sql<string>`coalesce(max(${salesSales.currency}), 'USD')`,
    })
    .from(salesSales)
    .where(and(eq(salesSales.leadId, leadId), eq(salesSales.status, "completed")));
  return { totalCents: row?.totalCents ?? 0, count: row?.count ?? 0, currency: row?.currency ?? "USD" };
}

async function postMirror(
  apiUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const res = await fetch(`${apiUrl}/api/v1/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, message: `Xphere HTTP ${res.status}: ${detail}`.slice(0, 500) };
  }
  return { ok: true, data: await res.json().catch(() => ({})) };
}

/**
 * Mirror a completed sale. The shop becomes an Account, the relationship an
 * Opportunity in a "Xpot Field Sales" pipeline, and this sale a Note on the
 * timeline with what was sold.
 */
export async function syncSaleToXphere(saleId: number): Promise<Outcome> {
  const sale = await salesStorage.getSale(saleId);
  if (!sale) return { synced: false, message: "Sale not found" };
  if (sale.sale.status !== "completed") return { synced: false, message: "Sale is cancelled" };

  const tenant = await tenantFor(sale.sale.leadId);
  if ("error" in tenant) return { synced: false, message: tenant.error };
  const { lead, apiUrl, apiKey } = tenant;

  const [lifetime, locations] = await Promise.all([
    lifetimeFor(lead.id),
    db.select().from(salesLeadLocations).where(eq(salesLeadLocations.leadId, lead.id)).limit(1),
  ]);

  const lines = sale.items
    .map((i) => `• ${i.quantity} × ${i.description} — ${money(i.totalCents, sale.sale.currency)}`)
    .join("\n");
  const kind = sale.sale.kind === "consignment_settlement" ? "Consignment settlement" : "Sale";
  const content = [
    `${kind} — ${money(sale.sale.totalCents, sale.sale.currency)} (${sale.sale.paymentStatus})`,
    lines,
    sale.sale.notes ? `\n${sale.sale.notes}` : null,
  ].filter(Boolean).join("\n");

  const result = await postMirror(apiUrl, apiKey, {
    source: "xpot",
    event: "sale.completed",
    // Event time, not the sale's backdated timestamp: the mirror uses this to
    // order events and would treat an older value as stale.
    occurred_at: new Date().toISOString(),
    company: {
      id: String(lead.id),
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      industry: lead.industry ?? null,
      website: lead.website ?? null,
      address: locations[0]?.addressLine1 ?? null,
    },
    opportunity: {
      pipeline: "Xpot Field Sales",
      // A shop that has bought is won. The value is the running total, because
      // upstream keeps one opportunity per company (see the header note).
      stage: "Customer",
      status: "won",
      value: lifetime.totalCents / 100,
      currency: sale.sale.currency,
      title: `${lead.name} — Field sales`,
    },
    note: { title: kind, content, dedup_id: `xpot-sale-${sale.sale.id}` },
  });

  await storage.createSalesSyncEvent({
    provider: "xphere",
    entityType: "sales_sale",
    entityId: String(saleId),
    status: result.ok ? "synced" : "failed",
    payload: { leadId: lead.id, totalCents: sale.sale.totalCents },
    lastError: result.ok ? null : result.message,
    lastAttemptAt: new Date(),
  });

  return result.ok ? { synced: true } : { synced: false, message: result.message };
}

/**
 * Mirror interest that has not closed — "he wants to know more about the site,
 * come back next week". An open opportunity plus a note, so it lands in the
 * pipeline rather than only in Xpot's task list.
 */
export async function syncInterestToXphere(input: {
  leadId: number;
  title: string;
  interest?: string | null;
  estimatedValueCents?: number | null;
  dueAt?: Date | null;
  evidence?: string | null;
}): Promise<Outcome> {
  const tenant = await tenantFor(input.leadId);
  if ("error" in tenant) return { synced: false, message: tenant.error };
  const { lead, apiUrl, apiKey } = tenant;

  const lifetime = await lifetimeFor(lead.id);
  const alreadyCustomer = lifetime.count > 0;
  const locations = await db.select().from(salesLeadLocations).where(eq(salesLeadLocations.leadId, lead.id)).limit(1);

  const content = [
    input.interest ? `Interested in: ${input.interest}` : null,
    input.dueAt ? `Come back by ${input.dueAt.toISOString().slice(0, 10)}` : null,
    input.evidence ? `\n"${input.evidence}"` : null,
  ].filter(Boolean).join("\n") || input.title;

  const result = await postMirror(apiUrl, apiKey, {
    source: "xpot",
    event: "interest.recorded",
    occurred_at: new Date().toISOString(),
    company: {
      id: String(lead.id),
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      industry: lead.industry ?? null,
      website: lead.website ?? null,
      address: locations[0]?.addressLine1 ?? null,
    },
    opportunity: {
      pipeline: "Xpot Field Sales",
      // Never walk a paying customer back to Interested.
      stage: alreadyCustomer ? "Customer" : "Interested",
      status: alreadyCustomer ? "won" : "open",
      value: (alreadyCustomer ? lifetime.totalCents : (input.estimatedValueCents ?? 0)) / 100,
      currency: lifetime.currency,
      title: `${lead.name} — Field sales`,
    },
    note: { title: "Field visit — interest", content },
  });

  await storage.createSalesSyncEvent({
    provider: "xphere",
    entityType: "sales_lead",
    entityId: String(lead.id),
    status: result.ok ? "synced" : "failed",
    payload: { interest: input.interest ?? null },
    lastError: result.ok ? null : result.message,
    lastAttemptAt: new Date(),
  });

  return result.ok ? { synced: true } : { synced: false, message: result.message };
}
