import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const getAppBranding = vi.fn();
vi.mock("../server/storage.js", () => ({ storage: { getAppBranding } }));

const { createBrandingPublicRouter } = await import("../server/routes/xpot/branding.js");

async function requestLogo() {
  const app = express();
  app.use("/api/branding", createBrandingPublicRouter());

  return new Promise<Response>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        resolve(await fetch(`http://127.0.0.1:${port}/api/branding/logo`, { redirect: "manual" }));
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

describe("public branding logo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redirects to the horizontal logo configured by the super admin", async () => {
    getAppBranding.mockResolvedValue({ logoUrl: "https://cdn.example.test/xpot.svg" });

    const response = await requestLogo();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cdn.example.test/xpot.svg");
  });

  it("uses the built-in horizontal logo when branding storage is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getAppBranding.mockRejectedValue(new Error("database unavailable"));

    const response = await requestLogo();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/xpot-logo.svg");
  });
});
