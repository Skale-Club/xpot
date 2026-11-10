import { useLayoutEffect, useRef } from "react";
import { useLocation, useRouter, useSearch } from "wouter";

const positions = new Map<string, number>();
let previous: { scope: string; path: string; desktop: boolean; top: number } | undefined;

/** These desktop routes open a row beside (or over) its list. */
export function keepsPagePosition(from: string, to: string, desktop: boolean): boolean {
  if (from === to) return true;
  if (!desktop) return false;
  const family = (path: string) => /^(\/(?:admin\/work\/)?(?:leads|tasks)|\/admin\/reps|\/tags\/pieces)(?:\/[^/]+)?\/?$/.exec(path)?.[1];
  const source = family(from);
  return source !== undefined && source === family(to);
}

/** Page scrolling is independent of the sidebar, and of transient loading heights. */
export function usePageScroll(scope: string, desktop: boolean, pending: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [location] = useLocation();
  const router = useRouter();
  const search = useSearch();
  const pathname = `${router.base}${location}`;
  const params = new URLSearchParams(search);
  // On phones these queries open independent pages. List filters and desktop
  // tabs/panes keep their viewport instead of jumping whenever a filter changes.
  const section = !desktop && (pathname === "/settings" || /^\/organizations\/\d+\/?$/.test(pathname)) ? params.get("tab") : null;
  const event = !desktop && pathname === "/admin/health" ? params.get("event") : null;
  const path = section ? `${pathname}?tab=${encodeURIComponent(section)}` : event ? `${pathname}?event=${encodeURIComponent(event)}` : pathname;

  useLayoutEffect(() => {
    if (pending) return;
    const key = `xpot.pageScroll.${scope}.${desktop ? "desktop" : "phone"}.${path}`;
    let saved = positions.get(key);
    if (saved === undefined) {
      try {
        const raw = window.sessionStorage.getItem(key);
        if (raw !== null) saved = Number(raw);
      } catch { /* Memory still works with storage disabled. */ }
    }
    const sameList = previous?.scope === scope && previous.desktop === desktop && keepsPagePosition(previous.path, path, desktop);
    const top = sameList ? previous!.top : saved !== undefined && Number.isFinite(saved) && saved >= 0 ? saved : 0;
    let restoring = true;
    const oldRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const entry = { scope, path, desktop, top };
    previous = entry;
    const remember = () => {
      // A skeleton or hidden Suspense tree is shorter than the real page.
      if (restoring || !ref.current || ref.current.getClientRects().length === 0) return;
      entry.top = window.scrollY;
      positions.set(key, entry.top);
      try { window.sessionStorage.setItem(key, String(entry.top)); } catch { /* Kept in memory. */ }
    };
    const restore = () => {
      if (!restoring || !ref.current || ref.current.getClientRects().length === 0) return;
      window.scrollTo({ top, left: 0, behavior: "instant" });
      if (Math.abs(window.scrollY - top) < 1) {
        restoring = false;
        remember();
      }
    };
    const interrupt = () => { restoring = false; remember(); };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interrupt();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
    observer?.observe(document.body);
    if (ref.current) observer?.observe(ref.current);
    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);
    restore();
    return () => {
      // Do not record during teardown: the old content may already be gone.
      observer?.disconnect();
      window.removeEventListener("scroll", remember);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", onKey);
      window.history.scrollRestoration = oldRestoration;
    };
  }, [scope, path, desktop, pending]);

  return ref;
}
