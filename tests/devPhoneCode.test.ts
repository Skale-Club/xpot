import { describe, expect, it } from "vitest";

import { devCodeForResponse } from "../server/auth/devPhoneCode";

describe("devCodeForResponse", () => {
  it("returns the generated code for a local non-live SMS sender", () => {
    expect(
      devCodeForResponse({
        code: "123456",
        nodeEnv: "development",
        smsLive: false,
      }),
    ).toBe("123456");
  });

  it("never returns the code outside development", () => {
    expect(
      devCodeForResponse({
        code: "123456",
        nodeEnv: "production",
        smsLive: false,
      }),
    ).toBeUndefined();
  });

  it("never returns the code when live SMS is enabled", () => {
    expect(
      devCodeForResponse({
        code: "123456",
        nodeEnv: "development",
        smsLive: true,
      }),
    ).toBeUndefined();
  });
});
