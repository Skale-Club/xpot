// A screen with unsaved changes (the Landing editor, Integrations) must be
// asked before any in-app move, including the admin's phone tab strip, which
// navigates in code, and the browser's Back / Forward.

import { describe, expect, it, vi } from "vitest";
import { holdHistoryMoves, holdNavigation, navigateGuarded } from "../client/src/hooks/useUnsavedChangesGuard";
import { withDirty } from "../client/src/pages/admin/unsavedEdits";

describe("navigateGuarded", () => {
  it("goes straight there while nothing is dirty", () => {
    const navigate = vi.fn();
    navigateGuarded("/admin/health", navigate, "/admin/landing");
    expect(navigate).toHaveBeenCalledWith("/admin/health");
  });

  it("hands the move to the dirty screen instead of leaving", () => {
    const navigate = vi.fn();
    const hold = vi.fn();
    const release = holdNavigation(hold);
    navigateGuarded("/admin/health", navigate, "/admin/landing");
    expect(hold).toHaveBeenCalledWith("/admin/health");
    expect(navigate).not.toHaveBeenCalled();
    release();
    navigateGuarded("/admin/health", navigate, "/admin/landing");
    expect(navigate).toHaveBeenCalledWith("/admin/health");
  });

  it("never asks for a move that stays on the same path", () => {
    const navigate = vi.fn();
    const hold = vi.fn();
    const release = holdNavigation(hold);
    navigateGuarded("/admin/branding?tab=app", navigate, "/admin/branding");
    expect(navigate).toHaveBeenCalledWith("/admin/branding?tab=app");
    expect(hold).not.toHaveBeenCalled();
    release();
  });

  it("a stale release does not drop a newer screen's hold", () => {
    const first = holdNavigation(vi.fn());
    const hold = vi.fn();
    const second = holdNavigation(hold);
    first();
    navigateGuarded("/settings", vi.fn(), "/admin/landing");
    expect(hold).toHaveBeenCalledWith("/settings");
    second();
  });
});

// Back and Forward never reach a click handler: the guard undoes the move
// before the router renders the other screen, and replays it on "Leave".
function fakeWindow(pathname: string, search = "") {
  const listeners: Array<() => void> = [];
  const target = {
    location: { pathname, search, hash: "" },
    history: {
      state: { marker: "B" } as unknown,
      pushState: vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
        const parsed = new URL(String(url), "http://xpot.local");
        target.location.pathname = parsed.pathname;
        target.location.search = parsed.search;
        target.history.state = state;
      }),
    },
    listen: (fn: () => void) => {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    /** The browser moved to `href` (Back or Forward) and fires popstate. */
    pop(href: string, state: unknown = null) {
      const parsed = new URL(href, "http://xpot.local");
      target.location.pathname = parsed.pathname;
      target.location.search = parsed.search;
      target.history.state = state;
      for (const l of [...listeners]) l();
    },
    listeners,
  };
  return target;
}

describe("holdHistoryMoves", () => {
  it("undoes a Back to another screen and says it was Back", () => {
    const win = fakeWindow("/admin/integrations");
    const hold = vi.fn();
    holdHistoryMoves(win, hold, "/admin/health", win.listen);
    win.pop("/admin/health");
    expect(win.history.pushState).toHaveBeenCalledWith({ marker: "B" }, "", "/admin/integrations");
    expect(win.location.pathname).toBe("/admin/integrations");
    expect(hold).toHaveBeenCalledWith("/admin/health", true);
  });

  it("holds a Forward (or a Back past the opener) as a plain move", () => {
    const win = fakeWindow("/admin/integrations");
    const hold = vi.fn();
    holdHistoryMoves(win, hold, "/admin/health", win.listen);
    win.pop("/settings?tab=memberships");
    expect(hold).toHaveBeenCalledWith("/settings?tab=memberships", false);
  });

  it("lets moves within the screen pass and restores to where it now is", () => {
    const win = fakeWindow("/admin/tags/pieces", "?piece=a");
    const hold = vi.fn();
    holdHistoryMoves(win, hold, null, win.listen);
    win.pop("/admin/tags/pieces?piece=b", { marker: "pane-b" });
    expect(hold).not.toHaveBeenCalled();
    expect(win.history.pushState).not.toHaveBeenCalled();
    win.pop("/admin/tags/overview");
    expect(win.history.pushState).toHaveBeenCalledWith({ marker: "pane-b" }, "", "/admin/tags/pieces?piece=b");
    expect(hold).toHaveBeenCalledWith("/admin/tags/overview", false);
  });

  it("stops holding once released", () => {
    const win = fakeWindow("/admin/integrations");
    const hold = vi.fn();
    const release = holdHistoryMoves(win, hold, null, win.listen);
    release();
    win.pop("/admin/health");
    expect(hold).not.toHaveBeenCalled();
    expect(win.location.pathname).toBe("/admin/health");
  });
});

describe("withDirty (Integrations' cards with unsaved edits)", () => {
  it("adds and removes a card, and returns the same set when nothing changes", () => {
    const none: ReadonlySet<string> = new Set();
    const one = withDirty(none, "provider:twilio", true);
    expect([...one]).toEqual(["provider:twilio"]);
    expect(withDirty(one, "provider:twilio", true)).toBe(one);
    expect(withDirty(none, "xphere:4", false)).toBe(none);
    const two = withDirty(one, "xphere:4", true);
    expect([...withDirty(two, "provider:twilio", false)]).toEqual(["xphere:4"]);
  });
});
