// PWA launch helpers.
//
// A browser tab and the installed app want different things from "/": the tab
// should get the marketing landing, the installed app should go straight to the
// rep's workspace. resolveRootView() is the single place that decision is made,
// kept pure so every branch is testable without a DOM (see tests/pwa-root-view).

// True when running as an installed PWA (iOS home-screen app, Android WebAPK,
// desktop installed app) rather than a normal browser tab.
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
    // iOS Safari legacy flag — still the only reliable signal on older iOS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** The HTTP status of a failed request: ApiError carries it; older errors had it as a "401: …" prefix. */
export function getHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  const match = /^(\d+):/.exec(error.message);
  return match ? Number(match[1]) : null;
}

export type RootView = "landing" | "loading" | "workspace";

export function resolveRootView(input: {
  standalone: boolean;
  isLoading: boolean;
  hasSession: boolean;
  error: unknown;
}): RootView {
  const { standalone, isLoading, hasSession, error } = input;

  // Browser tab — "/" is the public landing, no session lookup involved.
  if (!standalone) return "landing";

  // Installed app: resolve the session before painting, so a signed-in rep
  // never sees the marketing page's "Sign In" button flash on launch.
  if (isLoading) return "loading";
  if (hasSession) return "workspace";

  const status = getHttpStatus(error);

  // Only 401/403 mean "signed out". A dropped request on a weak field signal
  // must not dump the rep on the marketing page as if their session died —
  // hand it to the app shell, which shows a proper retry state.
  if (error && status !== 401 && status !== 403) return "workspace";

  return "landing";
}

// ── Install entry ────────────────────────────────────────────────────────────
//
// The app offers installation passively: an "Install app" item in the sidebar
// and in Settings, never a banner or a pop-up. How it installs depends on the
// browser, and resolveInstallMode() is where that is decided (pure, tested in
// tests/pwa-install-mode).
//
//   prompt     Chromium (Android, desktop Chrome/Edge) handed us its install
//              prompt; the button opens it.
//   ios        iPhone/iPad: no prompt API, so the button explains Share → Add
//              to Home Screen.
//   safari-mac Safari 17+ on macOS: File → Add to Dock.
//   hidden     Already installed, or a browser that can't install (Firefox
//              desktop, Chromium before it decides the app is installable).

export type InstallMode = "prompt" | "ios" | "safari-mac" | "hidden";

export function resolveInstallMode(input: {
  standalone: boolean;
  installed: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): InstallMode {
  const { standalone, installed, hasPrompt, userAgent, maxTouchPoints } = input;
  if (standalone || installed) return "hidden";
  if (hasPrompt) return "prompt";

  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return "ios";

  const isMacSafari =
    /Macintosh/.test(userAgent) &&
    /Version\/(\d+)/.test(userAgent) &&
    Number(/Version\/(\d+)/.exec(userAgent)?.[1]) >= 17 &&
    /Safari\//.test(userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(userAgent);
  if (isMacSafari) return "safari-mac";

  return "hidden";
}
