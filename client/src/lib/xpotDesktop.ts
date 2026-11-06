import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewDesktopAnswer } from "./xpotDesktopPreview";

// Xpot Desktop (print-pipeline/desktop.py) on this computer: a page cannot see what is installed, so it asks the
// program, which answers on 127.0.0.1 and only to Xpot's pages. Make's setup, Devices and the dot on Devices in the menu
// all read the same query.
// Chrome asks the person before a site may reach a program on their own computer ("apps and services on this device",
// Local Network Access). Until they answer, a request waits: so every ask has a time limit, and the setup says to allow.

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
  // The status answers at once when the program runs; a longer wait is Chrome's question, or nothing there.
  const signal = AbortSignal.timeout(path === "/status" ? 4000 : 60_000);
  const res = await fetch(`${DESKTOP}${path}`, body === undefined ? { signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
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

/** Chrome's answer about reaching this computer: "granted", "prompt" (not asked or not answered yet) or "denied". */
export type LocalAccess = "granted" | "prompt" | "denied";

/**
 * Whether this page may reach programs on this computer (Chrome's Local Network Access). A browser without that
 * question counts as "granted"; null while it is being read. Follows the person's answer as it changes.
 */
export function useLocalAccess(): LocalAccess | null {
  const [state, setState] = useState<LocalAccess | null>(null);
  useEffect(() => {
    // A page on this computer itself (a local Xpot) reaches 127.0.0.1 without Chrome asking, whatever the API says.
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      setState("granted");
      return;
    }
    let status: PermissionStatus | null = null;
    let gone = false;
    const read = () => setState((status?.state as LocalAccess | undefined) ?? "granted");
    navigator.permissions
      ?.query({ name: "local-network-access" as PermissionName })
      .then((answer) => {
        if (gone) return;
        status = answer;
        read();
        answer.addEventListener("change", read);
      })
      .catch(() => !gone && setState("granted"));
    if (!navigator.permissions) setState("granted");
    return () => {
      gone = true;
      status?.removeEventListener("change", read);
    };
  }, []);
  return state;
}
