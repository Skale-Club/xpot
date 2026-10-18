// Back buttons go back in history only when the previous entry is a screen of
// the app (client/src/lib/inAppHistory.ts), driven here by a fake history that
// fires wouter's pushState/replaceState events.
import { describe, expect, it } from "vitest";
import { cameFromInApp, installInAppHistory } from "../client/src/lib/inAppHistory";

function fakeBrowser(initialState: unknown = null) {
  const listeners = new Map<string, Array<() => void>>();
  const entries: unknown[] = [initialState];
  let index = 0;
  const fire = (type: string) => (listeners.get(type) ?? []).forEach((listener) => listener());
  const history = {
    get state() { return entries[index]; },
    replaceState(state: unknown) { entries[index] = state; fire("replaceState"); },
  };
  return {
    target: { history, addEventListener: (type: string, listener: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]) },
    history,
    push(state: unknown = null) { entries.splice(index + 1); entries.push(state); index += 1; fire("pushState"); },
    replace(state: unknown = null) { history.replaceState(state); },
    back() { index -= 1; fire("popstate"); },
  };
}

describe("in-app history", () => {
  it("an entry opened from outside has nothing in-app behind it", () => {
    const browser = fakeBrowser();
    installInAppHistory(browser.target);
    expect(cameFromInApp(browser.history)).toBe(false);
    // A redirect on the first screen keeps it an outside entry.
    browser.replace();
    expect(cameFromInApp(browser.history)).toBe(false);
  });

  it("a screen the app pushed can go back, even after a redirect replaced it", () => {
    const browser = fakeBrowser();
    installInAppHistory(browser.target);
    browser.push();
    expect(cameFromInApp(browser.history)).toBe(true);
    // /tags/pieces/<code> redirecting to /tags/t/<code> on a phone.
    browser.replace(null);
    expect(cameFromInApp(browser.history)).toBe(true);
    browser.back();
    expect(cameFromInApp(browser.history)).toBe(false);
  });

  it("keeps what the app stored in the entry's state", () => {
    const browser = fakeBrowser();
    installInAppHistory(browser.target);
    browser.push({ scroll: 120 });
    expect(browser.history.state).toEqual({ scroll: 120, xpotInApp: true });
  });
});
