import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Relative, not @shared: queryClient.ts imports this file and is loaded by tests without the alias.
import { canManage, isSuperAdmin } from "../../../shared/modules";
import { runsATeam } from "../../../shared/organizations";
import type { XpotMeResponse } from "../pages/xpot/types";

// Admin mode: whether a manager or the global admin sees the management side of
// the app (each module's Manage group, the Organization, the admin screens).
// Off, they see Xpot exactly as a rep does, their own data included: every API
// call then carries "X-Xpot-View: rep" and the server narrows its lists to the
// person's own (server/routes/xpot/middleware.ts, viewsAsRep). On, calls carry
// "X-Xpot-View: manage". It is a view on this device, not a permission: the
// server still decides what each account may do.
//
// A Rep Admin of an organization (runsATeam) has the mode too, with a smaller
// reach: on, their Companies, Sales and Tasks lists widen to the organizations
// they run, never further (server listScope), and nothing else changes; no
// Manage screens, no Administration. For them only "manage" widens, so a call
// without the header gets their own records.
//
// Off by default, and off again after signing out (signOut clears it). The
// sidebar's "Management mode" and the switch in Settings › Administration
// enter it; opening an /admin page turns it on
// with a toast (AdminApp); the amber bar shown on every screen while it is on
// leaves it (AdminModeBar).

const KEY = "xpot.adminMode";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let current = typeof window === "undefined" ? false : read();

/** Headers for an API call: "view as a rep" while admin mode is off, "manage" while on. */
export function viewHeaders(): Record<string, string> {
  return { "X-Xpot-View": current ? "manage" : "rep" };
}

/** What management mode shows this person: everyone (a manager), the organizations they run (a Rep Admin), or nothing (no mode). */
export type ManagementReach = "everyone" | "organization";

export function managementReach(me: XpotMeResponse | null | undefined): ManagementReach | null {
  if (canManage(me)) return "everyone";
  return runsATeam(me?.organizations) ? "organization" : null;
}

export function setAdminMode(on: boolean) {
  current = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Not remembered; it lasts until the app reloads.
  }
  listeners.forEach((l) => l());
}

/** Forgets the choice (sign-out): the next account on this device starts with it off. */
export function clearAdminMode() {
  current = false;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What the signed-in person sees. `hasAdminAccess` is the real permission of a
 * manager (Administration, the Manage screens); `reach` says whether the person
 * has management mode at all and what it widens (a Rep Admin's is their
 * organization). `canManage` and `isSuperAdmin` are what the screens should
 * check, and are false while admin mode is off and always for a Rep Admin.
 */
export function useViewerAccess() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const stored = useSyncExternalStore(subscribe, () => current, () => false);
  const hasAdminAccess = canManage(me);
  const reach = managementReach(me);
  const adminMode = reach !== null && stored;
  const qc = useQueryClient();
  // Every cached list was fetched for the other view; fetch them again.
  const set = useCallback((on: boolean) => {
    if (on === current) return;
    setAdminMode(on);
    void qc.invalidateQueries();
  }, [qc]);
  return {
    me,
    hasAdminAccess,
    reach,
    adminMode,
    setAdminMode: set,
    canManage: hasAdminAccess && adminMode,
    isSuperAdmin: isSuperAdmin(me) && adminMode,
  };
}
