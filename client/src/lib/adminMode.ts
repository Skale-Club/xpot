import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { canManage, isSuperAdmin } from "@shared/modules";
import type { XpotMeResponse } from "@/pages/xpot/types";

// Admin mode: whether a manager or the global admin sees the management side of
// the app (each module's Manage group, the Organization, the admin shortcuts).
// Off, they see Xpot exactly as a rep does. It is a view preference on this
// device, not a permission: the server still decides what each account may do,
// and opening an /admin page turns it on (AdminApp).
//
// Off by default, so the app looks the same for everyone until someone who
// manages it asks for more (Settings › Administration).

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
  const set = useCallback((on: boolean) => setAdminMode(on), []);
  return {
    me,
    hasAdminAccess,
    adminMode: hasAdminAccess && adminMode,
    setAdminMode: set,
    canManage: hasAdminAccess && adminMode,
    isSuperAdmin: isSuperAdmin(me) && adminMode,
  };
}
