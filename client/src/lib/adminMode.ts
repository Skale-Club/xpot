import { useQuery } from "@tanstack/react-query";
import { useLocation, useRouter } from "wouter";
// Relative imports: queryClient.ts and its tests load this module without app aliases.
import { canManage, isSuperAdmin } from "../../../shared/modules";
import { runsATeam } from "../../../shared/organizations";
import { workspaceForPath, workspaceHeaders } from "./workspace";
import type { XpotMeResponse } from "../pages/xpot/types";

/** The server still authorizes every request; this header only selects the current page's data scope. */
export function viewHeaders(): Record<string, string> {
  return workspaceHeaders(typeof window === "undefined" ? "" : window.location?.pathname ?? "");
}

export type ManagementReach = "everyone" | "organization";
export function managementReach(me: XpotMeResponse | null | undefined): ManagementReach | null {
  if (canManage(me)) return "everyone";
  return runsATeam(me?.organizations) ? "organization" : null;
}

/** Remove the obsolete device preference on sign-out; it no longer controls permissions or lists. */
export function clearAdminMode() {
  try { window.localStorage.removeItem("xpot.adminMode"); } catch { /* Storage can be blocked. */ }
}

/** User screens always use personal data. Management is explicit in the URL and the panel navigation. */
export function useViewerAccess() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const [path] = useLocation();
  const router = useRouter();
  const hasAdminAccess = canManage(me);
  const reach = managementReach(me);
  const adminMode = reach !== null && workspaceForPath(`${router.base}${path}`) === "management";
  return { me, hasAdminAccess, reach, adminMode, canManage: hasAdminAccess && adminMode, isSuperAdmin: isSuperAdmin(me) && adminMode };
}
