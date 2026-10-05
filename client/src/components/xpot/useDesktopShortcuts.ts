import { useEffect } from "react";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

// Dialogs, menus, select lists and popovers own the keyboard while open.
const overlayOpen = () =>
  Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'));

/** Rows of the list on screen (the desktop tables mark them with tabIndex). */
function tableRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("main table tbody tr[tabindex]"));
}

/**
 * Desktop keyboard shortcuts:
 *   Ctrl/⌘+K  search palette
 *   /         focus the screen's search field ([data-shortcut="search"])
 *   N         the screen's "new" button ([data-shortcut="new"])
 *   J / K     next / previous row in the table, opening it
 * Escape (closing a pane) lives in MasterDetail.
 */
export function useDesktopShortcuts({ enabled, onPalette }: { enabled: boolean; onPalette: () => void }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      if (isTyping(e.target) || overlayOpen()) return;

      const key = e.key.toLowerCase();
      if (key === "/") {
        const search = document.querySelector<HTMLInputElement>('[data-shortcut="search"]');
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      } else if (key === "n") {
        const add = document.querySelector<HTMLElement>('[data-shortcut="new"]');
        if (add) {
          e.preventDefault();
          add.click();
        }
      } else if (key === "j" || key === "k") {
        const rows = tableRows();
        if (!rows.length) return;
        e.preventDefault();
        const current = rows.findIndex((r) => r.getAttribute("aria-current") === "true" || r === document.activeElement);
        const next = current < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, current + (key === "j" ? 1 : -1)));
        const row = rows[next];
        row.focus();
        row.scrollIntoView({ block: "nearest" });
        row.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onPalette]);
}
