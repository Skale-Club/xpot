// Sends the browser's crashes to Admin › System health (POST /api/xpot/client-errors).
// Best effort and quiet: a report that fails is dropped, the same error is sent
// once per page load, and the server throttles a looping page.

type Kind = "error" | "unhandledrejection" | "render";

const sent = new Set<string>();
const MAX_PER_PAGE = 20;

/** Noise the app cannot act on (extensions, a resize loop, a dropped network). */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:\/\//i, /Failed to fetch dynamically imported module/i];

export function reportClientError(error: unknown, kind: Kind, componentStack?: string) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error value thrown");
  const message = (err.message || err.name || "Unknown error").slice(0, 1000);
  if (IGNORED.some((pattern) => pattern.test(message) || pattern.test(err.stack ?? ""))) return;
  const key = `${kind}:${message}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
  sent.add(key);
  try {
    void fetch("/api/xpot/client-errors", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        kind,
        stack: err.stack?.slice(0, 8000),
        componentStack: componentStack?.slice(0, 4000),
        url: window.location.pathname.slice(0, 500),
        userAgent: navigator.userAgent.slice(0, 400),
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never be the next crash.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener("error", (event) => reportClientError(event.error ?? event.message, "error"));
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "unhandledrejection"));
}
