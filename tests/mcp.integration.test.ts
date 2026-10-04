// The MCP endpoint against a real Postgres, driven with the MCP SDK client:
// an admin creates a token through the admin API, a client lists the tools and
// records / reads the journey and creates a plan, a revoked token is refused.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds, so run it with
// --no-file-parallelism next to the other integration tests.
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@127.0.0.1:5434/postgres?sslmode=disable \
//     npx vitest run --no-file-parallelism tests/mcp.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const enabled = process.env.TAGS_INTEGRATION === "1";

test.skipIf(!enabled)("mcp: token via admin API, tools over Streamable HTTP, revoked token refused", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../server/tags/routes.js");
  const { registerMcpRoutes } = await import("../server/mcp/routes.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`TRUNCATE tag_journey_entries, tag_plans, tag_provisioning_events, tag_provisioning_jobs,
    tag_provisioning_devices, tag_events, tag_destination_history, tag_direct_writes, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM mcp_tokens`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'jm-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'jm-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('jm-admin', 'admin@jm.test', 'Admin', true), ('jm-mgr', 'mgr@jm.test', 'Manager', false)`);
  await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES
    ('jm-admin', 'Admin', 'admin@jm.test', 'admin', true),
    ('jm-mgr', 'Manager', 'mgr@jm.test', 'manager', true)`);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "jm-admin", email: `${userId}@jm.test` } : {};
    next();
  });
  registerTagRoutes(app);
  registerMcpRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string | null, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* not json */ }
    return { status: res.status, json, raw };
  };
  const connect = async (secret: string) => {
    const client = new Client({ name: "mcp-integration-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    }));
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    const text = result.content[0].text;
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* an error message */ }
    return { isError: result.isError === true, text, json };
  };

  try {
    // ── Token admin API: admins only, the secret is returned once ─────────────
    assert.equal((await api("GET", "/api/xpot/admin/mcp-tokens", "jm-mgr")).status, 403);
    assert.equal((await api("POST", "/api/xpot/admin/mcp-tokens", "jm-mgr", { name: "x" })).status, 403);
    assert.equal((await api("POST", "/api/xpot/admin/mcp-tokens", "jm-admin", { name: "  " })).status, 400);
    const created = await api("POST", "/api/xpot/admin/mcp-tokens", "jm-admin", { name: "Claude Code (test)" });
    assert.equal(created.status, 201, created.raw);
    const secret = created.json.secret as string;
    assert.match(secret, /^xpot_mcp_[A-Za-z0-9_-]{43}$/);
    assert.equal(created.json.token.name, "Claude Code (test)");
    assert.equal(created.json.token.tokenPrefix, secret.slice(0, 13));
    assert.equal(created.json.token.revokedAt, null);
    assert.equal(created.json.token.lastUsedAt, null);
    const tokenId = created.json.token.id as string;

    // Only the hash is stored.
    const stored = (await db.execute(sql`SELECT token_hash, created_by_user_id FROM mcp_tokens WHERE id = ${tokenId}`)).rows[0] as any;
    assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(stored.token_hash, secret);
    assert.equal(stored.created_by_user_id, "jm-admin");
    const listed = await api("GET", "/api/xpot/admin/mcp-tokens", "jm-admin");
    assert.equal(listed.status, 200);
    assert.equal(listed.json.length, 1);
    assert.ok(!listed.raw.includes(secret), "the list never carries the secret");
    assert.ok(!("tokenHash" in listed.json[0]));

    // ── Endpoint: unknown (well-formed) and missing tokens are 401 ────────────
    const rpc = (authorization?: string) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    assert.equal((await rpc()).status, 401);
    assert.equal((await rpc(`Bearer xpot_mcp_${"A".repeat(43)}`)).status, 401);

    // ── A client lists the tools and uses them ────────────────────────────────
    const client = await connect(secret);
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(tools, [
        "tags_batches_list", "tags_get", "tags_journey_get", "tags_journey_record", "tags_journey_review",
        "tags_plan_create", "tags_plan_update", "tags_plans_list",
      ]);

      // Something to document: a batch made through the site's own API.
      const batch = (await api("POST", "/api/xpot/admin/tag-batches", "jm-admin", { name: "MCP run", productType: "keychain", quantity: 4 })).json;
      const first = ((await api("GET", `/api/xpot/admin/tag-batches/${batch.id}`, "jm-admin")).json.tags as Array<{ id: string; publicCode: string }>)[0];

      const batches = await call(client, "tags_batches_list");
      assert.equal(batches.isError, false);
      assert.equal(batches.json[0].batchCode, batch.batchCode);
      const tagDetail = await call(client, "tags_get", { tag: first.publicCode.toLowerCase() });
      assert.equal(tagDetail.json.id, first.id);
      assert.equal(tagDetail.json.publicCode, first.publicCode);

      // Record by batch code; object params also arrive as JSON strings.
      const recorded = await call(client, "tags_journey_record", {
        entry: { kind: "execution", action: "printed", title: "Plate printed", content: "163 min, PLA", batch: batch.batchCode.toLowerCase(), metadata: { minutes: 163 } },
      });
      assert.equal(recorded.isError, false, recorded.text);
      assert.equal(recorded.json.source, "mcp");
      assert.equal(recorded.json.actor, "ai");
      assert.equal(recorded.json.actorUserId, null);
      assert.equal(recorded.json.batchId, batch.id);
      assert.equal(recorded.json.batchCode, batch.batchCode);
      assert.equal(recorded.json.status, "active");
      const proposed = await call(client, "tags_journey_record", {
        entry: JSON.stringify({ kind: "insight", title: "Slot is tight", tag: first.publicCode, proposed: true }),
      });
      assert.equal(proposed.isError, false, proposed.text);
      assert.equal(proposed.json.status, "needs_review");
      assert.equal(proposed.json.tagId, first.id);
      assert.equal(proposed.json.batchId, batch.id, "an entry about a tag inherits its batch");

      // Reading: oldest first by default, the site's own entry included.
      const story = await call(client, "tags_journey_get", { filters: { tag: first.publicCode } });
      assert.equal(story.isError, false, story.text);
      const actions = story.json.entries.map((e: any) => e.action ?? e.kind);
      assert.deepEqual(actions, ["batch_created", "printed", "insight"]);
      const newest = await call(client, "tags_journey_get", { filters: { batch: batch.batchCode, order: "desc", limit: 1 } });
      assert.equal(newest.json.entries.length, 1);
      assert.equal(newest.json.entries[0].title, "Slot is tight");

      // Review.
      const approved = await call(client, "tags_journey_review", { entryId: proposed.json.id, status: "active" });
      assert.equal(approved.json.status, "active");

      // Plans.
      const plan = await call(client, "tags_plan_create", {
        plan: { kind: "experiment", title: "Slot fit, 0.15 clearance", batch: batch.batchCode, dueDate: "2026-10-10" },
      });
      assert.equal(plan.isError, false, plan.text);
      assert.equal(plan.json.status, "active");
      assert.equal(plan.json.batchId, batch.id);
      const open = await call(client, "tags_plans_list", { filters: { batch: batch.batchCode } });
      assert.equal(open.json.length, 1);
      const closed = await call(client, "tags_plan_update", { planId: plan.json.id, patch: { status: "validated", outcome: "Holds by friction" } });
      assert.equal(closed.json.status, "validated");
      assert.notEqual(closed.json.closedAt, null);
      assert.equal((await call(client, "tags_plans_list", { filters: { batch: batch.batchCode } })).json.length, 0);
      const withResult = await call(client, "tags_journey_get", { filters: { planId: plan.json.id } });
      assert.deepEqual(withResult.json.entries.map((e: any) => e.action), ["plan_created", "plan_status_changed"]);
      assert.equal(withResult.json.entries[1].content, "Holds by friction");
      assert.equal(withResult.json.entries[1].source, "mcp");

      // Errors come back as isError results, not protocol failures.
      const badKind = await call(client, "tags_journey_record", { entry: { kind: "milestone", title: "x" } });
      assert.equal(badKind.isError, true);
      assert.match(badKind.text, /kind/);
      const noBatch = await call(client, "tags_journey_record", { entry: { kind: "insight", title: "x", batch: "NOPE-0000" } });
      assert.equal(noBatch.isError, true);
      assert.equal(noBatch.text, "No batch with that id or code");
      const noTag = await call(client, "tags_get", { tag: "ZZZZZZZZ" });
      assert.equal(noTag.isError, true);
      const missingPlan = await call(client, "tags_plan_update", { planId: "00000000-0000-4000-8000-000000000000", patch: { status: "done" } });
      assert.equal(missingPlan.isError, true);
      assert.equal(missingPlan.text, "Plan not found");
    } finally {
      await client.close();
    }

    // The token's last use is recorded.
    let lastUsed: string | null = null;
    for (let i = 0; i < 20 && !lastUsed; i++) {
      lastUsed = (await api("GET", "/api/xpot/admin/mcp-tokens", "jm-admin")).json[0].lastUsedAt;
      if (!lastUsed) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(lastUsed, "last_used_at is set");

    // ── Revoking cuts access at once ──────────────────────────────────────────
    assert.equal((await api("POST", `/api/xpot/admin/mcp-tokens/${tokenId}/revoke`, "jm-mgr")).status, 403);
    assert.equal((await api("POST", "/api/xpot/admin/mcp-tokens/00000000-0000-4000-8000-000000000000/revoke", "jm-admin")).status, 404);
    const revoked = await api("POST", `/api/xpot/admin/mcp-tokens/${tokenId}/revoke`, "jm-admin");
    assert.equal(revoked.status, 200);
    assert.notEqual(revoked.json.revokedAt, null);
    assert.equal((await api("POST", `/api/xpot/admin/mcp-tokens/${tokenId}/revoke`, "jm-admin")).status, 200, "revoking twice is harmless");
    assert.equal((await rpc(`Bearer ${secret}`)).status, 401);
    await assert.rejects(connect(secret));
    assert.notEqual((await api("GET", "/api/xpot/admin/mcp-tokens", "jm-admin")).json[0].revokedAt, null);
  } finally {
    server.close();
    await pool.end();
  }
});
