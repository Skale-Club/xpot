import { and, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  integrationChecks,
  mcpOauthTokens,
  mcpTokens,
  salesSyncEvents,
  systemEvents,
  xphereIntegrations,
  type IntegrationCheck,
} from "#shared/schema.js";
import {
  INTEGRATION_PROVIDERS,
  SERVICES_BY_JOB,
  integrationStatusKey,
  serviceJob,
  type IntegrationStatus,
  type ServiceEvent,
  type ServiceStatus,
  type ServicesResponse,
  type StatusKey,
} from "#shared/integrations-registry.js";
import { storage } from "../storage.js";
import { maskIntegration } from "../routes/xpot/integrationStatus.js";
import { chooseLLMProvider, transcriptionProviders, type SavedProvider } from "../lib/providerChoice.js";
import { isR2Configured } from "../lib/files.js";
import { isEngineConfigured } from "../prospecting/google-maps-engine.js";
import { isGoogleRouteOptimizationConfigured } from "../prospecting/google-route-optimizer.js";

/**
 * Is each outside service working? One list, read by Admin › Integrations (on
 * every card) and Admin › Status (its Services section), so the two screens
 * never judge it apart. Status and source come from the same rules as the
 * provider cards (integrationStatusKey); "last success" and "last error" from
 * what the app records: the last Test, the CRM sync log, used AI-assistant
 * tokens and the system events of the prospecting engine and push. Never a
 * secret: env-only services say only whether they are configured.
 */

type Env = Record<string, string | undefined>;

/**
 * System event sources that speak for a service. A provider's own id counts as
 * a source too, so a failure recorded under "groq" or "twilio" shows on its card.
 */
export const EVENT_SOURCES_BY_SERVICE: Partial<Record<string, readonly string[]>> = {
  prospecting_engine: ["prospecting.engine", "prospecting.worker"],
  push: ["push"],
  twilio: ["twilio", "sms"],
  gohighlevel: ["gohighlevel", "ghl"],
};

export function eventSourcesFor(id: string): readonly string[] {
  return EVENT_SOURCES_BY_SERVICE[id] ?? [id];
}

export type ServicesInput = {
  env: Env;
  /** The registry providers' masked rows (maskIntegration), in any order. */
  providers: IntegrationStatus[];
  checks: Pick<IntegrationCheck, "provider" | "ok" | "message" | "checkedAt" | "lastOkAt">[];
  /** Per CRM provider ("xphere", "gohighlevel"): the newest synced and failed sync records. */
  crm: Record<string, { lastSyncedAt: Date | null; lastFailed: { message: string; at: Date } | null }>;
  /** People with Xphere switched on and a token saved / with a token saved at all. */
  xphere: { connected: number; withToken: number };
  /** AI assistants that can reach /mcp now: unrevoked tokens and app sign-ins. */
  mcp: { active: number; lastUsedAt: Date | null };
  /** What the server environment configures (never its values). */
  infra: {
    r2: boolean;
    supabase: boolean;
    engine: boolean;
    routeOptimization: boolean;
    push: boolean;
    wholesale: boolean;
    telegram: boolean;
  };
  /** The newest error-level system event per source. */
  events: Record<string, { id: number; message: string; createdAt: Date }>;
};

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

function latest(...dates: (Date | null | undefined)[]): Date | null {
  return dates.reduce<Date | null>((best, d) => (d && (!best || d > best) ? d : best), null);
}

function base(id: string, status: StatusKey, source: ServiceStatus["source"]): ServiceStatus {
  return {
    id,
    job: serviceJob(id)!,
    status,
    source,
    active: false,
    variant: null,
    count: null,
    lastTest: null,
    lastSuccessAt: null,
    lastError: null,
  };
}

/** The saved row as providerChoice reads it, from what the browser may see of it. */
function asSaved(status: IntegrationStatus | undefined): SavedProvider | null {
  return status ? { enabled: status.enabled, apiKey: status.hasApiKey ? "saved" : null, model: status.model } : null;
}

/** Which provider does the job now: the first usable one of the job's chain (providerChoice.ts). */
export function activeProviders(env: Env, providers: IntegrationStatus[]): Set<string> {
  const by = new Map(providers.map((p) => [p.provider, p]));
  const active = new Set<string>();
  const voice = transcriptionProviders({ groq: asSaved(by.get("groq")), openai: asSaved(by.get("openai")) })[0];
  if (voice) active.add(voice.provider);
  const llm = chooseLLMProvider(env, { openrouter: asSaved(by.get("openrouter")), gemini: asSaved(by.get("gemini")) });
  if (llm) active.add(llm.provider);
  return active;
}

