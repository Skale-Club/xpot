import { useEffect } from "react";
import { screens } from "@/lib/screens";
import { routeScreens } from "@/lib/routeScreens";

/** Warm code only, never scoped API data. Works with links and mobile buttons. */
export function NavigationPreload() {
  useEffect(() => {
    const warm = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLElement>("a[href], [data-preload-href]");
      const href = link?.dataset.preloadHref ?? link?.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      for (const name of routeScreens(url.pathname)) void screens[name].preload().catch(() => undefined);
    };
    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("focusin", warm);
    document.addEventListener("touchstart", warm, { passive: true });
    return () => {
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("focusin", warm);
      document.removeEventListener("touchstart", warm);
    };
  }, []);
  return null;
}
