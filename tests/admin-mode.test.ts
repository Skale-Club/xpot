// Management mode is a view on this device (client/src/lib/adminMode.ts): off,
// every API call asks to see the app as a rep. Signing out forgets it, so the
// next account on the device starts with it off.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("management mode", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    values = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is off by default: lists come back as a rep's", async () => {
    const { viewHeaders } = await import("../client/src/lib/adminMode");
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "rep" });
  });

  it("on, the headers ask for the management view, and the choice is remembered", async () => {
    const { setAdminMode, viewHeaders } = await import("../client/src/lib/adminMode");
    setAdminMode(true);
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "manage" });
    expect(values.get("xpot.adminMode")).toBe("1");
  });

  it("signing out forgets it", async () => {
    values.set("xpot.adminMode", "1");
    const { clearAdminMode, viewHeaders } = await import("../client/src/lib/adminMode");
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "manage" });
    clearAdminMode();
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "rep" });
    expect(values.has("xpot.adminMode")).toBe(false);
  });
});