function eventFor(input: ServicesInput, id: string): ServiceEvent | null {
  const sources = eventSourcesFor(id);
  const newest = sources
    .map((source) => input.events[source])
    .filter(Boolean)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return newest ? { message: newest.message, at: newest.createdAt.toISOString(), eventId: newest.id } : null;
}

/** The newer of two failures. */
function newest(a: ServiceEvent | null, b: ServiceEvent | null): ServiceEvent | null {
  if (!a || !b) return a ?? b;
  return a.at >= b.at ? a : b;
}

function crmError(input: ServicesInput, provider: string): ServiceEvent | null {
  const failed = input.crm[provider]?.lastFailed;
  return failed ? { message: failed.message, at: failed.at.toISOString(), eventId: null } : null;
}

/** Pure: every service's status from what was loaded. Order: SERVICES_BY_JOB. */
export function buildServices(input: ServicesInput): ServiceStatus[] {
  const providers = new Map(input.providers.map((p) => [p.provider, p]));
  const checks = new Map(input.checks.map((c) => [c.provider, c]));
  const active = activeProviders(input.env, input.providers);
  const out: ServiceStatus[] = [];

  for (const def of INTEGRATION_PROVIDERS) {
    const status = providers.get(def.provider);
    const row = base(def.provider, integrationStatusKey(status), status?.source ?? "none");
    const check = checks.get(def.provider);
    row.active = active.has(def.provider);
    row.lastTest = check ? { ok: check.ok, message: check.message, at: check.checkedAt.toISOString() } : null;
    row.lastSuccessAt = iso(latest(check?.lastOkAt, input.crm[def.provider]?.lastSyncedAt));
    row.lastError = newest(crmError(input, def.provider), eventFor(input, def.provider));
    out.push(row);
  }

  const { infra } = input;
  const envOnly = (id: string, configured: boolean) => {
    const row = base(id, configured ? "live" : "off", configured ? "env" : "none");
    row.lastError = eventFor(input, id);
    return row;
  };
  out.push(envOnly("route_optimization", infra.routeOptimization));

  const xphere = base(
    "xphere",
    input.xphere.connected ? "live" : input.xphere.withToken ? "idle" : "off",
    input.xphere.connected ? "panel" : "none",
  );
  xphere.count = input.xphere.connected;
  xphere.lastSuccessAt = iso(input.crm.xphere?.lastSyncedAt);
  xphere.lastError = newest(crmError(input, "xphere"), eventFor(input, "xphere"));
  out.push(xphere);

  const mcp = base("mcp", input.mcp.active ? "live" : "off", input.mcp.active ? "panel" : "none");
  mcp.count = input.mcp.active;
  mcp.lastSuccessAt = iso(input.mcp.lastUsedAt);
  out.push(mcp);

  const storageRow = envOnly("file_storage", infra.r2 || infra.supabase);
  storageRow.variant = infra.r2 ? "r2" : infra.supabase ? "supabase" : null;
  out.push(storageRow);
  out.push(envOnly("prospecting_engine", infra.engine));
  out.push(envOnly("push", infra.push));
  out.push(envOnly("wholesale", infra.wholesale));
  out.push(envOnly("telegram", infra.telegram));

  const order = Object.values(SERVICES_BY_JOB).flat();
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** What the environment configures, by the same checks the services themselves make. */
export function infraFromEnv(env: Env = process.env): ServicesInput["infra"] {
  const has = (...names: string[]) => names.every((name) => Boolean(env[name]?.trim()));
  return {
    r2: isR2Configured(),
    supabase: has("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
    engine: isEngineConfigured(),
    routeOptimization: isGoogleRouteOptimizationConfigured(),
    push: has("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"),
    wholesale: has("XPOT_WHOLESALE_SECRET"),
    telegram: has("XPOT_TELEGRAM_BOT_TOKEN", "XPOT_TELEGRAM_CHAT_ID"),
  };
}

/** Every registry provider's masked status (registry ⨝ DB), as GET /admin/integrations lists them. */
export async function listProviderStatuses(env: Env = process.env): Promise<IntegrationStatus[]> {
  const [chat, settings] = await Promise.all([storage.listChatIntegrations(), storage.listIntegrationSettings()]);
  const chatByProvider = new Map(chat.map((r) => [r.provider, r]));
  const settingsByProvider = new Map(settings.map((r) => [r.provider, r]));
  return INTEGRATION_PROVIDERS.map((def) =>
    maskIntegration(def.provider, def.table === "chat" ? chatByProvider.get(def.provider) : settingsByProvider.get(def.provider), env),
  );
}

/** Keeps the last Test of a provider; a failed test keeps the time of the last passing one. */
export async function recordIntegrationCheck(provider: string, result: { ok: boolean; message: string }, now = new Date()) {
  const message = result.message.slice(0, 1000);
  const [row] = await db.insert(integrationChecks)
    .values({ provider, ok: result.ok, message, checkedAt: now, lastOkAt: result.ok ? now : null })
    .onConflictDoUpdate({
      target: integrationChecks.provider,
      set: {
        ok: result.ok,
        message,
        checkedAt: now,
        ...(result.ok ? { lastOkAt: now } : {}),
      },
    })
    .returning();
  return row;
}

async function loadCrm(): Promise<ServicesInput["crm"]> {
  const [synced, failed] = await Promise.all([
    db.select({ provider: salesSyncEvents.provider, at: max(sql`coalesce(${salesSyncEvents.lastAttemptAt}, ${salesSyncEvents.createdAt})`) })
      .from(salesSyncEvents).where(eq(salesSyncEvents.status, "synced")).groupBy(salesSyncEvents.provider),
    db.selectDistinctOn([salesSyncEvents.provider], {
      provider: salesSyncEvents.provider,
      message: salesSyncEvents.lastError,
      at: sql<Date>`coalesce(${salesSyncEvents.lastAttemptAt}, ${salesSyncEvents.createdAt})`,
    }).from(salesSyncEvents).where(eq(salesSyncEvents.status, "failed"))
      .orderBy(salesSyncEvents.provider, desc(salesSyncEvents.id)),
  ]);
  const out: ServicesInput["crm"] = {};
  const entry = (provider: string) => (out[provider] ??= { lastSyncedAt: null, lastFailed: null });
  for (const row of synced) entry(row.provider).lastSyncedAt = row.at ? new Date(row.at as any) : null;
  for (const row of failed) entry(row.provider).lastFailed = { message: row.message || "Sync failed", at: new Date(row.at) };
  return out;
}

async function loadEvents(): Promise<ServicesInput["events"]> {
  const ids = Object.values(SERVICES_BY_JOB).flat();
  const sources = Array.from(new Set(ids.flatMap((id) => [...eventSourcesFor(id)])));
  const rows = await db.selectDistinctOn([systemEvents.source], {
    id: systemEvents.id,
    source: systemEvents.source,
    message: systemEvents.message,
    createdAt: systemEvents.createdAt,
  }).from(systemEvents)
    .where(and(inArray(systemEvents.source, sources), eq(systemEvents.level, "error")))
    .orderBy(systemEvents.source, desc(systemEvents.id));
  return Object.fromEntries(rows.map((row) => [row.source, row]));
}

/** Reads everything buildServices needs. */
export async function loadServices(env: Env = process.env, now = Date.now()): Promise<ServicesResponse> {
  const [providers, checks, crm, xphere, tokens, oauth, events] = await Promise.all([
    listProviderStatuses(env),
    db.select().from(integrationChecks),
    loadCrm(),
    db.select({
      connected: sql<number>`count(*) filter (where ${xphereIntegrations.isEnabled} and ${xphereIntegrations.apiKey} is not null and ${xphereIntegrations.apiKey} <> '')::int`,
      withToken: sql<number>`count(*) filter (where ${xphereIntegrations.apiKey} is not null and ${xphereIntegrations.apiKey} <> '')::int`,
    }).from(xphereIntegrations),
    db.select({ count: sql<number>`count(*)::int`, lastUsedAt: max(mcpTokens.lastUsedAt) }).from(mcpTokens).where(isNull(mcpTokens.revokedAt)),
    // One connected app per client and person, as the AI assistants tab lists them (oauthStore.listConnections).
    db.select({
      count: sql<number>`count(distinct (${mcpOauthTokens.clientId}, ${mcpOauthTokens.userId}))::int`,
      lastUsedAt: max(mcpOauthTokens.lastUsedAt),
    }).from(mcpOauthTokens).where(and(isNull(mcpOauthTokens.revokedAt), gt(mcpOauthTokens.expiresAt, new Date(now)))),
    loadEvents(),
  ]);
  const services = buildServices({
    env,
    providers,
    checks,
    crm,
    xphere: { connected: xphere[0]?.connected ?? 0, withToken: xphere[0]?.withToken ?? 0 },
    mcp: {
      active: (tokens[0]?.count ?? 0) + (oauth[0]?.count ?? 0),
      lastUsedAt: latest(tokens[0]?.lastUsedAt ?? null, oauth[0]?.lastUsedAt ?? null),
    },
    infra: infraFromEnv(env),
    events,
  });
  return { generatedAt: new Date(now).toISOString(), services };
}

