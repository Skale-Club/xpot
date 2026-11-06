import { useQuery } from "@tanstack/react-query";
import { previewDesktopAnswer } from "./xpotDesktopPreview";

// Xpot Desktop (print-pipeline/desktop.py) on this computer: a page cannot see what is installed, so it asks the
// program, which answers on 127.0.0.1 and only to Xpot's pages. Make's setup, Devices and the dot on Devices in the menu
// all read the same query.

const DESKTOP = "http://127.0.0.1:47631";

export type ItemId = "connection" | "pipeline" | "packages" | "studio" | "fonts";
export interface DesktopItem { id: ItemId; state: "ok" | "missing" | "working" | "failed"; detail: string | null }
export interface DesktopStatus {
  supported: boolean; computerName: string; items: DesktopItem[]; ready: boolean; building: boolean; readers: string[];
  /** desktop-2 and later install what is missing by themselves once connected: the page only follows. */
  autoSetup?: boolean;
}

export async function askDesktop(path: string, body?: unknown): Promise<DesktopStatus> {
  // Local development: the stage switcher may stand in for Xpot Desktop (xpotDesktopPreview.ts).
  const pretend = previewDesktopAnswer(path);
  if (pretend) return pretend;
  const res = await fetch(`${DESKTOP}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `Xpot Desktop answered ${res.status}`);
  return res.json() as Promise<DesktopStatus>;
}

/** Windows for now: the print files have only been checked there. */
export function isWindows(): boolean {
  return typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);
}

/**
 * What Xpot Desktop on this computer says (no answer: it is not installed or not running). One query for every screen
 * that asks; `everyMs` is how often this screen asks again (the steps while setting up, Make more calmly).
 */
export function useXpotDesktopStatus(everyMs: number, enabled = true) {
  return useQuery({
    queryKey: ["xpot-desktop", "status"],
    queryFn: () => askDesktop("/status"),
    enabled,
    retry: false,
    // A screen that mounts again reuses the last answer instead of asking at once (no burst of requests).
    staleTime: 3000,
    refetchInterval: everyMs,
    refetchIntervalInBackground: false,
  });
}
