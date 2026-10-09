// Tags Journey against a real Postgres: the automatic trail of every
// mutation, the stories of a tag / kit / reseller / lead, plans, the
// append-only trigger and the admin-only API.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds. Run it on its own or
// with --no-file-parallelism next to tags.integration.test.ts: both truncate.
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@127.0.0.1:5434/tags_dev?sslmode=disable \
//     npx vitest run --no-file-parallelism tests/tags/journey.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";

const enabled = process.env.TAGS_INTEGRATION === "1";
const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

type Entry = {
  id: string; kind: string; action: string | null; title: string; content: string | null;
  batchId: string | null; tagId: string | null; kitId: string | null; repId: number | null; repName: string | null;
  leadId: number | null; leadName: string | null; planId: string | null; planTitle: string | null;
  beforeValue: string | null; afterValue: string | null; source: string; actor: string;
  actorUserId: string | null; actorEmail: string | null; actorRepId: number | null; actorName: string | null;
  status: string; metadata: Record<string, any>; occurredAt: string;
};

test.skipIf(!enabled)("journey: trail, stories, plans, append-only, admin-only API", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const journey = await import("../../server/tags/journey.js");
  const { TagError } = await import("../../server/tags/repository.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`TRUNCATE tag_journey_entries, tag_plans, tag_provisioning_events, tag_provisioning_jobs,
    tag_provisioning_devices, tag_events, tag_destination_history, tag_direct_writes, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'jt-%')`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'jt-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'jt-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('jt-admin', 'admin@jt.test', 'Admin', true), ('jt-mgr', 'mgr@jt.test', 'Manager', false),
    ('jt-ana', 'ana@jt.test', 'Ana', false), ('jt-bruno', 'bruno@jt.test', 'Bruno', false)`);
  const seeded = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES
    ('jt-admin', 'Admin', 'admin@jt.test', 'admin', true),
    ('jt-mgr', 'Manager', 'mgr@jt.test', 'manager', true),
    ('jt-ana', 'Ana', 'ana@jt.test', 'rep', true),
    ('jt-bruno', 'Bruno', 'bruno@jt.test', 'rep', true)
    RETURNING id, user_id`);
  const repId = Object.fromEntries((seeded.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const product = await db.execute(sql`INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active)
    VALUES ('IT-JOURNEY-KEYCHAIN', 'Journey keychain', 'physical', 2500, true)
    ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`);
  const salesProductId = Number((product.rows[0] as { id: number }).id);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "jt-admin", email: `${userId}@jt.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string | null, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  };
  const story = async (query: string, extra = "") =>
    (await api("GET", `/api/xpot/admin/tag-journey?${query}&limit=500${extra}`, "jt-admin")).json.entries as Entry[];
  /** Chronological actions (the API answers newest first). */
  const actions = (list: Entry[]) => list.map((e) => e.action).reverse();

  try {
    // ── Access: the journey is for admins only ───────────────────────────────
    assert.equal((await api("GET", "/api/xpot/admin/tag-journey", null)).status, 401);
    const asManager = await api("GET", "/api/xpot/admin/tag-journey", "jt-mgr");
    assert.equal(asManager.status, 403);
    assert.equal(asManager.json.message, "Admin access required");
    assert.equal((await api("GET", "/api/xpot/admin/tag-journey", "jt-ana")).status, 403);
    assert.equal((await api("POST", "/api/xpot/admin/tag-journey", "jt-mgr", { kind: "insight", title: "x" })).status, 403);
    assert.equal((await api("GET", "/api/xpot/admin/tag-plans", "jt-mgr")).status, 403);
    assert.equal((await api("PATCH", "/api/xpot/admin/tag-plans/00000000-0000-4000-8000-000000000000", "jt-mgr", { status: "done" })).status, 403);
    // Batches, like the journey, are the global admin's (users.is_admin): a manager gets 403.
    assert.equal((await api("GET", "/api/xpot/admin/tag-batches", "jt-mgr")).status, 403);
    assert.equal((await api("GET", "/api/xpot/admin/tag-journey", "jt-admin")).status, 200);

    // ── The site's own mutations write executions ────────────────────────────
    const created = await api("POST", "/api/xpot/admin/tag-batches", "jt-admin", { name: "Keychains run 1", productType: "keychain", salesProductId, quantity: 10 });
    assert.equal(created.status, 201, created.text);
    const batch = created.json;
    const batchTags = (await api("GET", `/api/xpot/admin/tag-batches/${batch.id}`, "jt-admin")).json.tags as Array<{ id: string; publicCode: string }>;
    const [a1, a2, a3] = batchTags.slice(0, 3);
    const untouched = batchTags[5];
    const moved = batchTags[8];
    const written = batchTags[9];

    const batchEntries = await story(`batchId=${batch.id}`);
    assert.equal(batchEntries.length, 1);
    assert.equal(batchEntries[0].action, "batch_created");
    assert.equal(batchEntries[0].title, `Batch ${batch.batchCode} created: 10 × Keychain`);
    assert.equal(batchEntries[0].content, "Keychains run 1");
    assert.equal(batchEntries[0].afterValue, "generated");
    // face: what is printed on the run (#30); a keychain batch created without one records null.
    assert.deepEqual(batchEntries[0].metadata, { quantity: 10, productType: "keychain", face: null, vendor: null });
    assert.equal(batchEntries[0].source, "admin");
    assert.equal(batchEntries[0].actor, "human");
    assert.equal(batchEntries[0].actorEmail, "admin@jt.test");

    // A kit is one entry carrying the codes it moved.
    const kit = await api("POST", "/api/xpot/admin/tag-kits", "jt-admin", { repId: repId["jt-ana"], batchId: batch.id, quantity: 3, note: "WhatsApp order #1" });
    assert.equal(kit.status, 201, kit.text);
    const kitId = kit.json.id as string;
    const delivered = (await story(`kitId=${kitId}`)).filter((e) => e.action === "kit_delivered");
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].title, "Kit of 3 pieces delivered to Ana");
    assert.equal(delivered[0].repId, repId["jt-ana"]);
    assert.equal(delivered[0].repName, "Ana");
    assert.equal(delivered[0].batchId, batch.id, "one batch: the entry belongs to it");
    assert.equal(delivered[0].content, "WhatsApp order #1");
    assert.deepEqual([...delivered[0].metadata.codes].sort(), [a1, a2, a3].map((t) => t.publicCode).sort());
    assert.equal(delivered[0].metadata.count, 3);

    // The admin gives a1 to a new business by name, sets its link, Ana switches it on and off.
    const assign = await api("POST", `/api/xpot/admin/tags/${a1.id}/assign`, "jt-admin", { leadName: "Taqueria El Sol" });
    assert.equal(assign.status, 200, assign.text);
    const leadA = assign.json.leadId as number;
    const patched = await api("PATCH", `/api/xpot/admin/tags/${a1.id}`, "jt-admin", {
      destinationType: "google_review", destinationUrl: REVIEW, reason: "Client's review link",
    });
    assert.equal(patched.status, 200, patched.text);
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${a1.id}`, "jt-admin", { label: "Counter" })).status, 200); // no destination change, no entry
    assert.equal((await api("POST", `/api/xpot/tags/${a1.id}/activate`, "jt-admin", {})).status, 200);
    assert.equal((await api("POST", `/api/xpot/tags/${a1.id}/disable`, "jt-ana", { reason: "Customer closed for the week" })).status, 200);
    assert.equal((await api("POST", `/api/xpot/admin/tags/${a1.id}/retire`, "jt-admin", { reason: "Lost" })).status, 200);
    assert.equal((await api("POST", `/api/xpot/admin/tags/${a1.id}/restore`, "jt-admin", {})).status, 200);
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, "jt-admin", { status: "completed" })).status, 200);
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, "jt-admin", { notes: "no status change" })).status, 200);

    const a1Story = await story(`tagId=${a1.id}`);
    assert.deepEqual(actions(a1Story), [
      "batch_created", "kit_delivered", "tag_assigned", "destination_changed", "tag_activated",
      "tag_disabled", "tag_retired", "tag_restored", "batch_status_changed",
    ]);
    const by = (list: Entry[], action: string) => list.find((e) => e.action === action)!;
    const assigned = by(a1Story, "tag_assigned");
    assert.equal(assigned.title, "Tag " + a1.publicCode + " assigned to Taqueria El Sol");
    assert.equal(assigned.beforeValue, "inventory");
    assert.equal(assigned.afterValue, "assigned");
    assert.equal(assigned.leadId, leadA);
    assert.equal(assigned.leadName, "Taqueria El Sol");
    assert.deepEqual(assigned.metadata, { newLead: true });
    assert.equal(assigned.batchId, batch.id, "tag entries inherit the batch");
    assert.equal(assigned.kitId, kitId, "...the kit");
    assert.equal(assigned.repId, repId["jt-ana"], "...and the reseller holding the piece");
    assert.equal(assigned.source, "admin");
    assert.equal(assigned.actorRepId, repId["jt-admin"]);
    assert.equal(assigned.actorName, "Admin");
    const dest = by(a1Story, "destination_changed");
    assert.equal(dest.afterValue, REVIEW);
    assert.equal(dest.beforeValue, null);
    assert.equal(dest.content, "Client's review link");
    assert.deepEqual(dest.metadata, { previousType: null, newType: "google_review" });
    // The admin opened the field-app route, so the entry says "field".
    assert.equal(by(a1Story, "tag_activated").source, "field");
    const disabled = by(a1Story, "tag_disabled");
    assert.equal(disabled.source, "field");
    assert.equal(disabled.actor, "human");
    assert.equal(disabled.actorRepId, repId["jt-ana"]);
    assert.equal(disabled.actorName, "Ana");
    assert.equal(disabled.content, "Customer closed for the week");
    assert.equal(disabled.beforeValue, "active");
    assert.equal(disabled.afterValue, "disabled");
    assert.equal(by(a1Story, "tag_retired").source, "admin");
    assert.equal(by(a1Story, "tag_retired").content, "Lost");
    assert.equal(by(a1Story, "batch_status_changed").title, `Batch ${batch.batchCode} completed`);
    assert.equal(by(a1Story, "batch_status_changed").beforeValue, "generated");

    // ── Field app: what a reseller does is recorded, with who did it ─────────
    const sold = await api("POST", `/api/xpot/tags/${a2.id}/quick-activate`, "jt-ana", {
      destinationUrl: REVIEW, destinationType: "google_review", leadName: "Cafe Nuevo",
    });
    assert.equal(sold.status, 200, sold.text);
    const leadB = sold.json.leadId as number;
    // Same piece, new link: a destination change, not a second activation.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/quick-activate`, "jt-ana", {
      destinationUrl: "https://nuevo.example/menu", destinationType: "menu", leadId: leadB,
    })).status, 200);
    // Nothing changed: nothing recorded.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/quick-activate`, "jt-ana", {
      destinationUrl: "https://nuevo.example/menu", destinationType: "menu", leadId: leadB, label: "Counter",
    })).status, 200);
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/nfc-written`, "jt-ana", {
      method: "web_nfc", readbackUrl: `https://xpot.place/n/${a2.publicCode}`,
    })).status, 200);
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/nfc-written`, "jt-ana", { method: "manual" })).status, 200);
    // A refused chip write leaves no entry.
    assert.equal((await api("POST", `/api/xpot/tags/${a3.id}/nfc-written`, "jt-ana", {
      method: "web_nfc", readbackUrl: "https://xpot.place/n/WRONG000",
    })).status, 409);
    assert.equal((await api("POST", "/api/xpot/tag-direct-writes", "jt-ana", { url: REVIEW, method: "web_nfc", verified: true, leadId: leadB })).status, 201);

    const a2Story = await story(`tagId=${a2.id}`);
    assert.deepEqual(actions(a2Story), [
      "batch_created", "kit_delivered", "batch_status_changed", "tag_activated", "destination_changed", "nfc_verified", "nfc_written",
    ]);
    const activated = by(a2Story, "tag_activated");
    assert.equal(activated.title, `Tag ${a2.publicCode} activated in the app`);
    assert.equal(activated.source, "field");
    assert.equal(activated.actor, "human");
    assert.equal(activated.actorRepId, repId["jt-ana"]);
    assert.equal(activated.actorName, "Ana");
    assert.equal(activated.actorUserId, "jt-ana");
    assert.equal(activated.leadId, leadB);
    assert.equal(activated.beforeValue, "inventory");
    assert.equal(activated.afterValue, "active");
    assert.deepEqual(activated.metadata, { destinationType: "google_review", destinationUrl: REVIEW });
    const changed = by(a2Story, "destination_changed");
    assert.equal(changed.source, "field");
    assert.equal(changed.beforeValue, REVIEW);
    assert.equal(changed.afterValue, "https://nuevo.example/menu");
    const verified = by(a2Story, "nfc_verified");
    assert.equal(verified.afterValue, `https://xpot.place/n/${a2.publicCode}`);
    assert.deepEqual(verified.metadata, { method: "web_nfc" });
    assert.equal(by(a2Story, "nfc_written").source, "field");
    assert.ok(!(await story(`tagId=${a3.id}`)).some((e) => e.action?.startsWith("nfc_")), "a refused write is not recorded");

    const direct = (await story(`leadId=${leadB}`)).find((e) => e.action === "direct_write")!;
    assert.equal(direct.source, "field");
    assert.equal(direct.afterValue, REVIEW);
    assert.equal(direct.metadata.method, "web_nfc");
    assert.equal(direct.metadata.verified, true);
    assert.ok(direct.metadata.directWriteId);
    assert.equal(direct.actorRepId, repId["jt-ana"]);

    // ── Returns, reseller changes and standalone pieces ──────────────────────
    const ret = await api("POST", "/api/xpot/admin/tag-kits/return", "jt-admin", { codes: [a3.publicCode] });
    assert.equal(ret.json.returned, 1);
    const returns = (await story(`kitId=${kitId}`)).filter((e) => e.action === "returned_to_house");
    assert.equal(returns.length, 1);
    assert.equal(returns[0].title, "1 piece returned to house stock by Ana");
    assert.equal(returns[0].repId, repId["jt-ana"]);
    assert.deepEqual(returns[0].metadata, { codes: [a3.publicCode], count: 1 });
    assert.equal(returns[0].batchId, null, "a batch id would make it batch-wide for every piece");

    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${moved.id}/rep`, "jt-admin", { repId: repId["jt-bruno"] })).status, 200);
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${moved.id}/rep`, "jt-admin", { repId: repId["jt-bruno"] })).status, 200); // unchanged
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${moved.id}/rep`, "jt-admin", { repId: null })).status, 200);
    const movedStory = await story(`tagId=${moved.id}`);
    assert.deepEqual(actions(movedStory), ["batch_created", "batch_status_changed", "reseller_changed", "reseller_changed"]);
    const moves = movedStory.filter((e) => e.action === "reseller_changed").reverse();
    assert.equal(moves[0].title, `Tag ${moved.publicCode} moved from house to Bruno`);
    assert.deepEqual([moves[0].beforeValue, moves[0].afterValue, moves[0].repId], ["house", "Bruno", repId["jt-bruno"]]);
    assert.deepEqual([moves[1].beforeValue, moves[1].afterValue, moves[1].repId], ["Bruno", "house", null]);

    const single = await api("POST", "/api/xpot/admin/tags", "jt-admin", { productType: "custom", label: "Demo piece" });
    assert.equal(single.status, 201, single.text);
    const singleStory = await story(`tagId=${single.json.id}`);
    assert.deepEqual(actions(singleStory), ["tag_created"]);
    assert.equal(singleStory[0].content, "Demo piece");
    assert.equal(singleStory[0].batchId, null);

    // ── Desktop provisioner: written by the system ───────────────────────────
    const pairing = await api("POST", "/api/xpot/admin/tag-provisioners", "jt-admin", { deviceName: "Workshop PC" });
    const paired = await fetch(`${base}/api/provisioner/pair`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-provisioner-protocol": "1" },
      body: JSON.stringify({ pairingCode: pairing.json.pairingCode, platform: "win32", appVersion: "1.0.0" }),
    }).then((r) => r.json());
    const device = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provisioner-protocol": "1", authorization: `Bearer ${paired.token}` },
        body: JSON.stringify(body),
      });
    assert.equal((await api("POST", `/api/xpot/admin/tags/${written.id}/provisioning-jobs`, "jt-admin", {})).status, 201);
    const job = await (await device("/api/provisioner/jobs/claim", {})).json();
    await device("/api/provisioner/events", { jobId: job.id, type: "write_completed" });
    assert.equal((await (await device(`/api/provisioner/jobs/${job.id}/complete`, { outcome: "succeeded", readbackUrl: job.expectedUrl })).json()).status, "succeeded");
    const writtenStory = await story(`tagId=${written.id}`);
    const sys = by(writtenStory, "nfc_verified");
    assert.equal(sys.source, "system");
    assert.equal(sys.actor, "system");
    assert.equal(sys.actorUserId, null);
    assert.equal(sys.afterValue, job.expectedUrl);
    assert.equal(sys.metadata.jobId, job.id);

    // ── Stories: tag, kit, reseller, lead ────────────────────────────────────
    // A piece that never left house stock sees only the batch-wide entries.
    assert.deepEqual(actions(await story(`tagId=${untouched.id}`)), ["batch_created", "batch_status_changed"]);
    // A returned piece keeps its kit history through the codes the entries list.
    assert.deepEqual(actions(await story(`tagId=${a3.id}`)), ["batch_created", "kit_delivered", "batch_status_changed", "returned_to_house"]);
    // The kit's story: its delivery, the pieces' own entries, the return.
    const kitStory = await story(`kitId=${kitId}`);
    assert.ok(kitStory.some((e) => e.action === "kit_delivered"));
    assert.ok(kitStory.some((e) => e.action === "tag_activated" && e.tagId === a2.id));
    assert.ok(kitStory.some((e) => e.action === "returned_to_house"));
    assert.ok(!kitStory.some((e) => e.action === "batch_created"));
    // The reseller's story: hers, not Bruno's.
    const anaStory = await story(`repId=${repId["jt-ana"]}`);
    assert.ok(anaStory.some((e) => e.action === "kit_delivered"));
    assert.ok(anaStory.some((e) => e.action === "tag_activated" && e.actorRepId === repId["jt-ana"]));
    assert.ok(!anaStory.some((e) => e.action === "reseller_changed"));
    const brunoStory = await story(`repId=${repId["jt-bruno"]}`);
    assert.deepEqual(brunoStory.map((e) => e.action), ["reseller_changed"]);
    // The customer's story.
    const leadStory = await story(`leadId=${leadA}`);
    assert.ok(leadStory.some((e) => e.action === "tag_assigned"));
    assert.ok(leadStory.some((e) => e.action === "tag_activated"));
    assert.ok(!leadStory.some((e) => e.leadId === leadB));
    // Paging.
    assert.equal((await story(`batchId=${batch.id}`)).length > 3, true);
    assert.equal((await api("GET", `/api/xpot/admin/tag-journey?batchId=${batch.id}&limit=2`, "jt-admin")).json.entries.length, 2);

    // ── Entries recorded from outside (admin / MCP) ──────────────────────────
    const printed = await journey.createJourneyEntry({
      kind: "execution",
      action: "printed",
      title: "Card plate printed",
      batchId: batch.id,
      metadata: { minutes: 163.8 },
      occurredAt: new Date("2026-10-03T15:00:00Z"),
    }, journey.journeyContext(null, "mcp"));
    assert.equal(printed.occurredAt, "2026-10-03T15:00:00.000Z");
    assert.deepEqual(printed.metadata, { minutes: 163.8 });
    assert.equal(printed.source, "mcp");
    assert.equal(printed.actor, "ai");

    const proposed = await api("POST", "/api/xpot/admin/tag-journey", "jt-admin", {
      kind: "insight", title: "QR reads from 30 cm", tagId: untouched.id, proposed: true,
    });
    assert.equal(proposed.status, 201, proposed.text);
    assert.equal(proposed.json.status, "needs_review");
    assert.equal(proposed.json.source, "admin");
    assert.equal(proposed.json.actor, "human");
    assert.equal(proposed.json.batchId, batch.id, "an entry about a tag inherits its batch");
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-journey/${proposed.json.id}`, "jt-admin", { status: "active" })).json.status, "active");
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-journey/${proposed.json.id}`, "jt-admin", { status: "superseded" })).json.status, "superseded");
    assert.ok(!(await story(`tagId=${untouched.id}`)).some((e) => e.id === proposed.json.id), "superseded entries are hidden");
    assert.ok((await story(`tagId=${untouched.id}`, "&includeArchived=1")).some((e) => e.id === proposed.json.id));
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-journey/${proposed.json.id}`, "jt-admin", { title: "rewritten" })).status, 400);
    assert.equal((await api("PATCH", "/api/xpot/admin/tag-journey/00000000-0000-4000-8000-000000000000", "jt-admin", { status: "active" })).status, 404);
    assert.equal((await api("POST", "/api/xpot/admin/tag-journey", "jt-admin", { kind: "insight", title: "x", batchId: "00000000-0000-4000-8000-000000000000" })).status, 404);
    assert.equal((await api("POST", "/api/xpot/admin/tag-journey", "jt-admin", { kind: "milestone", title: "x" })).status, 400);

    // Append-only at the database level.
    await assert.rejects(
      db.execute(sql`UPDATE tag_journey_entries SET title = 'rewritten' WHERE id = ${printed.id}`),
      (err: Error) => /append-only/.test(`${err.message} ${(err.cause as Error | undefined)?.message ?? ""}`),
    );
    await assert.rejects(
      journey.createJourneyEntry({ kind: "insight", title: "x", batchId: "00000000-0000-4000-8000-000000000000" }, journey.journeyContext(null, "mcp")),
      (err: unknown) => err instanceof TagError && err.status === 404,
    );
    assert.equal(await journey.resolveBatchId(batch.batchCode.toLowerCase()), batch.id);
    assert.equal(await journey.resolveTagId(a1.publicCode.toLowerCase()), a1.id);
    await assert.rejects(journey.resolveBatchId("NOPE-0000"), (err: unknown) => err instanceof TagError && err.status === 404);

    // ── Plans ────────────────────────────────────────────────────────────────
    const planRes = await api("POST", "/api/xpot/admin/tag-plans", "jt-admin", {
      kind: "experiment", title: "Slot fit, 0.15 clearance", tagId: untouched.id, dueDate: "2026-10-10",
    });
    assert.equal(planRes.status, 201, planRes.text);
    const plan = planRes.json;
    assert.equal(plan.batchId, batch.id);
    assert.equal(plan.dueDate, "2026-10-10");
    assert.equal(plan.status, "active");
    const closed = await api("PATCH", `/api/xpot/admin/tag-plans/${plan.id}`, "jt-admin", { status: "validated", outcome: "Holds by friction, no wobble" });
    assert.equal(closed.status, 200, closed.text);
    assert.equal(closed.json.status, "validated");
    assert.ok(closed.json.closedAt);
    const planStory = await story(`planId=${plan.id}`);
    assert.deepEqual(planStory.map((e) => [e.kind, e.action]).reverse(), [["decision", "plan_created"], ["result", "plan_status_changed"]]);
    assert.equal(planStory[0].content, "Holds by friction, no wobble");
    assert.equal(planStory[0].beforeValue, "active");
    assert.equal(planStory[0].afterValue, "validated");
    assert.equal(planStory[0].planTitle, "Slot fit, 0.15 clearance");
    assert.equal(planStory[0].source, "admin");
    assert.equal((await api("GET", `/api/xpot/admin/tag-plans?batchId=${batch.id}`, "jt-admin")).json.length, 0, "closed plans are not open");
    assert.equal((await api("GET", `/api/xpot/admin/tag-plans?batchId=${batch.id}&status=all`, "jt-admin")).json.length, 1);
    assert.equal((await api("GET", `/api/xpot/admin/tag-plans?tagId=${untouched.id}&status=closed`, "jt-admin")).json.length, 1);
    assert.equal((await api("GET", `/api/xpot/admin/tag-plans?tagId=${a1.id}&status=all`, "jt-admin")).json.length, 0);
    const reopened = await api("PATCH", `/api/xpot/admin/tag-plans/${plan.id}`, "jt-admin", { status: "active" });
    assert.equal(reopened.json.closedAt, null);
    assert.equal((await api("POST", "/api/xpot/admin/tag-plans", "jt-admin", { kind: "idea", title: "x" })).status, 400);
    assert.equal((await api("PATCH", "/api/xpot/admin/tag-plans/00000000-0000-4000-8000-000000000000", "jt-admin", { status: "done" })).status, 404);
    const whole = await api("GET", `/api/xpot/admin/tag-journey?batchId=${batch.id}`, "jt-admin");
    assert.equal(whole.json.plans.length, 1);
    assert.ok(whole.json.entries.length > 5);

    // ── Deleting a parent row nulls the pointer; the trigger lets that through ─
    await db.execute(sql`DELETE FROM tag_plans WHERE id = ${plan.id}`);
    const orphan = (await story(`batchId=${batch.id}`)).find((e) => e.action === "plan_created")!;
    assert.equal(orphan.planId, null);
    assert.equal(orphan.title, `Experiment planned: Slot fit, 0.15 clearance`);
    await db.execute(sql`DELETE FROM sales_leads WHERE id = ${leadB}`);
    assert.ok((await story(`tagId=${a2.id}`)).every((e) => e.leadId !== leadB));
    assert.ok((await story(`tagId=${a2.id}`)).some((e) => e.action === "tag_activated"), "the entry survives, unlinked");
  } finally {
    server.close();
    await pool.end();
  }
});
