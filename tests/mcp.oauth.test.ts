// The MCP OAuth server's checks that answer before any database query:
// discovery documents, registration and redirect validation, the authorize
// and token guards, CORS on /mcp, and the PKCE / scope primitives. The full
// flow against Postgres is in mcp.oauth.integration.test.ts.
import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import express from "express";
import type { AddressInfo } from "net";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";

async function withServer(fn: (base: string) => Promise<void>) {
  const { registerMcpRoutes } = await import("../server/mcp/routes.js");
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  registerMcpRoutes(app);
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test("discovery: protected resource and authorization server metadata, on both paths", async () => {
  await withServer(async (base) => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
      const body = await res.json();
      assert.equal(body.resource, `${base}/mcp`);
      assert.deepEqual(body.authorization_servers, [base]);
      assert.deepEqual(body.scopes_supported, ["xpot:journey"]);
    }
    for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp"]) {
      const body = await (await fetch(`${base}${path}`)).json();
      assert.equal(body.issuer, base, path);
      assert.equal(body.authorization_endpoint, `${base}/oauth/authorize`);
      assert.equal(body.token_endpoint, `${base}/oauth/token`);
      assert.equal(body.registration_endpoint, `${base}/oauth/register`);
      assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
    }
  });
});

test("PUBLIC_BASE_URL pins the issuer whatever the Host header says", async () => {
  process.env.PUBLIC_BASE_URL = "https://xpot.example/";
  try {
    await withServer(async (base) => {
      const body = await (await fetch(`${base}/.well-known/oauth-authorization-server`, { headers: { "x-forwarded-host": "evil.test" } })).json();
      assert.equal(body.issuer, "https://xpot.example");
      assert.equal(body.token_endpoint, "https://xpot.example/oauth/token");
    });
  } finally {
    delete process.env.PUBLIC_BASE_URL;
  }
});

test("registration refuses bad metadata before touching the database", async () => {
  await withServer(async (base) => {
    const register = (body: unknown) =>
      fetch(`${base}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    for (const body of [
      {},
      { redirect_uris: [] },
      { redirect_uris: ["http://evil.test/callback"] }, // http only on loopback
      { redirect_uris: ["javascript:alert(1)"] },
      { redirect_uris: ["https://claude.ai/cb#frag"] },
      { redirect_uris: ["https://claude.ai/cb"], grant_types: ["client_credentials"] },
      { redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "private_key_jwt" },
    ]) {
      const res = await register(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json()).error, /^invalid_/);
    }
  });
});

test("authorize without a known client shows an error page and never redirects", async () => {
  await withServer(async (base) => {
    const missing = await fetch(`${base}/oauth/authorize?redirect_uri=https://evil.test/cb`, { redirect: "manual" });
    assert.equal(missing.status, 400);
    assert.match(missing.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(missing.headers.get("location"), null);
  });
});

test("consent POST without a session or with a stale form is refused", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/oauth/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "decision=allow&client_id=x&redirect_uri=https%3A%2F%2Fevil.test%2Fcb",
      redirect: "manual",
    });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("location"), null);
  });
});

test("token endpoint: client_id is required; unknown grants are refused", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=x",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_client");
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

test("/mcp answers CORS preflights and exposes the challenge header", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mcp`, { method: "OPTIONS", headers: { origin: "http://localhost:6274" } });
    assert.equal(res.status, 204);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /Authorization/);
    assert.match(res.headers.get("access-control-expose-headers") ?? "", /WWW-Authenticate/);
    // A bearer of neither shape is refused without a lookup.
    const bad = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer xpot_at_short" },
      body: "{}",
    });
    assert.equal(bad.status, 401);
    assert.match(bad.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
  });
});

test("pkce, scopes, redirect rules and token shapes", async () => {
  const store = await import("../server/mcp/oauthStore.js");
  const { isAllowedRedirectUri } = await import("../server/mcp/oauth.js");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(store.verifyPkce(verifier, challenge), true);
  assert.equal(store.verifyPkce(randomBytes(48).toString("base64url"), challenge), false);
  assert.equal(store.verifyPkce(verifier, verifier), false); // "plain" is not accepted
  for (const short of ["a".repeat(42), "a".repeat(129)]) {
    assert.equal(store.verifyPkce(short, createHash("sha256").update(short).digest("base64url")), false);
  }

  assert.equal(store.normalizeScope("xpot:journey openid"), "xpot:journey");
  assert.equal(store.normalizeScope("email offline_access"), store.DEFAULT_SCOPE);
  assert.equal(store.normalizeScope(undefined), store.DEFAULT_SCOPE);

  assert.equal(store.safeEqual("abc", "abc"), true);
  assert.equal(store.safeEqual("abc", "abd"), false);
  assert.equal(store.safeEqual("abc", "abcd"), false);

  assert.equal(store.looksLikeOauthAccessToken(`xpot_at_${"a".repeat(43)}`), true);
  assert.equal(store.looksLikeOauthAccessToken(`xpot_rt_${"a".repeat(43)}`), false); // a refresh token is not a bearer
  assert.equal(store.looksLikeOauthAccessToken(`xpot_mcp_${"a".repeat(43)}`), false);

  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/oauth/callback", "http://127.0.0.1:33418/cb"]) {
    assert.equal(isAllowedRedirectUri(ok), true, ok);
  }
  for (const bad of ["http://claude.ai/cb", "ftp://x/cb", "not a url", "https://x.test/cb#f"]) {
    assert.equal(isAllowedRedirectUri(bad), false, bad);
  }
});

test("the 0018 migration matches the drizzle tables", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../migrations/0018_mcp_oauth.sql", import.meta.url), "utf8");
  for (const table of ["mcp_oauth_clients", "mcp_oauth_codes", "mcp_oauth_tokens"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  }
  const schema = await import("../shared/schema/mcp.js");
  for (const column of ["clientId", "clientSecretHash", "redirectUris", "tokenEndpointAuthMethod"]) assert.ok(column in schema.mcpOauthClients, column);
  for (const column of ["codeHash", "codeChallenge", "resource", "consumedAt"]) assert.ok(column in schema.mcpOauthCodes, column);
  for (const column of ["tokenHash", "kind", "userId", "expiresAt", "revokedAt", "lastUsedAt"]) assert.ok(column in schema.mcpOauthTokens, column);
});
