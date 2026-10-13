import { describe, expect, it } from "vitest";
import { usesGoogleAuth } from "../server/auth/providers.js";

describe("Google login gate", () => {
  it("detects Google as the primary, linked, or identity provider", () => {
    expect(usesGoogleAuth({ app_metadata: { provider: "google" } })).toBe(true);
    expect(usesGoogleAuth({ app_metadata: { provider: "email", providers: ["email", "google"] } })).toBe(true);
    expect(usesGoogleAuth({ identities: [{ provider: "google" }] })).toBe(true);
  });

  it("does not block unrelated providers", () => {
    expect(usesGoogleAuth({ app_metadata: { provider: "email", providers: ["email"] } })).toBe(false);
    expect(usesGoogleAuth({})).toBe(false);
  });
});
