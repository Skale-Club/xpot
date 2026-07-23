// Which surface "/" renders on launch.
//
// This is the logic behind the bug where the installed iOS app always opened on
// the marketing landing looking signed out. The branches are cheap to get wrong
// and expensive to notice (they only misbehave inside an installed PWA, where
// there is no console to look at), so every case is pinned here.

import { describe, expect, it } from "vitest";
import { getHttpStatus, resolveRootView } from "../client/src/lib/pwa.js";

const httpError = (status: number) => new Error(`${status}: Unauthorized`);

describe("getHttpStatus", () => {
  it("reads the status off a queryClient-formatted error", () => {
    expect(getHttpStatus(new Error("401: Unauthorized"))).toBe(401);
    expect(getHttpStatus(new Error("503: Service Unavailable"))).toBe(503);
  });

  it("returns null when there is no status prefix", () => {
    expect(getHttpStatus(new Error("Failed to fetch"))).toBeNull();
    expect(getHttpStatus(null)).toBeNull();
    expect(getHttpStatus("401: string, not an Error")).toBeNull();
  });
});

describe("resolveRootView", () => {
  it("always shows the landing in a browser tab, whatever the session says", () => {
    expect(
      resolveRootView({ standalone: false, isLoading: true, hasSession: false, error: null }),
    ).toBe("landing");
    expect(
      resolveRootView({ standalone: false, isLoading: false, hasSession: true, error: null }),
    ).toBe("landing");
  });

  it("holds a splash while the installed app resolves the session", () => {
    expect(
      resolveRootView({ standalone: true, isLoading: true, hasSession: false, error: null }),
    ).toBe("loading");
  });

  it("sends a signed-in rep straight to the workspace", () => {
    expect(
      resolveRootView({ standalone: true, isLoading: false, hasSession: true, error: null }),
    ).toBe("workspace");
  });

  it("shows the landing when the session is genuinely gone", () => {
    for (const status of [401, 403]) {
      expect(
        resolveRootView({
          standalone: true,
          isLoading: false,
          hasSession: false,
          error: httpError(status),
        }),
      ).toBe("landing");
    }
  });

  it("keeps a rep on a flaky connection in the app instead of the landing", () => {
    // Offline / aborted / 5xx — the session may well be fine, so the app shell
    // (which has a retry state) owns this, not the marketing page.
    const flaky = [new Error("Failed to fetch"), new Error("500: Internal"), httpError(502)];
    for (const error of flaky) {
      expect(
        resolveRootView({ standalone: true, isLoading: false, hasSession: false, error }),
      ).toBe("workspace");
    }
  });

  it("shows the landing on a clean unauthenticated launch (no session, no error)", () => {
    expect(
      resolveRootView({ standalone: true, isLoading: false, hasSession: false, error: null }),
    ).toBe("landing");
  });
});
