// The palette footer lists only the shortcuts the screen behind it supports
// (components/xpot/useDesktopShortcuts.ts): "N new" where a page marks its new
// button, "J/K" over a table of rows.
import { describe, expect, it } from "vitest";
import { availableShortcuts } from "../client/src/components/xpot/CommandPalette";

const page = (...present: string[]) => ({ querySelector: (selector: string) => (present.includes(selector) ? ({} as Element) : null) });

describe("availableShortcuts", () => {
  it("leaves out N and J/K where the screen has neither", () => {
    expect(availableShortcuts(page())).toEqual(["search"]);
  });
  it("offers them where the page registers them", () => {
    expect(availableShortcuts(page('[data-shortcut="new"]', "main table tbody tr[tabindex]"))).toEqual(["search", "new", "rows"]);
  });
});
