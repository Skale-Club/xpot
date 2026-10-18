// Admin › Integrations and Admin › Status read one list of services, so they
// cannot disagree: the last Test is kept, CRM sync failures and AI-assistant
// tokens show up on it, records that never reached the CRM are listed with a
// name and a link, a stuck route can be asked for again for any rep, and
// Branding can go back to the built-in icon.

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import express from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// GoHighLevel (legacy) answers a re-sent opportunity without the network.
const ghl = vi.hoisted(() => ({ createGHLOpportunity: null as any }));
vi.mock("../server/integrations/ghl.js", async (importOriginal) => {
  ghl.createGHLOpportunity = vi.fn(async () => ({ success: true, opportunityId: "ghl-opp-1" }));
  return { ...(await importOriginal<typeof import("../server/integrations/ghl.js")>()), createGHLOpportunity: ghl.createGHLOpportunity };
});

// The route retry nudges the queue; the engine is not part of this test.
vi.mock("../server/prospecting/queue.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/prospecting/queue.js")>()),
  tickProspectingQueueSafely: vi.fn(async () => undefined),
}));

const { createAdminIntegrationsRouter } = await import("../server/routes/xpot/admin-integrations.js");
const { createSystemHealthRouter } = await import("../server/routes/xpot/system-health.js");
const { createBrandingAdminRouter } = await import("../server/routes/xpot/branding.js");
const { createSyncRouter } = await import("../server/routes/xpot/sync.js");
const { recordIntegrationCheck } = await import("../server/observability/services.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];
const one = async (text: string, params: unknown[] = []) => (await q(text, params))[0];

afterAll(async () => pg.client?.close());

function app(isAdmin: boolean, userId = "status-admin") {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).session = { userId, email: `${userId}@x.test`, firstName: "Ada", isAdmin };
    next();
  });
  server.use("/api/xpot", createSyncRouter());
  server.use("/api/xpot", createAdminIntegrationsRouter());
  server.use("/api/xpot", createSystemHealthRouter());
  server.use("/api/xpot", createBrandingAdminRouter());
  return server;
}

async function request(method: string, path: string, body?: unknown, options: { admin?: boolean; as?: string } = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app(options.admin ?? true, options.as).listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        resolve({ status: response.status, body: text ? JSON.parse(text) : null });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

let seed: { adminRepId: number; repId: number; organizationId: number; leadId: number; otherLeadId: number };

beforeEach(async () => {
  await q(`TRUNCATE integration_checks, sales_sync_events, sales_opportunities_local, integration_settings, sales_app_settings, mcp_tokens, xphere_integrations, prospecting_runs, prospecting_jobs,
    sales_visits, sales_leads, organization_memberships, organizations, sales_reps, users, app_branding RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO users (id, phone, first_name) VALUES ('status-admin', '+15550000201', 'Ada'), ('status-rep', '+15550000202', 'Rui')`);
  const adminRepId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('status-admin', 'Ada Admin', 'admin', true) RETURNING id`)).id;
  const repId = (await one(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('status-rep', 'Rui Rep', 'rep', true) RETURNING id`)).id;
  const organizationId = (await one(`INSERT INTO organizations (name, slug) VALUES ('Status Team', 'status-team') RETURNING id`)).id;
  const leadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Corner Barber', $2, 'customer') RETURNING id`, [organizationId, repId])).id;
  const otherLeadId = (await one(`INSERT INTO sales_leads (organization_id, name, owner_rep_id, status) VALUES ($1, 'Main St Salon', $2, 'customer') RETURNING id`, [organizationId, repId])).id;
  seed = { adminRepId, repId, organizationId, leadId, otherLeadId };
});

const service = (body: any, id: string) => body.services.find((s: any) => s.id === id);

