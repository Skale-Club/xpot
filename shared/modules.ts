// The two sides of the Xpot app. Each rep gets a list of the modules they may
// use (sales_reps.modules): field visits/check-in, and the QR/NFC tags a
// reseller sells. Managers and admins always see both.

export const XPOT_MODULES = ["visits", "tags"] as const;
export type XpotModule = (typeof XPOT_MODULES)[number];

export function repModules(rep: { role: string; modules?: readonly string[] | null }): XpotModule[] {
  if (rep.role === "manager" || rep.role === "admin") return [...XPOT_MODULES];
  const list = (rep.modules ?? XPOT_MODULES).filter((m): m is XpotModule => (XPOT_MODULES as readonly string[]).includes(m));
  return list;
}
