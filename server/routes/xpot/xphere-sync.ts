// Pushing Xpot's field activity into the Xphere CRM.
//
// Xphere exposes POST /api/v1/sync — the generic mirror every sibling app
// (Xtimator, XmartMenu, Xkedule) uses to project one of its tenants into the
// caller org's CRM as Account + Contact + Opportunity + Note.
//
// ── One opportunity per sale ──────────────────────────────────────────────────
// runCrmMirror originally keyed the opportunity on company.id, so a company had
// exactly one deal per source — the Xtimator shape. The Xphere branch
// claude/xpot-mirror-per-sale adds an optional opportunity.external_id; with it
// each field sale is its own won opportunity under the same account. Until that
// ships, Xphere's schema strips the unknown key and this degrades to the old
// one-per-company behaviour rather than failing.
//
// Interest converts. "He wants to know more, come back next week" opens ONE
// opportunity per lead (key lead-<id>-interest). The first sale to that lead
// takes over that same key — Interested → Customer, open → won — so the pipeline
// shows one deal that progressed, not an abandoned open one beside a won one.
// Later sales get their own key (sale-<id>).

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { storage } from "../../storage.js";
import { salesStorage } from "../../storage-sales.js";
import { salesSales, salesSaleItems, salesLeadLocations, salesSyncEvents } from "#shared/schema.js";

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

/** Lifetime figures, for the interest opportunity's value and the customer check. */
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

const interestKey = (leadId: number) => `lead-${leadId}-interest`

/**
 * True when an interest opportunity was mirrored for this lead and no sale has
 * converted it yet — the first sale then takes its key instead of a new one.
 */
async function hasUnconvertedInterest(leadId: number): Promise<boolean> {
  const rows = await db
    .select({ entityType: salesSyncEvents.entityType, payload: salesSyncEvents.payload })
    .from(salesSyncEvents)
    .where(and(eq(salesSyncEvents.provider, "xphere"), eq(salesSyncEvents.status, "synced")));
  let interest = false;
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (r.entityType === "sales_lead" && p.leadId === leadId && p.interest !== undefined) interest = true;
    if (r.entityType === "sales_sale" && p.leadId === leadId && p.convertedInterest === true) return false;
  }
  return interest;
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

  const locations = await db.select().from(salesLeadLocations).where(eq(salesLeadLocations.leadId, lead.id)).limit(1);

  const lines = sale.items
    .map((i) => `• ${i.quantity} × ${i.description} — ${money(i.totalCents, sale.sale.currency)}`)
    .join("\n");
  const kind = sale.sale.kind === "consignment_settlement" ? "Consignment settlement" : "Sale";
  const content = [
    `${kind} — ${money(sale.sale.totalCents, sale.sale.currency)} (${sale.sale.paymentStatus})`,
    lines,
    sale.sale.notes ? `\n${sale.sale.notes}` : null,
  ].filter(Boolean).join("\n");

  const convertsInterest = await hasUnconvertedInterest(lead.id);
  const summary = sale.items.map((i) => `${i.quantity}× ${i.description}`).join(", ");

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
      // This sale, as its own won deal — or the interest deal it converts.
      external_id: convertsInterest ? interestKey(lead.id) : `sale-${sale.sale.id}`,
      stage: "Customer",
      status: "won",
      value: sale.sale.totalCents / 100,
      currency: sale.sale.currency,
      title: `${lead.name} — ${summary}`.slice(0, 200),
    },
    note: { title: kind, content, dedup_id: `xpot-sale-${sale.sale.id}` },
  });

  await storage.createSalesSyncEvent({
    provider: "xphere",
    entityType: "sales_sale",
    entityId: String(saleId),
    status: result.ok ? "synced" : "failed",
    payload: { leadId: lead.id, totalCents: sale.sale.totalCents, convertedInterest: convertsInterest },
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
    // A customer expressing new interest is a new prospective deal, not a
    // reopening of what they already bought.
    opportunity: {
      pipeline: "Xpot Field Sales",
      external_id: alreadyCustomer ? `${interestKey(lead.id)}-${Date.now()}` : interestKey(lead.id),
      stage: "Interested",
      status: "open",
      value: (input.estimatedValueCents ?? 0) / 100,
      currency: lifetime.currency,
      title: `${lead.name} — ${input.interest ?? input.title}`.slice(0, 200),
    },
    note: { title: "Field visit — interest", content },
  });

  await storage.createSalesSyncEvent({
    provider: "xphere",
    entityType: "sales_lead",
    entityId: String(lead.id),
    status: result.ok ? "synced" : "failed",
    payload: { leadId: lead.id, interest: input.interest ?? null },
    lastError: result.ok ? null : result.message,
    lastAttemptAt: new Date(),
  });

  return result.ok ? { synced: true } : { synced: false, message: result.message };
}
