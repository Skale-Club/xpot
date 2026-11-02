import { describe, expect, it } from "vitest";
import { isNetworkFailure, pieceLoadView, type PieceLookup } from "../client/src/pages/tags/pieceLoad";

const answer = (kind: PieceLookup["kind"]): PieceLookup => ({ kind });
const httpError = Object.assign(new Error("Server error"), { status: 500 });

describe("pieceLoadView", () => {
  it.each([
    ["the lookup is running", { data: undefined, error: null, fetchStatus: "fetching" }, "loading"],
    ["the phone is offline when the screen opens (the query is paused)", { data: undefined, error: null, fetchStatus: "paused" }, "offline"],
    ["fetch fails with no signal", { data: undefined, error: new TypeError("Failed to fetch"), fetchStatus: "idle" }, "offline"],
    ["Safari's words for no signal", { data: undefined, error: new TypeError("Load failed"), fetchStatus: "idle" }, "offline"],
    ["the server answers with an error", { data: undefined, error: httpError, fetchStatus: "idle" }, "failed"],
    ["a bug that is not the network", { data: undefined, error: new TypeError("Cannot read properties of undefined"), fetchStatus: "idle" }, "failed"],
    ["the server says there is no such piece", { data: answer("not_found"), error: null, fetchStatus: "idle" }, "not_found"],
    ["the piece is in someone else's kit", { data: answer("not_yours"), error: null, fetchStatus: "idle" }, "not_yours"],
    ["the piece is the organization's, not the person's", { data: answer("limited"), error: null, fetchStatus: "idle" }, "limited"],
    ["the piece loads", { data: answer("ok"), error: null, fetchStatus: "idle" }, "ok"],
  ] as const)("%s", (_name, query, expected) => {
    expect(pieceLoadView({ ...query, data: query.data as PieceLookup | undefined })).toBe(expected);
  });

  it("never turns a lost signal into 'not found'", () => {
    for (const fetchStatus of ["fetching", "paused", "idle"] as const) {
      expect(pieceLoadView({ data: undefined, error: new TypeError("Failed to fetch"), fetchStatus })).not.toBe("not_found");
      expect(pieceLoadView({ data: undefined, error: null, fetchStatus })).not.toBe("not_found");
    }
  });

  it("keeps showing a piece already loaded when a refresh then fails", () => {
    expect(pieceLoadView({ data: answer("ok"), error: new TypeError("Failed to fetch"), fetchStatus: "idle" })).toBe("ok");
  });
});

describe("isNetworkFailure", () => {
  it("is only a rejected fetch", () => {
    expect(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkFailure(httpError)).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});
