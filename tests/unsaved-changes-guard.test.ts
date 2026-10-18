// A screen with unsaved changes (the Landing editor) must be asked before any
// in-app move, including the admin's phone tab strip, which navigates in code.

import { describe, expect, it, vi } from "vitest";
import { holdNavigation, navigateGuarded } from "../client/src/hooks/useUnsavedChangesGuard";

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
