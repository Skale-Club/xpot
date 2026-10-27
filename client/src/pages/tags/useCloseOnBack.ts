import { useEffect, useRef } from "react";

// The phone's Back closes an open sheet instead of leaving the screen behind
// it (the chip sheets: writing, locking, erasing). Opening the sheet adds a
// history entry; Back pops it and the sheet closes. Closing the sheet any
// other way takes that entry off again, so the next Back leaves the screen as
// usual.
//
// One sheet can close and another open at once (Write, then Lock): the entry
// of the first is still being taken off when the second opens. That second
// sheet waits for it before adding its own, and ignores the Back the first one
// asked for.

let seq = 0;
/** Backs our own sheets asked for (closing without Back), still to arrive. */
let ownBacks = 0;
/** True while the popstate of one of those is being dispatched. */
let ignoring = false;
const afterOwnBack: Array<() => void> = [];
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // Capture: runs before the sheets' own listeners for the same event.
  window.addEventListener("popstate", () => {
    if (ownBacks === 0) return;
    ownBacks--;
    ignoring = true;
    queueMicrotask(() => {
      ignoring = false;
      if (ownBacks === 0) afterOwnBack.splice(0).forEach((run) => run());
    });
  }, true);
}

export function useCloseOnBack(open: boolean, onClose: () => void, enabled = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !enabled || typeof window === "undefined") return;
    listen();
    const id = ++seq;
    let pushed = false;
    let popped = false;
    let done = false;
    const push = () => {
      if (done) return;
      window.history.pushState({ ...(window.history.state ?? {}), xpotSheet: id }, "");
      pushed = true;
    };
    const onPop = () => {
      if (ignoring || !pushed || done) return;
      // A Back from a sheet opened over this one leaves this one open.
      if ((window.history.state as { xpotSheet?: number } | null)?.xpotSheet === id) return;
      popped = true;
      closeRef.current();
    };
    if (ownBacks > 0) afterOwnBack.push(push);
    else push();
    window.addEventListener("popstate", onPop);
    return () => {
      done = true;
      window.removeEventListener("popstate", onPop);
      // Closed with a button, Escape or a tap outside: take our entry off. Not when Back closed
      // it, nor when the screen moved on (a new entry is on top: leave history alone).
      if (pushed && !popped && (window.history.state as { xpotSheet?: number } | null)?.xpotSheet === id) {
        ownBacks++;
        window.history.back();
      }
    };
  }, [open, enabled]);
}
