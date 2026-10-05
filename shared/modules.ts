// The two sides of the Xpot app. Each rep gets a list of the modules they may
// use (sales_reps.modules): field visits/check-in, and the QR/NFC tags a
// reseller sells. Managers and admins always see both.

export const XPOT_MODULES = ["visits", "tags"] as const;
export type XpotModule = (typeof XPOT_MODULES)[number];

type Viewer = { user: { isAdmin: boolean }; rep: { role: string } };

/** Manager or admin: sees every module and each module's Manage group (server: isManagerOrAdmin). */
export function canManage(viewer: Viewer | null | undefined): boolean {
  return !!viewer && (viewer.user.isAdmin || viewer.rep.role === "manager" || viewer.rep.role === "admin");
}

/**
 * The global admin only (users.is_admin, Skale Club): Tags batches, the Journey,
 * the NFC writers and MCP, Integrations, Branding and Xphere. A manager never
 * sees these, and the server refuses them (requireSuperAdmin, requireTagAdmin).
 */
export function isSuperAdmin(viewer: Pick<Viewer, "user"> | null | undefined): boolean {
  return !!viewer?.user.isAdmin;
}

export function repModules(rep: { role: string; modules?: readonly string[] | null }): XpotModule[] {
  if (rep.role === "manager" || rep.role === "admin") return [...XPOT_MODULES];
  const list = (rep.modules ?? XPOT_MODULES).filter((m): m is XpotModule => (XPOT_MODULES as readonly string[]).includes(m));
  return list;
}
