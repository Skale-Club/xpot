import { describe, expect, it } from "vitest";
import {
  appleRouteUrl,
  appleStopUrl,
  googleRouteUrl,
  googleStopUrl,
  isAppleMobileDevice,
  placeUrl,
  stopNavigationUrl,
} from "../client/src/pages/xpot/prospectingMaps.js";

const start = { lat: "42.29", lng: "-71.49" };
const stop = (lat: string, status = "planned") => ({ lat, lng: "-71.50", status });

describe("prospecting navigation links", () => {
  it("offers Apple Maps only on iPhone and iPad", () => {
    expect(isAppleMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    // iPadOS asks for the desktop site and reports a Mac with touch.
    expect(isAppleMobileDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isAppleMobileDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isAppleMobileDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });

  it("starts both apps at the phone's live location", () => {
    const stops = [stop("42.30"), stop("42.31")];
    const google = new URL(googleRouteUrl(start, stops)!);
    expect(google.searchParams.has("origin")).toBe(false);
    expect(google.searchParams.get("waypoints")).toBe("42.30,-71.50");
    expect(google.searchParams.get("destination")).toBe("42.31,-71.50");

    const apple = new URL(appleRouteUrl(start, stops)!);
    expect(apple.origin).toBe("https://maps.apple.com");
    expect(apple.searchParams.has("saddr")).toBe(false);
    expect(apple.searchParams.getAll("daddr")).toEqual(["42.30,-71.50", "42.31,-71.50"]);
    expect(apple.searchParams.get("dirflg")).toBe("d");
  });

  it("continues from the rep's position with only the open stops", () => {
    const stops = [stop("42.30", "completed"), stop("42.31"), stop("42.32", "skipped"), stop("42.33")];
    const apple = new URL(appleRouteUrl(start, stops)!);
    expect(apple.searchParams.has("saddr")).toBe(false);
    expect(apple.searchParams.getAll("daddr")).toEqual(["42.31,-71.50", "42.33,-71.50"]);
    expect(new URL(googleRouteUrl(start, stops)!).searchParams.has("origin")).toBe(false);
  });

  it("has nothing to open once every stop is done", () => {
    const stops = [stop("42.30", "completed")];
    expect(googleRouteUrl(start, stops)).toBeNull();
    expect(appleRouteUrl(start, stops)).toBeNull();
  });

  it("navigates to a single stop by car", () => {
    expect(new URL(appleStopUrl(stop("42.30"))).searchParams.get("daddr")).toBe("42.30,-71.50");
    expect(new URL(googleStopUrl(stop("42.30"))).searchParams.get("travelmode")).toBe("driving");
  });

  it("picks the device's maps app for one stop", () => {
    expect(new URL(stopNavigationUrl(stop("42.30"), true)).origin).toBe("https://maps.apple.com");
    expect(new URL(stopNavigationUrl(stop("42.30"), false)).pathname).toBe("/maps/dir/");
  });

  it("opens a place (address or coordinates) without directions", () => {
    const google = new URL(placeUrl("1 Main St, Framingham, MA", false));
    expect(google.pathname).toBe("/maps/search/");
    expect(google.searchParams.get("query")).toBe("1 Main St, Framingham, MA");
    expect(new URL(placeUrl({ lat: 42.3, lng: -71.5 }, false)).searchParams.get("query")).toBe("42.3,-71.5");

    const apple = new URL(placeUrl({ lat: 42.3, lng: -71.5 }, true));
    expect(apple.origin).toBe("https://maps.apple.com");
    expect(apple.searchParams.get("ll")).toBe("42.3,-71.5");
    expect(apple.searchParams.has("daddr")).toBe(false);
    expect(new URL(placeUrl("1 Main St", true)).searchParams.get("q")).toBe("1 Main St");
  });
});
