// The legacy domain (xpot.skale.club) is sent to xpot.place, except /api/*,
// which keeps answering so pinned integrations do not break.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "net";
import { CANONICAL_ORIGIN, legacyHostRedirect } from "../server/canonicalHost.js";

test("canonical origin is xpot.place", () => {
  assert.equal(CANONICAL_ORIGIN, "https://xpot.place");
});

test("legacy host: pages redirect to the same path on xpot.place, /api keeps working", async () => {
  const app = express();
  app.use(legacyHostRedirect);
  app.all("*", (req, res) => res.json({ ok: true, path: req.path }));
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  // fetch() refuses to set Host, so a raw request.
  const req = (path: string, host: string, method = "GET") =>
    new Promise<{ status: number; headers: { get: (name: string) => string | null } }>((resolve, reject) => {
      http
        .request({ host: "127.0.0.1", port, path, method, headers: { host } }, (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, headers: { get: (name) => (res.headers[name.toLowerCase()] as string | undefined) ?? null } });
        })
        .on("error", reject)
        .end();
    });
  try {
    const page = await req("/dashboard?tab=1", "xpot.skale.club");
    assert.equal(page.status, 301);
    assert.equal(page.headers.get("location"), "https://xpot.place/dashboard?tab=1");

    const qr = await req("/q/A7K3P9X2", "XPOT.SKALE.CLUB:443");
    assert.equal(qr.status, 301);
    assert.equal(qr.headers.get("location"), "https://xpot.place/q/A7K3P9X2");

    const post = await req("/oauth/token", "xpot.skale.club", "POST");
    assert.equal(post.status, 308, "non-GET keeps its method");
    assert.equal(post.headers.get("location"), "https://xpot.place/oauth/token");

    const api = await req("/api/health", "xpot.skale.club");
    assert.equal(api.status, 200);

    for (const host of ["xpot.place", "localhost:2110", "127.0.0.1"]) {
      assert.equal((await req("/dashboard", host)).status, 200, host);
    }
  } finally {
    server.close();
  }
});
