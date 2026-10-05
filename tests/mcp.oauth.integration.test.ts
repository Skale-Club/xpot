// The MCP OAuth flow end to end against a real Postgres, as Claude or ChatGPT
// drive it: register, sign-in bounce, consent, code → tokens (PKCE), tools
// over Streamable HTTP with the access token, refresh rotation, the admin's
// connection list and revoke, and access cut when the approver stops being
// an admin.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It replaces the
// test users/reps it seeds and empties the mcp_oauth_* tables.
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@127.0.0.1:5434/postgres?sslmode=disable \
//     npx vitest run --no-file-parallelism tests/mcp.oauth.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import express from "express";
import type { AddressInfo } from "net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("mcp oauth: register, consent, PKCE exchange, tools, refresh, revoke, demotion", async () => {
  const { registerMcpRoutes } = await import("../server/mcp/routes.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`DELETE FROM mcp_oauth_tokens`);
  await db.execute(sql`DELETE FROM mcp_oauth_codes`);
  await db.execute(sql`DELETE FROM mcp_oauth_clients`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'mo-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'mo-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('mo-admin', 'admin@mo.test', 'Admin', true), ('mo-rep', 'rep@mo.test', 'Rep', false)`);
  await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES
    ('mo-admin', 'Admin', 'admin@mo.test', 'admin', true),
    ('mo-rep', 'Rep', 'rep@mo.test', 'rep', true)`);

  // One mutable session per test user (the consent state lives in it).
  const sessions = new Map<string, Record<string, unknown>>();
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    if (userId && !sessions.has(userId)) sessions.set(userId, { userId, isAdmin: userId === "mo-admin", email: `${userId}@mo.test` });
    (req as any).session = userId ? sessions.get(userId) : {};
    next();
  });
  registerMcpRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const redirectUri = "https://client.test/callback";
  const form = (body: Record<string, string>) => new URLSearchParams(body).toString();
  const formHeaders = { "content-type": "application/x-www-form-urlencoded" };
  const token = async (body: Record<string, string>) => {
    const res = await fetch(`${base}/oauth/token`, { method: "POST", headers: formHeaders, body: form(body) });
    return { status: res.status, json: (await res.json()) as any };
  };
  const tools = async (accessToken: string) => {
    const client = new Client({ name: "mcp-oauth-integration", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    }));
    try {
      return (await client.listTools()).tools.map((t) => t.name);
    } finally {
      await client.close();
    }
  };
  const rpcStatus = async (accessToken: string) =>
    (await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })).status;

  /** Runs authorize → consent as `user`; returns the code (or the response when refused). */
  const authorize = async (user: string | null, clientId: string, challenge: string) => {
    const query = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirectUri, state: "st-1",
      code_challenge: challenge, code_challenge_method: "S256", scope: "xpot:journey openid", resource: `${base}/mcp`,
    });
    return fetch(`${base}/oauth/authorize?${query}`, { redirect: "manual", headers: user ? { "x-test-user": user } : {} });
  };

  try {
    // ── Registration ────────────────────────────────────────────────────────
    const reg = await fetch(`${base}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
    });
    assert.equal(reg.status, 201);
    const registered = (await reg.json()) as any;
    const clientId = registered.client_id as string;
    assert.match(clientId, /^xpot_client_[A-Za-z0-9_-]{43}$/);
    assert.equal(registered.client_secret, undefined, "public clients get no secret");

    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    // ── Authorize: unregistered redirect, no session, non-admin ─────────────
    const wrongRedirect = await fetch(`${base}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent("https://evil.test/cb")}&code_challenge=${challenge}&code_challenge_method=S256`, { redirect: "manual" });
    assert.equal(wrongRedirect.status, 400);
    assert.equal(wrongRedirect.headers.get("location"), null);

    const anon = await authorize(null, clientId, challenge);
    assert.equal(anon.status, 302);
    const next = new URL(anon.headers.get("location")!, base);
    assert.equal(next.pathname, "/");
    assert.ok(next.searchParams.get("next")!.startsWith("/oauth/authorize?"), "back to the same authorize URL after sign-in");

    assert.equal((await authorize("mo-rep", clientId, challenge)).status, 403);

    // ── Consent as the admin ────────────────────────────────────────────────
    const page = await authorize("mo-admin", clientId, challenge);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes("client.test"), "the consent page names where access goes");
    const consentState = /name="consent_state" value="([^"]+)"/.exec(html)![1];
    const fields = {
      consent_state: consentState, client_id: clientId, redirect_uri: redirectUri, scope: "xpot:journey",
      state: "st-1", code_challenge: challenge, resource: `${base}/mcp`, decision: "allow",
    };
    const approved = await fetch(`${base}/oauth/authorize`, { method: "POST", redirect: "manual", headers: { ...formHeaders, "x-test-user": "mo-admin" }, body: form(fields) });
    assert.equal(approved.status, 302);
    const callback = new URL(approved.headers.get("location")!);
    assert.equal(`${callback.origin}${callback.pathname}`, redirectUri);
    assert.equal(callback.searchParams.get("state"), "st-1");
    const code = callback.searchParams.get("code")!;
    assert.match(code, /^xpot_code_/);

    // The consent form is one-shot.
    const replayed = await fetch(`${base}/oauth/authorize`, { method: "POST", redirect: "manual", headers: { ...formHeaders, "x-test-user": "mo-admin" }, body: form(fields) });
    assert.equal(replayed.status, 400);

    // ── Code → tokens ───────────────────────────────────────────────────────
    const exchanged = await token({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri });
    assert.equal(exchanged.status, 200, JSON.stringify(exchanged.json));
    assert.equal(exchanged.json.token_type, "Bearer");
    assert.equal(exchanged.json.scope, "xpot:journey");
    assert.match(exchanged.json.access_token, /^xpot_at_[A-Za-z0-9_-]{43}$/);
    const replayCode = await token({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier });
    assert.equal(replayCode.json.error, "invalid_grant", "a code works once");
    const stored = (await db.execute(sql`SELECT token_hash FROM mcp_oauth_tokens`)).rows as Array<{ token_hash: string }>;
    assert.ok(stored.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash) && r.token_hash !== exchanged.json.access_token));

    // A wrong verifier fails (on a fresh code).
    const page2 = await (await authorize("mo-admin", clientId, challenge)).text();
    const code2 = new URL((await fetch(`${base}/oauth/authorize`, {
      method: "POST", redirect: "manual", headers: { ...formHeaders, "x-test-user": "mo-admin" },
      body: form({ ...fields, consent_state: /name="consent_state" value="([^"]+)"/.exec(page2)![1] }),
    })).headers.get("location")!).searchParams.get("code")!;
    assert.equal((await token({ grant_type: "authorization_code", client_id: clientId, code: code2, code_verifier: randomBytes(48).toString("base64url") })).json.error, "invalid_grant");

    // ── The access token works on /mcp ──────────────────────────────────────
    const names = await tools(exchanged.json.access_token);
    assert.ok(names.includes("tags_journey_get") && names.includes("tags_batch_create"), names.join(","));

    // ── Refresh rotates; the old refresh token dies ─────────────────────────
    const refreshed = await token({ grant_type: "refresh_token", client_id: clientId, refresh_token: exchanged.json.refresh_token });
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.json));
    assert.notEqual(refreshed.json.refresh_token, exchanged.json.refresh_token);
    assert.equal((await token({ grant_type: "refresh_token", client_id: clientId, refresh_token: exchanged.json.refresh_token })).json.error, "invalid_grant");
    assert.equal(await rpcStatus(refreshed.json.access_token), 200);

    // ── Admin list ──────────────────────────────────────────────────────────
    const listRes = await fetch(`${base}/api/xpot/admin/mcp-connections`, { headers: { "x-test-user": "mo-admin" } });
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as any[];
    assert.equal(list.length, 1);
    assert.equal(list[0].clientName, "Claude");
    assert.equal(list[0].redirectHost, "client.test");
    assert.equal(list[0].userLabel, "admin@mo.test");
    assert.ok(list[0].lastUsedAt, "use is stamped");
    assert.equal((await fetch(`${base}/api/xpot/admin/mcp-connections`, { headers: { "x-test-user": "mo-rep" } })).status, 403);

    // ── Losing admin cuts access at once; getting it back restores it ───────
    await db.execute(sql`UPDATE users SET is_admin = false WHERE id = 'mo-admin'`);
    // The rep's admin role alone is not enough: MCP is the global admin's (users.is_admin).
    assert.equal(await rpcStatus(refreshed.json.access_token), 403);
    await db.execute(sql`UPDATE sales_reps SET role = 'rep' WHERE user_id = 'mo-admin'`);
    assert.equal(await rpcStatus(refreshed.json.access_token), 403);
    await db.execute(sql`UPDATE users SET is_admin = true WHERE id = 'mo-admin'`);
    await db.execute(sql`UPDATE sales_reps SET role = 'admin' WHERE user_id = 'mo-admin'`);
    assert.equal(await rpcStatus(refreshed.json.access_token), 200);

    // ── Revoke from the admin: every token of the client stops working ──────
    const revoked = await fetch(`${base}/api/xpot/admin/mcp-connections/${clientId}/revoke`, { method: "POST", headers: { "x-test-user": "mo-admin" } });
    assert.equal(revoked.status, 200);
    assert.ok(((await revoked.json()) as any).revoked >= 2);
    assert.equal(await rpcStatus(refreshed.json.access_token), 401);
    assert.equal((await token({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshed.json.refresh_token })).json.error, "invalid_grant");
    assert.equal(((await (await fetch(`${base}/api/xpot/admin/mcp-connections`, { headers: { "x-test-user": "mo-admin" } })).json()) as any[]).length, 0);
  } finally {
    server.close();
    await pool.end();
  }
}, 60_000);
