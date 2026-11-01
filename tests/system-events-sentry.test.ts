// Sentry gets a copy of what the app records: once per repeat window, like the
// log itself, and never the browser's reports, which reach Sentry on their own.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@sentry/node", () => sentry);
vi.mock("../server/db.js", () => ({
  db: { insert: () => ({ values: async () => undefined }), delete: () => ({ where: async () => undefined }) },
}));
import { recordSystemEvent } from "../server/observability/events.js";

describe("recordSystemEvent → Sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("forwards the error with its source and context", async () => {
    const error = new Error("database went away");
    await recordSystemEvent({ source: "api", error, context: { path: "/api/x" }, repId: 7 });
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: { source: "api" },
      extra: { path: "/api/x" },
      user: { id: "7" },
    });
  });

  it("sends an event without an error as a message, at its level", async () => {
    await recordSystemEvent({ level: "warn", source: "api", message: "a slow answer" });
    expect(sentry.captureMessage).toHaveBeenCalledWith("a slow answer", expect.objectContaining({ level: "warning" }));
  });

  it("sends a repeat of the same failure only once per window", async () => {
    await recordSystemEvent({ source: "api", error: new Error("the same failure") });
    await recordSystemEvent({ source: "api", error: new Error("the same failure") });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("leaves the browser's reports to the frontend project", async () => {
    await recordSystemEvent({ source: "client", error: new Error("a browser crash") });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
