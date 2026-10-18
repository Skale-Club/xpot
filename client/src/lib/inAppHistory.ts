// Whether the browser's previous history entry is a screen of this app, so a
// Back button can go back to where the person came from instead of a fixed
// screen. A link opened from outside (a scanned QR, a bookmark, a new tab) has
// nothing in-app behind it.
//
// wouter patches history.pushState/replaceState to fire same-named window
// events. Every entry this app pushes is marked in its history.state; a
// replace (a redirect) keeps the mark of the entry it replaces. With a
// `location` the mark also records the screen the entry was pushed from
// (previousInAppPath), so a Back button can say where it goes.

const KEY = "xpotInApp";
const FROM = "xpotFrom";

type HistoryLike = Pick<History, "state" | "replaceState">;
type Target = {
  history: HistoryLike;
  location?: Pick<Location, "pathname" | "search">;
  addEventListener: (type: string, listener: () => void) => void;
};

const marked = (history: HistoryLike) => Boolean((history.state as Record<string, unknown> | null)?.[KEY]);
const fromOf = (history: HistoryLike) => {
  const from = (history.state as Record<string, unknown> | null)?.[FROM];
  return typeof from === "string" ? from : null;
};

export function installInAppHistory(target: Target) {
  const { history, location } = target;
  const here = () => (location ? `${location.pathname}${location.search}` : null);
  // Whether the entry being shown was reached in-app; survives a replace that drops the state.
  let current = marked(history);
  // The screen it was pushed from, and the screen on show (to be the next entry's "from").
  let currentFrom = fromOf(history);
  let shown = here();
  const mark = () => {
    if (marked(history) && fromOf(history) === currentFrom) return;
    const state = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...state, [KEY]: true, ...(currentFrom ? { [FROM]: currentFrom } : {}) }, "");
  };
  target.addEventListener("pushState", () => {
    current = true;
    currentFrom = shown;
    shown = here();
    mark();
  });
  target.addEventListener("replaceState", () => {
    shown = here();
    if (current) mark();
  });
  target.addEventListener("popstate", () => {
    current = marked(history);
    currentFrom = fromOf(history);
    shown = here();
  });
}

/** True when Back would land on a screen of this app. */
export function cameFromInApp(history: HistoryLike = window.history): boolean {
  return marked(history);
}

/** The app screen (path and query) Back would land on, when the app knows it; else null. */
export function previousInAppPath(history: HistoryLike = window.history): string | null {
  return marked(history) ? fromOf(history) : null;
}

/**
 * Whether Back leads to an app screen outside `prefix`: a company opened from
 * the Route, a task or a visit goes back there, not to the companies list.
 */
export function backLeavesSection(prefix: string, history: HistoryLike = window.history): boolean {
  const from = previousInAppPath(history);
  if (!from) return false;
  const path = from.split(/[?#]/, 1)[0];
  return path !== prefix && !path.startsWith(`${prefix}/`);
}

if (typeof window !== "undefined") installInAppHistory(window);