describe("last test", () => {
  it("is kept by Test and read back on the services list", async () => {
    // GoHighLevel answers without the network when the Location ID is missing.
    const tested = await request("POST", "/api/xpot/admin/integrations/gohighlevel/test", { apiKey: "pit-1234" });
    expect(tested.body).toMatchObject({ ok: false, message: expect.stringContaining("Location ID"), testedAt: expect.any(String) });

    const listed = await request("GET", "/api/xpot/admin/integrations/services");
    expect(listed.status).toBe(200);
    expect(service(listed.body, "gohighlevel")).toMatchObject({
      job: "crm",
      lastTest: { ok: false, at: tested.body.testedAt },
      lastSuccessAt: null,
    });
  });

  it("remembers when it last passed after a later failure", async () => {
    const passed = await recordIntegrationCheck("groq", { ok: true, message: "Groq authenticated." }, new Date("2026-10-01T10:00:00Z"));
    await recordIntegrationCheck("groq", { ok: false, message: "Groq returned 401." }, new Date("2026-10-02T10:00:00Z"));
    expect(passed.lastOkAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    const row = await one(`SELECT ok, message, last_ok_at FROM integration_checks WHERE provider = 'groq'`);
    expect(row.ok).toBe(false);
    expect(row.message).toBe("Groq returned 401.");
    expect(new Date(row.last_ok_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });

  it("is only for the Xpot admin", async () => {
    expect((await request("GET", "/api/xpot/admin/integrations/services", undefined, { admin: false })).status).toBe(403);
  });
});

describe("services list", () => {
  it("shows CRM sync results, Xphere people and AI-assistant tokens", async () => {
    await q(`INSERT INTO xphere_integrations (user_id, api_key, is_enabled) VALUES ('status-rep', 'xph_1', true), ('status-admin', 'xph_2', false)`);
    await q(`INSERT INTO mcp_tokens (created_by_user_id, name, token_hash, token_prefix) VALUES ('status-admin', 'Claude Code', 'hash-1', 'xmcp_ab')`);
    await q(`INSERT INTO sales_sync_events (provider, entity_type, entity_id, status, last_error, last_attempt_at)
      VALUES ('xphere', 'sales_lead', $1, 'synced', NULL, '2026-10-10T09:00:00Z'),
             ('xphere', 'sales_lead', $2, 'failed', 'Xphere returned 403', '2026-10-11T09:00:00Z')`, [seed.leadId, seed.otherLeadId]);

    const { body } = await request("GET", "/api/xpot/admin/integrations/services");
    expect(service(body, "xphere")).toMatchObject({
      status: "live",
      count: 1,
      lastSuccessAt: "2026-10-10T09:00:00.000Z",
      lastError: { message: "Xphere returned 403", at: "2026-10-11T09:00:00.000Z" },
    });
    expect(service(body, "mcp")).toMatchObject({ status: "live", count: 1 });
    // Env-only services say whether they are configured, nothing more.
    expect(service(body, "wholesale")).toMatchObject({ job: "infra", source: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("xph_1");
  });
});

describe("CRM sync problems", () => {
  it("lists the records whose latest attempt failed, with their company and a link", async () => {
    // Retried and synced since: no longer a problem.
    await q(`INSERT INTO sales_sync_events (provider, entity_type, entity_id, status, last_error, last_attempt_at)
      VALUES ('xphere', 'sales_lead', $1, 'failed', 'timeout', '2026-10-10T09:00:00Z'),
             ('xphere', 'sales_lead', $1, 'synced', NULL, '2026-10-10T10:00:00Z'),
             ('xphere', 'sales_lead', $2, 'failed', 'Xphere returned 403', '2026-10-11T09:00:00Z'),
             ('gohighlevel', 'sales_opportunity', '77', 'needs_review', 'stage missing', '2026-10-09T09:00:00Z')`, [seed.leadId, seed.otherLeadId]);

    const res = await request("GET", "/api/xpot/admin/system-health/sync-problems");
    expect(res.status).toBe(200);
    expect(res.body.problems).toEqual([
      expect.objectContaining({
        provider: "xphere",
        entityType: "sales_lead",
        entityId: String(seed.otherLeadId),
        entityName: "Main St Salon",
        href: `/leads/${seed.otherLeadId}`,
        repName: "Rui Rep",
        status: "failed",
        lastError: "Xphere returned 403",
        retryable: true,
      }),
      // An opportunity is re-sent to GoHighLevel like the rest (POST /sync/retry).
      expect.objectContaining({ provider: "gohighlevel", entityType: "sales_opportunity", entityName: null, href: null, retryable: true }),
    ]);
  });
});

describe("CRM sync retry of an opportunity", () => {
  const opportunity = async () => {
    const id = (await one(`INSERT INTO sales_opportunities_local (lead_id, rep_id, title, value, sync_status)
      VALUES ($1, $2, 'Window decals', 500, 'needs_review') RETURNING id`, [seed.leadId, seed.repId])).id as number;
    await q(`INSERT INTO sales_sync_events (provider, entity_type, entity_id, status, last_error, last_attempt_at)
      VALUES ('gohighlevel', 'sales_opportunity', $1, 'needs_review', 'GHL not configured', NOW() - interval '1 hour')`, [String(id)]);
    return id;
  };
  const problemFor = async (id: number) =>
    (await request("GET", "/api/xpot/admin/system-health/sync-problems")).body.problems.find((p: any) => p.entityType === "sales_opportunity" && p.entityId === String(id));

  it("sends it again and drops it from the list once it lands", async () => {
    const id = await opportunity();
    expect(await problemFor(id)).toMatchObject({ entityName: "Window decals", href: `/leads/${seed.leadId}`, repName: "Rui Rep", retryable: true });
    await q(`INSERT INTO integration_settings (provider, api_key, location_id, is_enabled) VALUES ('gohighlevel', 'pit-1', 'loc-1', true)`);
    await q(`INSERT INTO sales_app_settings (default_pipeline_key, default_stage_key) VALUES ('pipe-1', 'stage-1')`);
    await q(`UPDATE sales_leads SET ghl_contact_id = 'ghl-contact-1' WHERE id = $1`, [seed.leadId]);

    const res = await request("POST", "/api/xpot/sync/retry", { entityType: "sales_opportunity", entityId: String(id) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ synced: true, ghlOpportunityId: "ghl-opp-1" });
    expect(ghl.createGHLOpportunity).toHaveBeenCalledWith("pit-1", "loc-1", expect.objectContaining({ contactId: "ghl-contact-1", pipelineId: "pipe-1", pipelineStageId: "stage-1" }));
    expect(await one(`SELECT sync_status, ghl_opportunity_id FROM sales_opportunities_local WHERE id = $1`, [id]))
      .toEqual({ sync_status: "synced", ghl_opportunity_id: "ghl-opp-1" });
    expect(await problemFor(id)).toBeUndefined();
  });

  it("keeps it listed with the new error when it still fails", async () => {
    const id = await opportunity();
    const res = await request("POST", "/api/xpot/sync/retry", { entityType: "sales_opportunity", entityId: String(id) });
    expect(res.body).toMatchObject({ synced: false, message: "GHL not configured" });
    expect(await problemFor(id)).toMatchObject({ status: "needs_review", lastError: "GHL not configured" });
    expect((await one(`SELECT count(*)::int AS n FROM sales_sync_events WHERE entity_type = 'sales_opportunity' AND entity_id = $1`, [String(id)])).n).toBe(2);
  });

  it("is refused for another rep's opportunity", async () => {
    const id = await opportunity();
    await q(`INSERT INTO users (id, phone, first_name) VALUES ('status-other', '+15550000203', 'Otto')`);
    await q(`INSERT INTO sales_reps (user_id, display_name, role, is_active) VALUES ('status-other', 'Otto Rep', 'rep', true)`);
    const res = await request("POST", "/api/xpot/sync/retry", { entityType: "sales_opportunity", entityId: String(id) }, { admin: false, as: "status-other" });
    expect(res.status).toBe(403);
    // Its owner may.
    expect((await request("POST", "/api/xpot/sync/retry", { entityType: "sales_opportunity", entityId: String(id) }, { admin: false, as: "status-rep" })).status).toBe(200);
  });
});

describe("stuck prospecting route", () => {
  const job = async (routePlanningStatus: string) =>
    (await one(`INSERT INTO prospecting_jobs (rep_id, status, location, route_planning_status, completed_at, updated_at)
      VALUES ($1, 'completed', 'Natick, MA', $2, NOW() - interval '30 minutes', NOW() - interval '30 minutes') RETURNING id`, [seed.repId, routePlanningStatus])).id as number;

  it("can be asked for again by the Xpot admin for another rep's search", async () => {
    const jobId = await job("pending");
    const res = await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/retry-route`);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId, routePlanningStatus: "pending" });
    const row = await one(`SELECT updated_at FROM prospecting_jobs WHERE id = $1`, [jobId]);
    expect(Date.now() - new Date(row.updated_at).getTime()).toBeLessThan(5 * 60 * 1000);
  });

  it("refuses a route that is still being built, and a missing job", async () => {
    const jobId = await job("building");
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/retry-route`)).status).toBe(409);
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/999999/retry-route`)).status).toBe(404);
    expect((await request("POST", `/api/xpot/admin/system-health/jobs/${jobId}/retry-route`, undefined, { admin: false })).status).toBe(403);
  });
});

describe("restore default branding", () => {
  it("forgets the uploaded icon or logo", async () => {
    await q(`INSERT INTO app_branding (id, favicon_url, favicon_content_type, logo_url, logo_content_type)
      VALUES (1, 'https://cdn.test/icon.jpg', 'image/jpeg', 'https://cdn.test/logo.svg', 'image/svg+xml')`);
    const res = await request("DELETE", "/api/xpot/admin/branding/favicon");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ faviconUrl: null, faviconContentType: null, logoUrl: "https://cdn.test/logo.svg" });
    expect((await request("DELETE", "/api/xpot/admin/branding/logo")).body).toMatchObject({ logoUrl: null });
    expect((await request("DELETE", "/api/xpot/admin/branding/banner")).status).toBe(404);
    expect((await request("DELETE", "/api/xpot/admin/branding/logo", undefined, { admin: false })).status).toBe(403);
  });
});
