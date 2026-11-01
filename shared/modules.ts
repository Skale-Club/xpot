// The two sides of the Xpot app. Each rep gets a list of the modules they may
// use (sales_reps.modules): field visits/check-in, and the QR/NFC tags a
// reseller sells. The platform's owners always see both.

export const XPOT_MODULES = ["visits", "tags"] as const;
export type XpotModule = (typeof XPOT_MODULES)[number];

type Viewer = { user: { isAdmin: boolean } };

/** The platform's owners (users.is_admin): every organization and module (server: isPlatformAdmin). */
export function canManage(viewer: Viewer | null | undefined): boolean {
  return !!viewer?.user.isAdmin;
}

/**
 * The global admin only (users.is_admin, Skale Club): Tags batches, the Journey,
 * the NFC writers and MCP, Integrations, Branding and Xphere. Nobody else sees
 * these, and the server refuses them (requireSuperAdmin, requireTagAdmin).
 */
export function isSuperAdmin(viewer: Pick<Viewer, "user"> | null | undefined): boolean {
  return !!viewer?.user.isAdmin;
}

export function repModules(rep: { role: string; modules?: readonly string[] | null }): XpotModule[] {
  if (rep.role === "admin") return [...XPOT_MODULES];
  const list = (rep.modules ?? XPOT_MODULES).filter((m): m is XpotModule => (XPOT_MODULES as readonly string[]).includes(m));
  return list;
}
