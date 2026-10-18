import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Settings' phone picker drew its flags with react-country-flag in SVG mode,
// which fetches each one from cdn.jsdelivr.net: no flags offline or under a
// strict CSP. Every country it offers now has an inline drawing in
// components/CountryFlag.tsx. (The tests run without JSX, so they read the sources.)
const settings = readFileSync("client/src/pages/xpot/XpotSettings.tsx", "utf8");
const flags = readFileSync("client/src/components/CountryFlag.tsx", "utf8");
const countries = Array.from(settings.matchAll(/\{ code: "([A-Z]{2})", dial:/g), (m) => m[1]);
const drawn = Array.from(flags.matchAll(/^ {2}([A-Z]{2}): \(/gm), (m) => m[1]);

describe("country flags", () => {
  it("cover every phone country Settings offers", () => {
    expect(countries.length).toBeGreaterThanOrEqual(17);
    expect(countries.filter((code) => !drawn.includes(code))).toEqual([]);
  });

  it("ship with the bundle instead of loading from a CDN", () => {
    expect(settings).not.toContain("react-country-flag");
    expect(settings).toContain('from "@/components/CountryFlag"');
    // Only the licence links: no drawing points at a URL.
    expect(flags.match(/https?:\/\/[^\s)]+/g)).toEqual(["https://nucleoapp.com/svg-flag-icons", "https://github.com/lipis/flag-icons,"]);
    expect(flags).not.toMatch(/<image|<img|href=/);
  });
});
