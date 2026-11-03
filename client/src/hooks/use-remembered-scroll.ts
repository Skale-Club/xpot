import { useCallback, useLayoutEffect, useRef } from "react";

// Also works when the browser blocks storage. Keys describe the menu, not the
// current page: every screen in the same workspace shares its position.
const positions = new Map<string, number>();
const PREFIX = "xpot.scroll.";

export function useRememberedScroll<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  const remember = useCallback(() => {
    const element = ref.current;
    // Suspense and the phone breakpoint can hide the desktop menu. A hidden
    // element's zero must never replace the last visible position.
    if (!element || element.clientHeight === 0) return;
    positions.set(key, element.scrollTop);
    try { window.sessionStorage.setItem(PREFIX + key, String(element.scrollTop)); } catch { /* Kept in memory. */ }
  }, [key]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let top = positions.get(key);
    if (top === undefined) {
      try { top = Number(window.sessionStorage.getItem(PREFIX + key)); } catch { /* Storage can be blocked. */ }
    }
    const restore = () => {
      const saved = positions.get(key) ?? top;
      if (saved !== undefined && Number.isFinite(saved) && saved >= 0) element.scrollTop = saved;
    };
    // Restore before paint, including when a lazy route replaces its loader.
    let visible = element.clientHeight > 0;
    if (visible) restore();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const shown = element.clientHeight > 0;
      if (shown && !visible) restore();
      visible = shown;
    });
    observer?.observe(element);
    // Scroll and clicks save while the menu is still visible. Cleanup must
    // not save: removed children may already have clamped scrollTop to zero.
    return () => observer?.disconnect();
  }, [key]);

  return { ref, remember };
}
