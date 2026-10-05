// A failed API call must reach a toast as the server's sentence, not as
// `400: {"message":"…"}`, and code that branches on the status must still find it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../client/src/lib/queryClient";
import { getHttpStatus } from "../client/src/lib/pwa";

const respond = (status: number, body: string, contentType = "application/json") =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers: { "content-type": contentType } }));

afterEach(() => vi.restoreAllMocks());

describe("apiRequest errors", () => {
  it("carries the server's message and the status", async () => {
    respond(409, JSON.stringify({ message: "This piece is already sold." }));
    const err = await apiRequest("POST", "/api/x", { a: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("This piece is already sold.");
    expect(err.status).toBe(409);
    expect(getHttpStatus(err)).toBe(409);
  });

  it("reads { error } bodies too (the inbound API's shape)", async () => {
    respond(401, JSON.stringify({ error: "Unauthorized" }));
    expect((await apiRequest("GET", "/api/x").catch((e) => e)).message).toBe("Unauthorized");
  });

  it("never gives an empty message (a gateway error with no body)", async () => {
    respond(502, "", "text/plain");
    const err = await apiRequest("GET", "/api/x").catch((e) => e);
    expect(err.message).toBe("Request failed (502)");
    expect(err.status).toBe(502);
  });

  it("keeps a non-JSON body as text", async () => {
    respond(502, "Bad gateway", "text/plain");
    const err = await apiRequest("GET", "/api/x").catch((e) => e);
    expect(err.message).toBe("Bad gateway");
    expect(getHttpStatus(err)).toBe(502);
  });
});
