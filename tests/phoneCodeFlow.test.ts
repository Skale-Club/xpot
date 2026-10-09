import { describe, expect, it, vi } from "vitest";

import { completePhoneCodeVerification } from "../server/auth/phoneCodeFlow";

describe("completePhoneCodeVerification", () => {
  it("does not consume the code when account completion fails", async () => {
    const consume = vi.fn(async () => undefined);

    await expect(
      completePhoneCodeVerification({
        validate: async () => undefined,
        complete: async () => {
          throw new Error("database unavailable");
        },
        consume,
      }),
    ).rejects.toThrow("database unavailable");

    expect(consume).not.toHaveBeenCalled();
  });

  it("consumes the code only after account completion succeeds", async () => {
    const order: string[] = [];

    const result = await completePhoneCodeVerification({
      validate: async () => {
        order.push("validate");
      },
      complete: async () => {
        order.push("complete");
        return { status: "active" as const };
      },
      consume: async () => {
        order.push("consume");
      },
    });

    expect(result).toEqual({ status: "active" });
    expect(order).toEqual(["validate", "complete", "consume"]);
  });
});
