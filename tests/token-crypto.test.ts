import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  decryptToken,
  encryptSecret,
  encryptToken,
  isEncryptedToken,
  resetTokenCryptoKeyForTests,
} from "../server/lib/token-crypto";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("token-crypto", () => {
  const saved = process.env.TOKEN_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A;
    resetTokenCryptoKeyForTests();
  });
  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = saved;
    resetTokenCryptoKeyForTests();
  });

  it("round-trips and never stores the plaintext", () => {
    const secret = "not-a-real-auth-token";
    const sealed = encryptToken(secret);
    expect(isEncryptedToken(sealed)).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(decryptToken(sealed)).toBe(secret);
    expect(encryptToken(secret)).not.toBe(sealed); // random IV per write
  });

  it("passes legacy plaintext through on read", () => {
    expect(decryptToken("legacy-plain")).toBe("legacy-plain");
    expect(decryptSecret("legacy-plain")).toBe("legacy-plain");
  });

  it("does not double-encrypt and leaves empty values alone", () => {
    const sealed = encryptSecret("abc");
    expect(encryptSecret(sealed)).toBe(sealed);
    expect(encryptSecret("")).toBe("");
    expect(encryptSecret(null)).toBe(null);
    expect(encryptSecret(undefined)).toBe(undefined);
  });

  it("treats a value sealed with another key as missing instead of throwing", () => {
    const sealed = encryptToken("abc");
    process.env.TOKEN_ENCRYPTION_KEY = KEY_B;
    resetTokenCryptoKeyForTests();
    expect(() => decryptToken(sealed)).toThrow();
    expect(decryptSecret(sealed)).toBe(null);
  });
});
