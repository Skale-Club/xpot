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

/**
 * A real pointer-and-keyboard computer, not a tablet that happens to be wide.
 * Use it for what depends on the device rather than the width: starting a
 * GPS check-in, scanning with the camera.
 */
export const COMPUTER_QUERY = `${DESKTOP_QUERY} and (hover: hover) and (pointer: fine)`;

function subscribeComputer(onChange: () => void) {
  const mql = window.matchMedia(COMPUTER_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsComputer(): boolean {
  return useSyncExternalStore(subscribeComputer, () => window.matchMedia(COMPUTER_QUERY).matches, () => false);
}
