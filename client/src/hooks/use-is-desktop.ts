import { useSyncExternalStore } from "react";

/** Matches Tailwind's `lg` breakpoint, where the desktop layout starts. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;

/**
 * True at `lg` and up. Use only where behaviour differs (a slider vs a button,
 * a dialog vs a side pane); layout alone should use `lg:` classes.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
