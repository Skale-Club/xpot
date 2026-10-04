// Every Tags endpoint refuses callers without a session (or, for the desktop
// provisioner, without the protocol header / device token). No database
// needed: the guards answer before any query.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";

const ID = "11111111-1111-4111-8111-111111111111";

test("tag endpoints refuse anonymous callers", async () => {
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const app = express();
  app.use(express.json());
  registerTagRoutes(app); // no session middleware → no session → 401
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const calls: Array<[string, string]> = [
      ["GET", "/api/xpot/tags"],
      ["GET", "/api/xpot/tags/summary"],
      ["GET", "/api/xpot/tags/lookup/A7K3P9X2"],
      ["GET", `/api/xpot/tags/${ID}`],
      ["POST", `/api/xpot/tags/${ID}/quick-activate`],
      ["POST", `/api/xpot/tags/${ID}/activate`],
      ["POST", `/api/xpot/tags/${ID}/disable`],
      ["POST", `/api/xpot/tags/${ID}/nfc-written`],
      ["GET", "/api/xpot/tag-direct-writes"],
      ["POST", "/api/xpot/tag-direct-writes"],
      ["POST", "/api/xpot/tools/review-link"],
      ["GET", "/api/xpot/admin/tags/overview"],
      ["GET", "/api/xpot/admin/tags/analytics"],
      ["GET", "/api/xpot/admin/tags/report"],
      ["POST", "/api/xpot/admin/tags"],
      ["PATCH", `/api/xpot/admin/tags/${ID}`],
      ["POST", `/api/xpot/admin/tags/${ID}/assign`],
      ["POST", `/api/xpot/admin/tags/${ID}/unassign`],
      ["POST", `/api/xpot/admin/tags/${ID}/retire`],
      ["PATCH", `/api/xpot/admin/tags/${ID}/rep`],
      ["GET", `/api/xpot/admin/tags/${ID}/qr.svg`],
      ["GET", "/api/xpot/admin/tag-kits"],
      ["POST", "/api/xpot/admin/tag-kits"],
      ["POST", "/api/xpot/admin/tag-kits/return"],
      ["GET", "/api/xpot/admin/tag-batches"],
      ["POST", "/api/xpot/admin/tag-batches"],
      ["GET", `/api/xpot/admin/tag-batches/${ID}/export.csv`],
      ["GET", "/api/xpot/admin/tag-provisioners"],
      ["POST", "/api/xpot/admin/tag-provisioners"],
      ["POST", `/api/xpot/admin/tags/${ID}/provisioning-jobs`],
    ];
    for (const [method, path] of calls) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({ destinationUrl: "https://evil.example" }),
      });
      assert.equal(res.status, 401, `${method} ${path}`);
    }

    // Desktop provisioner: wrong/missing protocol → 426; no token → 401.
    assert.equal((await fetch(`${base}/api/provisioner/session`)).status, 426);
    const noToken = await fetch(`${base}/api/provisioner/session`, { headers: { "x-provisioner-protocol": "1" } });
    assert.equal(noToken.status, 401);
  } finally {
    server.close();
  }
});
