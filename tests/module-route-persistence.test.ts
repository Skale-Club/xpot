import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearModuleRoutes, isModuleRoute, moduleEntryPath, rememberModuleRoute } from "../client/src/lib/xpot";

describe("module route persistence", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns to the exact Route screen and its query", () => {
    rememberModuleRoute("visits", "/route?visit=active");
    expect(moduleEntryPath("visits")).toBe("/route?visit=active");
  });

  it("remembers the last Tags work screen independently", () => {
    rememberModuleRoute("tags", "/tags/customers");
    expect(moduleEntryPath("tags")).toBe("/tags/customers");
    expect(moduleEntryPath("visits")).toBe("/dashboard");
  });

  it("never restores account, management or another module's route", () => {
    for (const route of ["/settings", "/admin/overview", "/tags/pieces"]) {
      expect(isModuleRoute("visits", route)).toBe(false);
      rememberModuleRoute("visits", route);
    }
    expect(moduleEntryPath("visits")).toBe("/dashboard");
  });

  it("clears remembered screens when the user signs out", () => {
    rememberModuleRoute("visits", "/route");
    rememberModuleRoute("tags", "/tags/customers");
    clearModuleRoutes();
    expect(moduleEntryPath("visits")).toBe("/dashboard");
    expect(moduleEntryPath("tags")).toBe("/tags");
  });
});
