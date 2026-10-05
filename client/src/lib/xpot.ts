// Path helpers for the standalone Xpot app.
//
// In the original skaleclub monorepo Xpot was mounted under /xpot/* alongside
// the marketing site. As a standalone app, Xpot is the root — so /xpot is gone
// and every page lives at its own top-level path (/, /login, /dashboard, etc.).
//
// These helpers are kept as a thin layer so callers don't hard-code paths.

function normalizePath(path = "/") {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getXpotPath(path = "/") {
  return normalizePath(path);
}

/** The landing page of each module; the one place that says it (sign-in, the module switch, "back"). */
export const MODULE_HOME = { visits: "/dashboard", tags: "/tags" } as const;

/** Where a signed-in rep lands: the Tags module if that was the last one used. */
export function getXpotHomePath() {
  try {
    if (window.localStorage.getItem("xpot.module") === "tags") return MODULE_HOME.tags;
  } catch {
    // Storage blocked: default to Visits.
  }
  return MODULE_HOME.visits;
}

export function getXpotLoginPath() {
  return "/login";
}

// Extract the section slug from a pathname — e.g. "/leads" → "leads".
// Used by useXpotQueries to drive the active-tab state from the URL.
export function getXpotSection(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  const [section] = pathname.split("/").filter(Boolean);
  return section || null;
}

// --- Post-login return target -------------------------------------------------
//
// /oauth/authorize (an AI app connecting to the MCP endpoint) sends a visitor
// with no session to "/?next=/oauth/authorize?…". The target is kept in
// sessionStorage because Google sign-in detours through /login, which drops
// the query string.

const POST_LOGIN_KEY = "xpot_post_login_redirect";

/** Same-origin absolute paths only: never another origin, never a scheme. */
function isSafeInternalPath(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

/** Moves ?next= into sessionStorage. True when a target is now pending. */
export function rememberPostLoginRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!isSafeInternalPath(next)) return false;
  try {
    sessionStorage.setItem(POST_LOGIN_KEY, next);
    return true;
  } catch {
    // sessionStorage can throw (private mode): the user lands on the dashboard.
    return false;
  }
}

/** Reads and clears the pending target, or null. */
export function consumePostLoginRedirect(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const next = sessionStorage.getItem(POST_LOGIN_KEY);
    sessionStorage.removeItem(POST_LOGIN_KEY);
    return isSafeInternalPath(next) ? next : null;
  } catch {
    return null;
  }
}
