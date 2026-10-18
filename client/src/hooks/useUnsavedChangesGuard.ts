import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/**
 * While `dirty`, leaving the screen asks first: closing or reloading the tab gets
 * the browser's own prompt, and a click on an in-app link is held until the
 * person confirms. Returns the held destination (null when none) and the two
 * answers; the screen renders its own dialog.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const [, navigate] = useLocation();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

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
      setPendingHref(href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  return {
    pendingHref,
    stay: () => setPendingHref(null),
    leave: () => {
      const href = pendingHref;
      setPendingHref(null);
      if (href) navigate(href);
    },
  };
}
