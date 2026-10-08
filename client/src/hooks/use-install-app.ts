import { useCallback, useSyncExternalStore } from "react";
import { isStandaloneDisplay, resolveInstallMode, type InstallMode } from "@/lib/pwa";

// Chromium's install prompt, held for the "Install app" button.
//
// `beforeinstallprompt` can fire before React mounts, so the listener is
// attached when this module loads (main.tsx imports it first). preventDefault()
// keeps Chrome on Android from showing its own mini-infobar: installing is
// offered only where the rep goes looking for it, never pushed at them.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

// A snapshot string, so useSyncExternalStore compares by value.
function snapshot(): InstallMode {
  if (typeof window === "undefined") return "hidden";
  return resolveInstallMode({
    standalone: isStandaloneDisplay(),
    installed,
    hasPrompt: deferred !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * How this browser can install the app, and a trigger for the native prompt.
 * `install()` resolves true when the rep accepted; in "ios"/"safari-mac" mode
 * there is no prompt and the caller shows instructions instead.
 */
export function useInstallApp() {
  const mode = useSyncExternalStore(subscribe, snapshot, () => "hidden" as InstallMode);
  const install = useCallback(async () => {
    const prompt = deferred;
    if (!prompt) return false;
    // A prompt can only be used once.
    deferred = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") installed = true;
    emit();
    return outcome === "accepted";
  }, []);
  return { mode, install };
}
