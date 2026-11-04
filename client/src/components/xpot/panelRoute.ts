import { panelHome, type Panel } from "./panels";

// The last screen used in each management panel (Admin, Production), kept for this browser session so the selector comes
// back to it instead of always opening Today. Someone without a panel never writes it.

const PANEL_ROUTE_KEY = "xpot.route.v1.panel";
const PANELS: Panel[] = ["admin", "production"];
const keyOf = (panel: Panel) => `${PANEL_ROUTE_KEY}.${panel}`;

/** Remember the screen in use in a panel (this browser session), so the way back into the panel returns to it. */
export function rememberPanelRoute(route: string, panel: Panel): void {
  try { window.sessionStorage.setItem(keyOf(panel), route); } catch { /* The panel opens on Today. */ }
}

/** The last screen used in a panel, or its Today. */
export function panelEntryPath(panel: Panel): string {
  try {
    const route = window.sessionStorage.getItem(keyOf(panel));
    if (route && /^\/(?:admin|organizations)(?:[/?]|$)/.test(route)) return route;
  } catch { /* Storage blocked. */ }
  return panelHome(panel);
}

export function clearPanelRoute(): void {
  // The key without a panel is the one an owner's old panel wrote.
  try { for (const key of [PANEL_ROUTE_KEY, ...PANELS.map(keyOf)]) window.sessionStorage.removeItem(key); } catch { /* Nothing to clear. */ }
}
