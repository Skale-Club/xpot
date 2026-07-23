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

// Query errors carry the HTTP status in the message ("401: Unauthorized"),
// which is how getQueryFn in queryClient.ts formats them.
export function getHttpStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
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
