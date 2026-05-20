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

export function getXpotHomePath() {
  return "/";
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
