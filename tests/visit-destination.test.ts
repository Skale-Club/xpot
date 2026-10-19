// Cancelling the active visit lands on its route for a route stop, else back
// where the visit was started from, else the Dashboard
// (client/src/pages/xpot/visitDestination.ts).
import { describe, expect, it } from "vitest";
import { cancelledVisitExit } from "../client/src/pages/xpot/visitDestination";

describe("after cancelling a visit", () => {
  it("a route stop goes back to its route, wherever the visit was opened from", () => {
    expect(cancelledVisitExit(12, "/dashboard")).toEqual({ path: "/route?routeId=12", back: false });
    expect(cancelledVisitExit(12, null)).toEqual({ path: "/route?routeId=12", back: false });
  });

  it("any other visit goes back where it was started from", () => {
    expect(cancelledVisitExit(null, "/dashboard")).toEqual({ path: "/dashboard", back: true });
    expect(cancelledVisitExit(undefined, "/leads/42")).toEqual({ path: "/leads/42", back: true });
    expect(cancelledVisitExit(null, "/leads?status=customer")).toEqual({ path: "/leads?status=customer", back: true });
  });

  it("falls back to the Dashboard when that is unknown or another visit screen", () => {
    expect(cancelledVisitExit(null, null)).toEqual({ path: "/dashboard", back: false });
    expect(cancelledVisitExit(null, "/route/check-in?leadId=4")).toEqual({ path: "/dashboard", back: false });
    expect(cancelledVisitExit(null, "/check-in")).toEqual({ path: "/dashboard", back: false });
  });
});
