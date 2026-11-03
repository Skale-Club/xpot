// The last panel screen used, kept for this browser session so "My company" (the account menu's way into the
// panel) comes back to it instead of always opening Today. Someone without a panel never writes it.

const PANEL_ROUTE_KEY = "xpot.route.v1.panel";

/** Remember the panel screen in use (this browser session), so the way back into the panel returns to it. */
export function rememberPanelRoute(route: string): void {
  try { window.sessionStorage.setItem(PANEL_ROUTE_KEY, route); } catch { /* The panel opens on Today. */ }
}

/** The last panel screen used, or Today. */
export function panelEntryPath(): string {
  try {
    const route = window.sessionStorage.getItem(PANEL_ROUTE_KEY);
    if (route && /^\/(?:admin|organizations)(?:[/?]|$)/.test(route)) return route;
  } catch { /* Storage blocked. */ }
  return "/admin";
}

export function clearPanelRoute(): void {
  try { window.sessionStorage.removeItem(PANEL_ROUTE_KEY); } catch { /* Nothing to clear. */ }
}
