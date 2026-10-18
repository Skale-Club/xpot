// Whether the browser's previous history entry is a screen of this app, so a
// Back button can go back to where the person came from instead of a fixed
// screen. A link opened from outside (a scanned QR, a bookmark, a new tab) has
// nothing in-app behind it.
//
// wouter patches history.pushState/replaceState to fire same-named window
// events. Every entry this app pushes is marked in its history.state; a
// replace (a redirect) keeps the mark of the entry it replaces.

const KEY = "xpotInApp";

type HistoryLike = Pick<History, "state" | "replaceState">;
type Target = { history: HistoryLike; addEventListener: (type: string, listener: () => void) => void };

const marked = (history: HistoryLike) => Boolean((history.state as Record<string, unknown> | null)?.[KEY]);

export function installInAppHistory(target: Target) {
  const { history } = target;
  // Whether the entry being shown was reached in-app; survives a replace that drops the state.
  let current = marked(history);
  const mark = () => {
    if (marked(history)) return;
    const state = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...state, [KEY]: true }, "");
  };
  target.addEventListener("pushState", () => {
    current = true;
    mark();
  });
  target.addEventListener("replaceState", () => {
    if (current) mark();
  });
  target.addEventListener("popstate", () => {
    current = marked(history);
  });
}

/** True when Back would land on a screen of this app. */
export function cameFromInApp(history: HistoryLike = window.history): boolean {
  return marked(history);
}

if (typeof window !== "undefined") installInAppHistory(window);
