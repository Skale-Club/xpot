// Paths of the standalone Xpot app: where each module lands, where a signed-in rep
// goes, and the post-login return target. (Xpot used to live under /xpot/* in the
// Skale Club monorepo; every page is at its own top-level path now.)

/** localStorage key of the module used last (sign-in lands there). */
export const LAST_MODULE_KEY = "xpot.module";

/** The landing page of each module; the one place that says it (sign-in, the module switch, "back"). */
export const MODULE_HOME = { visits: "/dashboard", tags: "/tags" } as const;

/** Where a signed-in rep lands: the Tags module if that was the last one used. */
export function getXpotHomePath() {
  try {
    if (window.localStorage.getItem(LAST_MODULE_KEY) === "tags") return MODULE_HOME.tags;
  } catch {
    // Storage blocked: default to Visits.
  }
  return MODULE_HOME.visits;
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
