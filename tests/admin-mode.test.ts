import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceForPath, workspaceHeaders } from "../client/src/lib/workspace";

describe("separate personal and management workspaces", () => {
  const values = new Map<string, string>();
  const location = { pathname: "/tags" };
  beforeEach(() => {
    values.clear();
    location.pathname = "/tags";
    vi.stubGlobal("window", { location, localStorage: { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("uses personal data on every normal screen, including for a super admin", () => {
    for (const path of ["/tags", "/tags/t/CODE", "/leads/1", "/sales", "/tasks", "/settings", "/admin-other", "/organizations-old"]) {
      expect(workspaceForPath(path)).toBe("work");
      expect(workspaceHeaders(path)).toEqual({ "X-Xpot-View": "rep" });
    }
  });
  it("uses management data only in the panel and organization pages", () => {
    for (const path of ["/admin", "/admin/tags/production", "/admin/work/sales/stock/3", "/organizations", "/organizations/2/people/3?view=sales"]) {
      expect(workspaceForPath(path)).toBe("management");
      expect(workspaceHeaders(path)).toEqual({ "X-Xpot-View": "manage" });
    }
  });
  it("ignores an old device-wide mode and follows navigation immediately", async () => {
    values.set("xpot.adminMode", "1");
    const { viewHeaders } = await import("../client/src/lib/adminMode");
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "rep" });
    location.pathname = "/admin";
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "manage" });
    location.pathname = "/tags";
    expect(viewHeaders()).toEqual({ "X-Xpot-View": "rep" });
  });
  it("removes the legacy preference on sign-out", async () => {
    values.set("xpot.adminMode", "1");
    const { clearAdminMode } = await import("../client/src/lib/adminMode");
    clearAdminMode();
    expect(values.has("xpot.adminMode")).toBe(false);
  });
});
