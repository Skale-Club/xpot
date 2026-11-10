import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSearch } from "../client/src/hooks/use-url-filters";
import { keepsPagePosition } from "../client/src/hooks/use-page-scroll";

afterEach(() => vi.unstubAllGlobals());

describe("filters carried between a list and its detail", () => {
  it("keeps the original query when opening a row", () => {
    vi.stubGlobal("window", { location: { search: "?q=Leila&role=admin&module=visits" } });
    expect(currentSearch()).toBe("?q=Leila&role=admin&module=visits");
  });

  it("opens a piece as a page without reopening the list's popup", () => {
    vi.stubGlobal("window", { location: { search: "?org=7&search=Google+small&piece=123&status=ready" } });
    expect(currentSearch(["piece"])).toBe("?org=7&search=Google+small&status=ready");
  });

  it("returns from an event with its search, source and severity intact", () => {
    vi.stubGlobal("window", { location: { search: "?log=1&level=error&source=api&q=timeout&event=123" } });
    expect(currentSearch(["event"])).toBe("?log=1&level=error&source=api&q=timeout");
  });

  it("removes the person's view and organization tab without losing list filters", () => {
    vi.stubGlobal("window", { location: { search: "?personal=1&type=producer&view=visits&tab=team" } });
    expect(currentSearch(["view", "tab"])).toBe("?personal=1&type=producer");
  });

  it("does not add an empty query marker to links", () => {
    vi.stubGlobal("window", { location: { search: "?piece=123&piece=456" } });
    expect(currentSearch(["piece"])).toBe("");
  });

  it("can build links without a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(currentSearch(["event"])).toBe("");
  });
});

describe("page position when opening a detail", () => {
  it.each(["/leads", "/tasks", "/admin/reps", "/tags/pieces", "/admin/work/leads", "/admin/work/tasks"])("keeps the desktop list at %s when a pane opens or closes", (base) => {
    expect(keepsPagePosition(base, `${base}/12`, true)).toBe(true);
    expect(keepsPagePosition(`${base}/12`, base, true)).toBe(true);
    expect(keepsPagePosition(`${base}/12`, `${base}/15`, true)).toBe(true);
    expect(keepsPagePosition(base, `${base}/12`, false)).toBe(false);
  });

  it("starts independent pages at their own position", () => {
    expect(keepsPagePosition("/admin/reps", "/organizations", true)).toBe(false);
    expect(keepsPagePosition("/admin/health", "/admin/health/events/41", true)).toBe(false);
    expect(keepsPagePosition("/admin/tags/pieces", "/admin/tags/pieces/12", true)).toBe(false);
    expect(keepsPagePosition("/leads/12", "/leads/12/edit", true)).toBe(false);
  });

  it("keeps the position for tabs and filters on the same page, including phones", () => {
    expect(keepsPagePosition("/organizations/7", "/organizations/7", false)).toBe(true);
  });
});
