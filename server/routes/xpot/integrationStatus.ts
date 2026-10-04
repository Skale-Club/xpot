// Pure helpers for the Integrations panel: what the browser may see of a row
// (secrets masked) and how provider-specific settings are merged on save.

import {
  CONFIG_FIELD_KEYS,
  getProviderDef,
  integrationProblem,
  isConfigFieldKey,
  type ConfigFieldKey,
  type IntegrationStatus,
} from "#shared/integrations-registry.js";

export function last4(key: string | null | undefined): string | null {
  if (!key) return null;
  const k = key.trim();
  return k.length >= 4 ? k.slice(-4) : "••••";
}

/** Only the non-empty, known config values of a row, as strings. */
export function readConfig(raw: unknown): Partial<Record<ConfigFieldKey, string>> {
  const out: Partial<Record<ConfigFieldKey, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of CONFIG_FIELD_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

/**
 * Applies a save on top of the stored config. undefined keeps the stored value,
 * null or "" clears it, anything else replaces it. Only keys the provider
 * declares are touched.
 */
export function mergeConfigPatch(
  provider: string,
  existing: unknown,
  patch: Partial<Record<ConfigFieldKey, string | null | undefined>>,
): Record<string, string> {
  const def = getProviderDef(provider);
  const allowed = new Set(def?.fields.map((f) => f.key).filter(isConfigFieldKey) ?? []);
  const next: Record<string, string> = { ...readConfig(existing) };
  for (const key of CONFIG_FIELD_KEYS) {
    if (!allowed.has(key)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    const trimmed = value?.trim() ?? "";
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  }
  return next;
}

/** Shape sent to the browser: the secret is reduced to "has one" + its last 4 characters. */
export function maskIntegration(provider: string, row: any | undefined): IntegrationStatus {
  const def = getProviderDef(provider)!;
  const enabled = def.table === "chat" ? Boolean(row?.enabled) : Boolean(row?.isEnabled);
  const config = readConfig(row?.config);
  const hasApiKey = Boolean(row?.apiKey);
  return {
    provider,
    enabled,
    model: row?.model ?? null,
    locationId: row?.locationId ?? null,
    calendarId: row?.calendarId ?? null,
    hasApiKey,
    apiKeyLast4: last4(row?.apiKey),
    config,
    problem: integrationProblem(provider, { hasApiKey, config }),
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}
