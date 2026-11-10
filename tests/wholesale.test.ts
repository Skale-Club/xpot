import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { formatWholesaleCode, generateWholesaleCode, normalizeWholesaleCode, stuscleKitUrl, stuscleProductUrl, WHOLESALE_OPEN_PATH, wholesaleStoreUrl, wholesaleUrl } from "../shared/wholesale";

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

  it("builds the store link: Xpot's own open route, with no code and no store address in it", () => {
    expect(wholesaleUrl()).toBe("/api/xpot/wholesale/open");
    expect(WHOLESALE_OPEN_PATH).toBe("/api/xpot/wholesale/open");
  });
});

// The links the app renders are the open route only: a copied one carries nothing that opens wholesale by itself.
describe("no link carries the code", () => {
  const links = [
    wholesaleUrl(),
    wholesaleStoreUrl(wholesaleUrl(), "pt-BR"),
    stuscleKitUrl([{ sku: "KIT-POKEMON-48-STARTER", quantity: 1 }, { sku: "KEYCHAIN-NFC", quantity: 24 }]),
    stuscleProductUrl("google-stand"),
  ];
  it("is a path of this app, never the store, and has no code= in it", () => {
    for (const link of links) {
      expect(link.startsWith(WHOLESALE_OPEN_PATH)).toBe(true);
      expect(link).not.toMatch(/code=|XP-|stuscle\.com|wholesale\/kit/i);
    }
  });
});

describe("wholesaleStoreUrl", () => {
  const plain = wholesaleUrl();

  it("adds the language to the plain link, and nothing else", () => {
    const url = new URL(wholesaleStoreUrl(plain, "pt-BR"), "https://xpot.test");
    expect(url.pathname).toBe(WHOLESALE_OPEN_PATH);
    expect([...url.searchParams.entries()]).toEqual([["lang", "pt-BR"]]);
  });

  it("leaves the plain link alone when there is no language", () => {
    expect(wholesaleStoreUrl(plain, null)).toBe(plain);
  });
});
