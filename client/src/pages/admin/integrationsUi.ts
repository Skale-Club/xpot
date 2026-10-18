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

/**
 * Every cached Xphere query: the list (/api/xpot/admin/xphere) and each
 * person's connection (/api/xpot/admin/xphere/<userId>, People › Visits).
 * A save or a new key on either screen refreshes both, so neither shows a
 * key that no longer works.
 */
export function isXphereQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return typeof head === "string" && /^\/api\/xpot\/admin\/xphere(\/|$)/.test(head);
}

/** The inbound key as the list shows it: its prefix and last 4 characters. */
export function maskInboundKey(key: string): string {
  const prefix = key.startsWith("xpot_") ? "xpot_" : "";
  return `${prefix}••••••••${key.slice(-4)}`;
}

// One status per provider, shared with the server's services list (Status reads the same).
export { integrationStatusKey, type StatusKey } from "@shared/integrations-registry";

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
