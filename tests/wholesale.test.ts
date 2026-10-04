import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { formatWholesaleCode, generateWholesaleCode, normalizeWholesaleCode, wholesaleUrl } from "../shared/wholesale";

describe("wholesale codes", () => {
  it("normalizes whatever a person types", () => {
    expect(normalizeWholesaleCode("XP-ABCD-1234")).toBe("XPABCD1234");
    expect(normalizeWholesaleCode(" xp abcd 1234 ")).toBe("XPABCD1234");
    expect(normalizeWholesaleCode("xpabcd1234")).toBe("XPABCD1234");
  });

  it("refuses what isn't a code", () => {
    expect(normalizeWholesaleCode("")).toBeNull();
    expect(normalizeWholesaleCode("AB-ABCD-1234")).toBeNull();
    expect(normalizeWholesaleCode("XP-ABCD-123")).toBeNull();
    expect(normalizeWholesaleCode("XP-ABCD-12345")).toBeNull();
    // I, L, O and U are not in the alphabet.
    expect(normalizeWholesaleCode("XP-ABCD-IL0U")).toBeNull();
  });

  it("formats with hyphens", () => {
    expect(formatWholesaleCode("XPABCD1234")).toBe("XP-ABCD-1234");
    expect(formatWholesaleCode("nonsense")).toBe("");
  });

  it("generates valid, varied codes", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateWholesaleCode((n) => randomBytes(n))));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(normalizeWholesaleCode(code)).toBe(code);
  });

  it("builds the store link", () => {
    expect(wholesaleUrl("https://stuscle.com/", "XPABCD1234")).toBe("https://stuscle.com/wholesale?code=XP-ABCD-1234");
  });
});
