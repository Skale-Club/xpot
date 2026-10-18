import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { previousInAppPath } from "@/lib/inAppHistory";

// The dirty screen's way to hold an in-app move that is not a link click (a
// tab strip that navigates in code, like the admin's phone tabs); null while
// nothing is dirty.
let holder: ((href: string) => void) | null = null;

/** Makes `hold` receive the moves navigateGuarded sees; returns the release. */
export function holdNavigation(hold: (href: string) => void): () => void {
  holder = hold;
  return () => {
    if (holder === hold) holder = null;
  };
}

/**
 * A move made in code: while a screen has unsaved changes it asks first (the
 * same question as a link click), else it goes straight there. Staying on the
 * same path (a ?tab= change) never asks.
 */
export function navigateGuarded(href: string, navigate: (to: string) => void, currentPath = window.location.pathname) {
  const path = new URL(href, "http://xpot.local").pathname;
  if (holder && path !== currentPath) holder(href);
  else navigate(href);
}

// Back and Forward fire popstate, and the router re-renders on it: a held move
// must be undone before that, or the other screen mounts and the edits are
// gone. Listeners on window run in the order they were added, so this one is
// added when the app starts (main.tsx imports this module before the router
// subscribes) and passes the event to whichever screen holds moves now.
const popHolders = new Set<() => void>();
const listenFirst = (onPop: () => void) => {
  popHolders.add(onPop);
  return () => {
    popHolders.delete(onPop);
  };
};
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    Array.from(popHolders).forEach((onPop) => onPop());
  });
}

type HistoryTarget = {
  history: Pick<History, "state" | "pushState">;
  location: Pick<Location, "pathname" | "search" | "hash">;
};

/**
 * Back and Forward, which no click handler sees. While installed, a history
 * move to another path is undone at once (the screen stays, edits and all) and
 * handed to `hold` with where it was going, and whether that is `from` (the
 * screen this one was opened from, so Back is what leaving should replay).
 * Moves within the path (a ?tab=, a side pane) pass. `listen` registers the
 * popstate handler (by default ahead of the router's, see above).
 */
export function holdHistoryMoves(
  target: HistoryTarget,
  hold: (href: string, back: boolean) => void,
  from: string | null,
  listen: (onPop: () => void) => () => void = listenFirst,
): () => void {
  const { history, location } = target;
  const path = location.pathname;
  let href = `${location.pathname}${location.search}${location.hash}`;
  let state: unknown = history.state;
  return listen(() => {
    const next = `${location.pathname}${location.search}${location.hash}`;
    if (location.pathname === path) {
      href = next;
      state = history.state;
      return;
    }
    const back = from != null && `${location.pathname}${location.search}` === from;
    history.pushState(state, "", href);
    hold(next, back);
  });
}

/**
 * While `dirty`, leaving the screen asks first: closing or reloading the tab gets
 * the browser's own prompt, and a click on an in-app link, a move made through
 * navigateGuarded or the browser's Back / Forward is held until the person
 * confirms. Returns the held destination (null when none) and the two answers;
 * the screen renders its own dialog.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<{ href: string; back: boolean } | null>(null);
  const releaseHistory = useRef<() => void>(() => {});

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Capture phase, on the document: it runs before the router's own click handler.
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = `${url.pathname}${url.search}${url.hash}`;
      if (url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ href, back: false });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    const release = holdNavigation((href) => setPending({ href, back: false }));
    const releaseMoves = holdHistoryMoves(window, (href, back) => setPending({ href, back }), previousInAppPath());
    releaseHistory.current = releaseMoves;
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      release();
      releaseMoves();
      releaseHistory.current = () => {};
    };
  }, [dirty]);

  return {
    pendingHref: pending?.href ?? null,
    stay: () => setPending(null),
    leave: () => {
      const held = pending;
      setPending(null);
      if (!held) return;
      // A held Back goes back for real, so the history stays as it was; anything else is a new move.
      if (held.back) {
        releaseHistory.current();
        window.history.back();
      } else {
        navigate(held.href);
      }
    },
  };
}
