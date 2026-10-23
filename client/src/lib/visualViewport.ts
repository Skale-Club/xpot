// The part of the screen the phone keyboard leaves visible.
//
// A phone keyboard does not shrink the layout viewport on iOS (nor on Android
// without interactive-widget), so anything fixed and centred (a dialog, a
// sheet) sits half behind it. This module keeps two CSS variables on <html>
// in step with window.visualViewport, which does shrink:
//
//   --app-vvh     height of the visible area (falls back to 100dvh in CSS)
//   --app-vv-top  how far the visible area is scrolled down the layout viewport
//
// and sets html[data-keyboard="open"] while a text field has the keyboard up,
// so bars that would ride on top of it (the phone tab bar) can step aside.
// It also brings the focused field back into view when the keyboard covers it.
//
// Imported once for its side effect from main.tsx.

/** Shrink of the visible area, in px, that counts as a keyboard rather than a toolbar collapsing. */
const KEYBOARD_MIN_PX = 120;
const EDGE_GAP_PX = 12;

/** The visible area in layout-viewport coordinates (what getBoundingClientRect and position: fixed use). */
export function visibleViewport(): { top: number; height: number; bottom: number } {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const height = vv?.height ?? (typeof window === "undefined" ? 0 : window.innerHeight);
  return { top, height, bottom: top + height };
}

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(el.type);
}

function install() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  // Only a touch screen has an on-screen keyboard; on a computer a window made
  // shorter while a field has focus is not one.
  const touch = window.matchMedia?.("(pointer: coarse)");
  // Tallest visible area seen at this width: the reference a keyboard shrinks from.
  // Android with interactive-widget=resizes-content shrinks innerHeight too, so
  // innerHeight alone cannot tell a keyboard apart.
  let baseline = { width: 0, height: 0 };
  let keyboardOpen = false;
  let frame = 0;

  const revealFocused = () => {
    const el = document.activeElement;
    if (!isTextEntry(el)) return;
    const rect = el.getBoundingClientRect();
    const view = visibleViewport();
    if (rect.top >= view.top + EDGE_GAP_PX && rect.bottom <= view.bottom - EDGE_GAP_PX) return;
    el.scrollIntoView({ block: "center", inline: "nearest" });
  };

  const sync = () => {
    frame = 0;
    const width = Math.round(vv.width);
    const height = vv.height;
    if (width !== baseline.width) baseline = { width, height };
    else if (height > baseline.height) baseline.height = height;

    root.style.setProperty("--app-vvh", `${height}px`);
    root.style.setProperty("--app-vv-top", `${vv.offsetTop}px`);

    const open = Boolean(touch?.matches) && isTextEntry(document.activeElement) && baseline.height - height > KEYBOARD_MIN_PX;
    if (open !== keyboardOpen) {
      keyboardOpen = open;
      if (open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    }
    // The dialog around the field has just been resized to the new visible area.
    if (open) window.requestAnimationFrame(revealFocused);
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(sync);
  };

  vv.addEventListener("resize", schedule);
  vv.addEventListener("scroll", schedule);
  // Focus moving out of a field closes the keyboard state even before the viewport grows back.
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  sync();
}

if (typeof window !== "undefined") install();
