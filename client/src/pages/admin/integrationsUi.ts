// Pure rules behind Account › Integrations (AdminIntegrations.tsx), kept apart so
// they are unit-tested.

import type { IntegrationProviderDef, IntegrationStatus } from "@shared/integrations-registry";

// The tab lives in the URL so each one has a link: /admin/integrations (services),
// /admin/integrations/xphere, /admin/integrations/mcp. /admin/xphere, the old
// Xphere screen, still opens the Xphere tab.

export const INTEGRATIONS_TABS = ["providers", "xphere", "mcp"] as const;
export type IntegrationsTab = (typeof INTEGRATIONS_TABS)[number];

export function integrationsTabFromPath(path: string): IntegrationsTab {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  if (clean === "/admin/xphere") return "xphere";
  const sub = /^\/admin\/integrations\/([^/]+)/.exec(clean)?.[1];
  return sub === "xphere" || sub === "mcp" ? sub : "providers";
}

export function integrationsTabPath(tab: IntegrationsTab): string {
  return tab === "providers" ? "/admin/integrations" : `/admin/integrations/${tab}`;
}

/** One person's Xphere connection, as GET /api/xpot/admin/xphere lists it. */
export type XphereRow = {
  userId: string | null;
  repId: number;
  displayName: string;
  email: string | null;
  inboundApiKey: string | null;
  apiUrl: string;
  apiKeySet: boolean;
  isEnabled: boolean;
  access: "active" | "pending" | "blocked";
  deleted: boolean;
  usesVisits: boolean;
};

/**
 * Who the Xphere tab lists: by default only people who can use it now (active,
 * with Visits, a real account). "Show all" adds the rest, deleted placeholders included.
 */
export function visibleXphereRows(rows: XphereRow[], showAll: boolean): XphereRow[] {
  if (showAll) return rows;
  return rows.filter((row) => !row.deleted && row.usesVisits && row.access === "active");
}

/** The inbound key as the list shows it: its prefix and last 4 characters. */
export function maskInboundKey(key: string): string {
  const prefix = key.startsWith("xpot_") ? "xpot_" : "";
  return `${prefix}••••••••${key.slice(-4)}`;
}

/**
 * One status per provider, shown by the bar, the dot and the chip alike:
 *   live   = in use: switched on and complete here, or set by the server environment
 *   broken = switched on here but something is missing
 *   idle   = switched off, with a key saved (turn on to use it)
 *   off    = switched off, nothing saved
 */
export type StatusKey = "live" | "broken" | "idle" | "off";

export function integrationStatusKey(s: Pick<IntegrationStatus, "enabled" | "problem" | "hasApiKey" | "source"> | undefined): StatusKey {
  if (!s) return "off";
  if (s.source === "env") return "live";
  if (s.enabled && !s.problem) return "live";
  if (s.enabled) return "broken";
  if (s.hasApiKey) return "idle";
  return "off";
}

/**
 * Whether a save would leave nobody able to sign in: the provider sends the
 * sign-in codes, works now from this panel, the server has no settings of its
 * own to fall back on, and the save switches it off or removes its key.
 */
export function locksOutSignIn(
  def: Pick<IntegrationProviderDef, "requiredForSignIn">,
  status: Pick<IntegrationStatus, "enabled" | "problem" | "envAvailable">,
  next: { enabled: boolean; clearApiKey?: boolean },
): boolean {
  if (!def.requiredForSignIn || status.envAvailable) return false;
  const worksNow = status.enabled && !status.problem;
  return worksNow && (!next.enabled || Boolean(next.clearApiKey));
}
