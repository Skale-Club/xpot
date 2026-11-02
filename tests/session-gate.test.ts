// What the session gate shows when /api/xpot/me does not answer, and where "sign in" and unknown addresses go.
import { describe, expect, it } from "vitest";
import { sessionProblem } from "../client/src/lib/pwa.js";
import { isVisitsPath, sessionEndedRequested, signInPath, signInRequested } from "../client/src/lib/xpot.js";

const apiError = (status: number, code?: string) => Object.assign(new Error("x"), { status, code: code ?? null });

describe("sessionProblem", () => {
  it.each([
    ["no session", apiError(401), "signed-out"],
    ["sign-up under review", apiError(403, "pending"), "pending"],
    ["access turned off", apiError(403, "blocked"), "blocked"],
    ["a 403 that is not the server's", apiError(403), "unreachable"],
    ["a server error", apiError(503), "unreachable"],
    ["no signal (fetch rejects)", new TypeError("Failed to fetch"), "unreachable"],
    ["a timeout", new DOMException("aborted", "AbortError"), "unreachable"],
  ])("%s", (_name, error, expected) => {
    expect(sessionProblem(error)).toBe(expected);
  });
});

describe("signInPath", () => {
  it("opens the sign-in dialog and remembers where to come back to", () => {
    expect(signInPath()).toBe("/?signin=1");
    expect(signInPath("/tags/pieces?q=a")).toBe("/?signin=1&next=%2Ftags%2Fpieces%3Fq%3Da");
  });
  it("never returns to another site", () => {
    expect(signInPath("https://evil.example/x")).toBe("/?signin=1");
    expect(signInPath("//evil.example")).toBe("/?signin=1");
  });
  it("says when the session ended, only with a page to go back to", () => {
    const ended = signInPath("/tags/pieces/ABCD1234", { ended: true });
    expect(ended).toBe("/?signin=1&next=%2Ftags%2Fpieces%2FABCD1234&ended=1");
    expect(sessionEndedRequested(new URL(ended, "https://x.test").search)).toBe(true);
    expect(sessionEndedRequested(new URL(signInPath("/tags"), "https://x.test").search)).toBe(false);
    expect(signInPath("//evil.example", { ended: true })).toBe("/?signin=1");
  });
  it("is what the landing recognises", () => {
    expect(signInRequested("?signin=1")).toBe(true);
    expect(signInRequested("?next=%2Ftags")).toBe(false);
  });
});

describe("isVisitsPath", () => {
  it("knows the Visits screens, and the older addresses that redirect to them", () => {
    for (const p of ["/dashboard", "/dashboard/history", "/route/check-in", "/leads/12", "/tasks", "/sales", "/visits/3", "/check-in", "/prospecting"]) expect(isVisitsPath(p)).toBe(true);
  });
  it("calls anything else a wrong address", () => {
    for (const p of ["/this-page-does-not-exist", "/dashboardx", "/leadsx", "/xpot/dashboard"]) expect(isVisitsPath(p)).toBe(false);
  });
});
