import { describe, expect, it, vi } from "vitest";
import { isConnectionDropped, retryIfConnectionDropped } from "../server/lib/db-connection";

const reset = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

describe("isConnectionDropped", () => {
  it("recognises a dropped socket, directly or wrapped by drizzle", () => {
    expect(isConnectionDropped(reset())).toBe(true);
    expect(isConnectionDropped(new Error("Failed query", { cause: reset() }))).toBe(true);
    expect(isConnectionDropped(new Error("Connection terminated unexpectedly"))).toBe(true);
  });

  it("leaves real query errors alone", () => {
    expect(isConnectionDropped(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(false);
    expect(isConnectionDropped("ECONNRESET")).toBe(false);
    expect(isConnectionDropped(undefined)).toBe(false);
  });
});

describe("retryIfConnectionDropped", () => {
  it("retries once after a dropped connection", async () => {
    const work = vi.fn().mockRejectedValueOnce(reset()).mockResolvedValueOnce("ok");
    await expect(retryIfConnectionDropped(work)).resolves.toBe("ok");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second failure", async () => {
    const work = vi.fn().mockRejectedValue(reset());
    await expect(retryIfConnectionDropped(work)).rejects.toThrow("ECONNRESET");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const work = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(retryIfConnectionDropped(work)).rejects.toThrow("syntax error");
    expect(work).toHaveBeenCalledTimes(1);
  });
});
