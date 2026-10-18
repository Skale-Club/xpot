// A failed API call must reach a toast as the server's sentence, not as
// `400: {"message":"…"}`, and code that branches on the status must still find it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../client/src/lib/queryClient";
import { getHttpStatus } from "../client/src/lib/pwa";
import { describeApiError, fieldErrorText, parseFieldErrors } from "../client/src/lib/apiErrors";

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

  it("keeps the field errors of a refused save", async () => {
    respond(400, JSON.stringify({
      message: "Invalid input",
      code: "invalid_input",
      errors: [
        { path: "accountSid", message: "Account SID starts with AC", code: "invalid_twilio_sid" },
        { path: "fromNumber", message: "From number must be E.164", code: "invalid_e164" },
      ],
    }));
    const err = await apiRequest("PUT", "/api/x", {}).catch((e) => e);
    expect(err.code).toBe("invalid_input");
    expect(err.fieldErrors.map((e: { path: string }) => e.path)).toEqual(["accountSid", "fromNumber"]);
    const text = describeApiError(err, (path) => ({ accountSid: "Account SID" })[path]);
    expect(text).toBe("Account SID: The Account SID starts with AC and has 34 characters. 1 more field also needs fixing.");
  });

  it("keeps a non-JSON body as text", async () => {
    respond(502, "Bad gateway", "text/plain");
    const err = await apiRequest("GET", "/api/x").catch((e) => e);
    expect(err.message).toBe("Bad gateway");
    expect(getHttpStatus(err)).toBe(502);
  });
});

describe("field errors", () => {
  it("reads the uniform list, raw Zod issues and Zod's flatten()", () => {
    expect(parseFieldErrors({ errors: [{ path: "faq.items.2.answer", message: "Required", code: "required" }] })).toEqual([
      { path: "faq.items.2.answer", message: "Required", code: "required" },
    ]);
    expect(parseFieldErrors({ errors: [{ path: ["hero", "body"], message: "Too long" }] })).toEqual([{ path: "hero.body", message: "Too long" }]);
    expect(parseFieldErrors({ errors: { fieldErrors: { apiUrl: ["Invalid url"] }, formErrors: ["Bad body"] } })).toEqual([
      { path: "apiUrl", message: "Invalid url" },
      { path: "", message: "Bad body" },
    ]);
    expect(parseFieldErrors({ message: "x" })).toEqual([]);
    expect(parseFieldErrors(null)).toEqual([]);
    expect(parseFieldErrors({ errors: [null, { path: "a" }, 3] })).toEqual([]);
  });

  it("words known codes and keeps the server's sentence for the rest", () => {
    expect(fieldErrorText({ path: "x", message: "String must contain at most 160 character(s)", code: "too_long", params: { max: 160 } })).toBe(
      "Too long: at most 160 characters.",
    );
    expect(fieldErrorText({ path: "x", message: "Something odd", code: "made_up" })).toBe("Something odd");
    expect(fieldErrorText({ path: "x", message: "Plain" })).toBe("Plain");
  });

  it("falls back to the message when there are no field errors", () => {
    expect(describeApiError(new Error("Storage not configured"))).toBe("Storage not configured");
    const single = Object.assign(new Error("Invalid input"), { fieldErrors: [{ path: "apiUrl", message: "Invalid url", code: "invalid_url" }] });
    expect(describeApiError(single)).toBe("Enter a full web address, starting with https://.");
    expect(describeApiError(single, () => "API URL")).toBe("API URL: Enter a full web address, starting with https://.");
  });
});
