import { describe, expect, it } from "vitest";
import { normalizeIpKey, rateLimit } from "../server/tags/rateLimit.js";

describe("authentication rate-limit primitive", () => {
  it("rejects requests after the fixed-window limit", () => {
    const key = `test-auth-${Date.now()}-${Math.random()}`;
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(false);
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(false);
    expect(rateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(true);
  });

  it("normalizes equivalent client IP representations", () => {
    expect(normalizeIpKey("::ffff:192.0.2.42")).toBe("192.0.2.42");
    expect(normalizeIpKey("2001:0db8:0000:0000:abcd:0000:0000:0001")).toBe("2001:db8:0:0::/64");
  });
});
