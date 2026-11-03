import { describe, expect, it, vi } from "vitest";
import { lazyScreen } from "../client/src/lib/lazyScreen";
import { routeScreens } from "../client/src/lib/routeScreens";

describe("navigation code preloading", () => {
  it.each([
    ["/dashboard", ["dashboard"]],
    ["/dashboard/history/12", ["dashboard"]],
    ["/visits/12", ["dashboard"]],
    ["/route", ["route"]],
    ["/route/check-in?leadId=12", ["checkIn"]],
    ["/leads/12?tab=notes", ["leads"]],
    ["/leads/prospecting", ["route"]],
    ["/sales/stock/4", ["sales"]],
    ["/tasks?status=completed", ["tasks"]],
    ["/settings", ["settings"]],
    ["/organizations/7?tab=team", ["organizations"]],
    ["/organizations/7/people/12", ["organizationPerson"]],
    ["/tags", ["tagsHome"]],
    ["/tags/pieces", ["tagsPieces"]],
    ["/tags/pieces/ABC", ["tagsPieces", "tagsPiece"]],
    ["/tags/customers/12", ["tagsCustomer", "leads"]],
    ["/tags/orders/12", ["tagsOrders"]],
    ["/tags/shop/", ["tagsShop"]],
    ["/tags/direct", ["tagsDirect"]],
    ["/tags/results", ["tagsResults"]],
    ["/admin", ["adminHome"]],
    ["/admin/overview", ["adminOverview"]],
    ["/admin/reps/12", ["adminReps"]],
    ["/admin/work/leads/12", ["adminWork", "leads"]],
    ["/admin/work/tasks", ["adminWork", "tasks"]],
    ["/admin/work/tags/pieces/ABC", ["adminWork", "tagsPieces", "tagsPiece"]],
    ["/admin/tags", ["adminTags", "tagOverview"]],
    ["/admin/tags/overview/ready", ["adminTags", "tagQueue"]],
    ["/admin/tags/pieces/12", ["adminTags", "tagDetail"]],
    ["/admin/tags/production/models/12", ["adminTags", "tagProduction"]],
    ["/admin/tags/batches/12", ["adminTags", "tagProduction"]],
    ["/admin/tags/kits", ["adminTags", "tagKits"]],
    ["/admin/tags/provisioners", ["adminTags", "tagProvisioners"]],
    ["/admin/tags/journey", ["adminTags", "tagJourney"]],
    ["/admin/tags/shop", ["adminTags", "tagShowcase"]],
    ["/admin/products", ["adminProducts"]],
    ["/admin/health/events", ["adminHealth"]],
    ["/admin/integrations#twilio", ["adminIntegrations"]],
    ["/admin/branding?tab=app", ["adminBrandSite"]],
    ["/admin/landing", ["adminBrandSite"]],
    ["/admin/settings", ["adminSettings"]],
  ])("warms the screen for %s without fetching its data", (path, screens) => {
    expect(routeScreens(path)).toEqual(screens);
  });

  it("does not warm workspace code for public, customer-only or unknown URLs", () => {
    for (const path of ["/", "/pt", "/login", "/my/plate/ABC", "/privacy", "/unknown", "/tags-other", "/admin-other"]) {
      expect(routeScreens(path)).toEqual([]);
    }
  });

  it("shares concurrent intent downloads and reuses the loaded module", async () => {
    const module = { default: () => null };
    const load = vi.fn(async () => module);
    const screen = lazyScreen(load);
    const first = screen.preload();
    expect(screen.preload()).toBe(first);
    await expect(first).resolves.toBe(module);
    expect(screen.preload()).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries after a speculative download fails", async () => {
    const module = { default: () => null };
    const load = vi.fn<() => Promise<typeof module>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(module);
    const screen = lazyScreen(load);
    await expect(screen.preload()).rejects.toThrow("offline");
    await expect(screen.preload()).resolves.toBe(module);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
