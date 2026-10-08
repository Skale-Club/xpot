import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canManage, isSuperAdmin } from "@shared/modules";
import type { XpotMeResponse } from "@/pages/xpot/types";

// Admin mode: whether a manager or the global admin sees the management side of
// the app (each module's Manage group, the Organization, the admin screens).
// Off, they see Xpot exactly as a rep does, their own data included: every API
// call then carries "X-Xpot-View: rep" and the server narrows its lists to the
// person's own (server/routes/xpot/middleware.ts, viewsAsRep). It is a view on
// this device, not a permission: the server still decides what each account may
// do, and the header can only narrow.
//
// Off by default. The shield button enters it (AdminModeButton), opening an
// /admin page turns it on (AdminApp), and the amber bar shown on every screen
// while it is on leaves it (AdminModeBar).

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

/** Headers for an API call: "view as a rep" while admin mode is off. */
export function viewHeaders(): Record<string, string> {
  return current ? {} : { "X-Xpot-View": "rep" };
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What the signed-in person sees. `hasAdminAccess` is the real permission (it
 * decides whether the Administration switch is offered); `canManage` and
 * `isSuperAdmin` are what the screens should check, and are false while admin
 * mode is off.
 */
export function useViewerAccess() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const adminMode = useSyncExternalStore(subscribe, () => current, () => false);
  const hasAdminAccess = canManage(me);
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
    adminMode: hasAdminAccess && adminMode,
    setAdminMode: set,
    canManage: hasAdminAccess && adminMode,
    isSuperAdmin: isSuperAdmin(me) && adminMode,
  };
}
