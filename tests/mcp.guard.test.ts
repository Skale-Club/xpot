// The MCP endpoint and its token admin API refuse unauthenticated callers, and
// token generation/hashing behave. No database needed: the guards and the
// bearer shape check answer before any query.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";

const ID = "11111111-1111-4111-8111-111111111111";

test("/mcp refuses calls without a token or with a bad one; GET/DELETE are 405", async () => {
  const { registerMcpRoutes } = await import("../server/mcp/routes.js");
  const app = express();
  app.use(express.json());
  registerMcpRoutes(app);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const post = (headers: Record<string, string>) =>
      fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

    const none = await post({});
    assert.equal(none.status, 401);
    // The challenge points at the OAuth metadata, so hosts can start sign-in.
    assert.match(
      none.headers.get("www-authenticate") ?? "",
      /^Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource", error="invalid_request"$/,
    );
    for (const authorization of [
      "Bearer not-a-token",
      "Bearer xpot_mcp_short",
      "Basic dXNlcjpwYXNz",
      "Bearer mcp_sk_" + "a".repeat(48), // a Skale Club token is not an Xpot token
      "Bearer",
    ]) {
      assert.equal((await post({ authorization })).status, 401, authorization);
    }

    for (const method of ["GET", "DELETE"]) {
      const res = await fetch(`${base}/mcp`, { method });
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get("allow"), "POST");
    }
  } finally {
    server.close();
  }
});

test("mcp-token admin endpoints refuse anonymous callers", async () => {
  const { registerMcpRoutes } = await import("../server/mcp/routes.js");
  const app = express();
  app.use(express.json());
  registerMcpRoutes(app); // no session middleware → no session → 401
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const calls: Array<[string, string]> = [
      ["GET", "/api/xpot/admin/mcp-tokens"],
      ["POST", "/api/xpot/admin/mcp-tokens"],
      ["POST", `/api/xpot/admin/mcp-tokens/${ID}/revoke`],
      ["GET", "/api/xpot/admin/mcp-connections"],
      ["POST", `/api/xpot/admin/mcp-connections/xpot_client_${"a".repeat(43)}/revoke`],
    ];
    for (const [method, path] of calls) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({ name: "evil" }),
      });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  } finally {
    server.close();
  }
});

test("token secrets: xpot_mcp_ + 32 random bytes, only the sha-256 hash is derived for storage", async () => {
  const { MCP_TOKEN_PREFIX, bearerSecret, generateMcpSecret, hashMcpSecret, looksLikeMcpSecret } = await import("../server/mcp/tokens.js");
  const a = generateMcpSecret();
  const b = generateMcpSecret();
  assert.notEqual(a, b);
  assert.equal(MCP_TOKEN_PREFIX, "xpot_mcp_");
  assert.ok(a.startsWith("xpot_mcp_"));
  // 32 bytes → 43 base64url characters, URL-safe alphabet only.
  assert.match(a.slice(MCP_TOKEN_PREFIX.length), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(looksLikeMcpSecret(a), true);
  assert.equal(looksLikeMcpSecret(a.slice(0, -1)), false);
  assert.equal(looksLikeMcpSecret(`${a}x`), false);
  assert.equal(looksLikeMcpSecret("mcp_sk_" + "a".repeat(43)), false);

  const hash = hashMcpSecret(a);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashMcpSecret(a));
  assert.notEqual(hash, hashMcpSecret(b));
  assert.ok(!hash.includes(a));
  // Known vector: sha256("abc").
  assert.equal(hashMcpSecret("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

  assert.equal(bearerSecret(`Bearer ${a}`), a);
  assert.equal(bearerSecret(`bearer   ${a}  `), a);
  assert.equal(bearerSecret(undefined), null);
  assert.equal(bearerSecret("Basic abc"), null);
  assert.equal(bearerSecret("Bearer"), null);
});

test("the mcp_tokens migration matches the drizzle table", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../migrations/0015_mcp_tokens.sql", import.meta.url), "utf8");
  assert.match(sql, /"token_hash" text NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_token_hash_unique"/);
  assert.match(sql, /ALTER TABLE "mcp_tokens" ENABLE ROW LEVEL SECURITY/);
  const { mcpTokens } = await import("../shared/schema/mcp.js");
  for (const column of ["id", "name", "tokenHash", "tokenPrefix", "createdByUserId", "createdAt", "lastUsedAt", "revokedAt"]) {
    assert.ok(column in mcpTokens, column);
  }
});
