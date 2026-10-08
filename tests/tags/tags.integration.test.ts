// Xpot Tags end to end against a real Postgres: kits to resellers, reseller
// isolation, field activation, scans, phone chip writes, direct links, the
// admin report, returns to house stock and the desktop provisioner.
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable
// database with every migration applied (npm run migrate). It TRUNCATEs the
// tag tables and replaces the test users/reps it seeds.
//
//   TAGS_INTEGRATION=1 DATABASE_URL=postgresql://postgres@127.0.0.1:5434/tags_dev?sslmode=disable \
//     npx vitest run tests/tags/tags.integration.test.ts
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import { unzipSync, strFromU8 } from "fflate";

const enabled = process.env.TAGS_INTEGRATION === "1";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

test.skipIf(!enabled)("tags: kits, reseller isolation, sales, scans, report, provisioner", async () => {
  process.env.TAG_PUBLIC_BASE_URL = "https://xpot.place";
  const { registerTagRoutes } = await import("../../server/tags/routes.js");
  const { db, pool } = await import("../../server/db.js");
  const { sql } = await import("drizzle-orm");

  await db.execute(sql`TRUNCATE tag_provisioning_events, tag_provisioning_jobs, tag_provisioning_devices, tag_events,
    tag_destination_history, tag_direct_writes, tags, tag_kits, tag_batches CASCADE`);
  await db.execute(sql`DELETE FROM sales_leads WHERE owner_rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'it-%')`);
  await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'it-%'`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE 'it-%'`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('it-admin', 'admin@it.test', 'Admin', true), ('it-ana', 'ana@it.test', 'Ana', false),
    ('it-bruno', 'bruno@it.test', 'Bruno', false), ('it-carla', 'carla@it.test', 'Carla', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES
    ('it-admin', 'Admin', 'admin@it.test', 'admin', true),
    ('it-ana', 'Ana', 'ana@it.test', 'rep', true),
    ('it-bruno', 'Bruno', 'bruno@it.test', 'rep', true),
    ('it-carla', 'Carla', 'carla@it.test', 'rep', false)
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));

  const app = express();
  app.use(express.json());
  // Stand-in for the Supabase-backed session: the header names the user.
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "it-admin", email: `${userId}@it.test` } : {};
    next();
  });
  registerTagRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, user: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-test-user": user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* csv/zip/html */ }
    return { status: res.status, json, text };
  };
  const scan = (path: string, user?: string) =>
    fetch(`${base}${path}`, { redirect: "manual", headers: { "user-agent": PHONE_UA, ...(user ? { "x-test-user": user } : {}) } });
  const settle = () => new Promise((r) => setTimeout(r, 200));

  try {
    // Resellers cannot run the warehouse.
    assert.equal((await api("POST", "/api/xpot/admin/tag-batches", "it-ana", { name: "x", productType: "keychain", quantity: 1 })).status, 403);
    // A switched-off rep gets nothing.
    assert.equal((await api("GET", "/api/xpot/tags", "it-carla")).status, 403);

    // A batch of 10 pieces lands in house stock.
    const batch = await api("POST", "/api/xpot/admin/tag-batches", "it-admin", { name: "Keychains run 1", productType: "keychain", quantity: 10 });
    assert.equal(batch.status, 201, batch.text);
    const batchTags = (await api("GET", `/api/xpot/admin/tag-batches/${batch.json.id}`, "it-admin")).json.tags as Array<{ id: string; publicCode: string; repId: number | null }>;
    assert.equal(batchTags.length, 10);
    assert.ok(batchTags.every((t) => t.repId === null));

    // The face (what is printed): a keychain has none until the batch says so; a piece can override it.
    assert.equal((await api("GET", `/api/xpot/tags/${batchTags[0].id}`, "it-admin")).json.face, null);
    assert.equal((await api("PATCH", `/api/xpot/admin/tag-batches/${batch.json.id}`, "it-admin", { face: "instagram" })).status, 200);
    const faced = (await api("GET", `/api/xpot/tags?batchId=${batch.json.id}`, "it-admin")).json as Array<{ id: string; face: string | null; ownFace: string | null }>;
    assert.ok(faced.every((t) => t.face === "instagram" && t.ownFace === null));
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${batchTags[9].id}`, "it-admin", { face: "email" })).status, 200);
    const overridden = (await api("GET", `/api/xpot/tags/${batchTags[9].id}`, "it-admin")).json;
    assert.equal(overridden.face, "email");
    assert.equal(overridden.ownFace, "email");
    const listedBatch = ((await api("GET", "/api/xpot/admin/tag-batches", "it-admin")).json as Array<{ id: string; face: string | null; ownFace: string | null }>)
      .find((b) => b.id === batch.json.id);
    assert.equal(listedBatch?.face, "instagram");
    assert.equal((await api("PATCH", `/api/xpot/admin/tags/${batchTags[9].id}`, "it-admin", { face: "myspace" })).status, 400);

    // Kits: 3 to Ana by batch + quantity (lowest serials), 2 to Bruno by code.
    const kitA = await api("POST", "/api/xpot/admin/tag-kits", "it-admin", { repId: repId["it-ana"], batchId: batch.json.id, quantity: 3, note: "WhatsApp order #1" });
    assert.equal(kitA.status, 201, kitA.text);
    assert.equal(kitA.json.pieceCount, 3);
    const brunoCodes = [batchTags[5].publicCode, batchTags[6].publicCode.toLowerCase()];
    const kitB = await api("POST", "/api/xpot/admin/tag-kits", "it-admin", { repId: repId["it-bruno"], codes: brunoCodes });
    assert.equal(kitB.status, 201, kitB.text);
    // A piece already handed out cannot go into another kit; nothing moves.
    const dup = await api("POST", "/api/xpot/admin/tag-kits", "it-admin", { repId: repId["it-bruno"], codes: [batchTags[0].publicCode, batchTags[7].publicCode] });
    assert.equal(dup.status, 409);
    assert.match(dup.json.message, new RegExp(batchTags[0].publicCode));
    assert.equal((await api("GET", `/api/xpot/tags/lookup/${batchTags[7].publicCode}`, "it-admin")).status, 200);

    const [a1, a2, a3] = batchTags.slice(0, 3);
    const [b1] = batchTags.slice(5, 7);
    const house = batchTags[8];

    // Ana sees exactly her kit, whatever filter she sends.
    const anaList = await api("GET", `/api/xpot/tags?repId=${repId["it-bruno"]}&house=1`, "it-ana");
    assert.deepEqual(anaList.json.map((t: any) => t.publicCode).sort(), [a1, a2, a3].map((t) => t.publicCode).sort());
    assert.deepEqual((await api("GET", "/api/xpot/tags?mine=1", "it-ana")).json.map((t: any) => t.publicCode).sort(), [a1, a2, a3].map((t) => t.publicCode).sort());
    // The admin reaches every piece, but none of them is "theirs" until it is in their kit or they activate it.
    assert.equal(((await api("GET", `/api/xpot/tags?batchId=${batch.json.id}&mine=1`, "it-admin")).json as unknown[]).length, 0);
    assert.equal(((await api("GET", `/api/xpot/tags?batchId=${batch.json.id}`, "it-admin")).json as unknown[]).length, 10);
    assert.deepEqual((await api("GET", "/api/xpot/tags/summary", "it-ana")).json, { inStock: 3, active: 0, soldLast30: 0, scansLast30: { qr: 0, nfc: 0 } });
    // Bruno's piece and house stock are out of her reach.
    assert.equal((await api("GET", `/api/xpot/tags/lookup/${b1.publicCode}`, "it-ana")).status, 403);
    assert.equal((await api("GET", `/api/xpot/tags/lookup/${house.publicCode}`, "it-ana")).status, 403);
    assert.equal((await api("GET", `/api/xpot/tags/${b1.id}`, "it-ana")).status, 403);

    // An unconfigured piece scanned by its reseller offers "set up"; strangers just see the notice.
    const anon = await (await scan(`/n/${a1.publicCode}`)).text();
    assert.doesNotMatch(anon, /\/tags\/t\//);
    const own = await (await scan(`/n/${a1.publicCode}`, "it-ana")).text();
    assert.match(own, new RegExp(`href="/tags/t/${a1.publicCode}"`));
    const other = await (await scan(`/n/${a1.publicCode}`, "it-bruno")).text();
    assert.doesNotMatch(other, /\/tags\/t\//);

    // Ana sells a1 to a new business.
    const sold = await api("POST", `/api/xpot/tags/${a1.id}/quick-activate`, "it-ana", {
      destinationUrl: REVIEW, destinationType: "google_review", leadName: "Taqueria El Sol", label: "Counter",
    });
    assert.equal(sold.status, 200, sold.text);
    assert.equal(sold.json.status, "active");
    assert.equal(sold.json.repId, repId["it-ana"]);
    assert.equal(sold.json.leadName, "Taqueria El Sol");
    assert.ok(sold.json.soldAt);
    const leadId = sold.json.leadId as number;
    const [lead] = (await db.execute(sql`SELECT owner_rep_id, status, source FROM sales_leads WHERE id = ${leadId}`)).rows as any[];
    assert.deepEqual(lead, { owner_rep_id: repId["it-ana"], status: "customer", source: "tag_sale" });

    // Bruno cannot sell to Ana's customer, nor touch her pieces.
    assert.equal((await api("POST", `/api/xpot/tags/${b1.id}/quick-activate`, "it-bruno", {
      destinationUrl: REVIEW, destinationType: "google_review", leadId,
    })).status, 404);
    assert.equal((await api("POST", `/api/xpot/tags/${a1.id}/disable`, "it-bruno")).status, 403);
    assert.equal((await api("POST", `/api/xpot/tags/${a1.id}/nfc-written`, "it-bruno", { method: "web_nfc" })).status, 403);

    // Ana sells a second piece to the same customer.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/quick-activate`, "it-ana", {
      destinationUrl: "https://elsol.example/menu", destinationType: "menu", leadId,
    })).status, 200);

    // She writes a1's chip from her phone and reads it back: verified.
    const written = await api("POST", `/api/xpot/tags/${a1.id}/nfc-written`, "it-ana", {
      method: "web_nfc", readbackUrl: `https://xpot.place/n/${a1.publicCode}`,
    });
    assert.equal(written.json.nfcStatus, "verified");
    // A wrong read-back is refused and marks the chip failed.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/nfc-written`, "it-ana", {
      method: "web_nfc", readbackUrl: "https://xpot.place/n/WRONG000",
    })).status, 409);

    // Customers scan: 2 NFC taps and 1 QR on a1, 1 QR on a2 (with UTMs for the menu).
    const tap = await scan(`/n/${a1.publicCode}`);
    assert.equal(tap.status, 302);
    assert.equal(tap.headers.get("location"), REVIEW);
    await scan(`/n/${a1.publicCode}`);
    await scan(`/q/${a1.publicCode}`);
    const menu = await scan(`/q/${a2.publicCode}`);
    assert.match(menu.headers.get("location")!, /utm_source=xpot-tag&utm_medium=qr/);
    await settle();
    const [ev] = (await db.execute(sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE rep_id = ${repId["it-ana"]} AND lead_id = ${leadId})::int AS owned
      FROM tag_events WHERE event_type = 'redirect'`)).rows as any[];
    assert.deepEqual(ev, { n: 4, owned: 4 });

    // Direct links are per reseller.
    assert.equal((await api("POST", "/api/xpot/tag-direct-writes", "it-ana", { url: REVIEW, method: "web_nfc", verified: true, leadId })).status, 201);
    assert.equal((await api("GET", "/api/xpot/tag-direct-writes", "it-bruno")).json.length, 0);
    assert.equal((await api("GET", "/api/xpot/tag-direct-writes", "it-ana")).json.length, 1);

    // Ana's home numbers.
    assert.deepEqual((await api("GET", "/api/xpot/tags/summary", "it-ana")).json, { inStock: 1, active: 2, soldLast30: 2, scansLast30: { qr: 2, nfc: 2 } });

    // Pieces per customer for the Visits side: Ana sees her customer, Bruno nothing.
    assert.deepEqual((await api("GET", "/api/xpot/tags/by-lead", "it-ana")).json, [{ leadId, pieces: 2, live: 2, scansLast30: 4 }]);
    assert.deepEqual((await api("GET", "/api/xpot/tags/by-lead", "it-bruno")).json, []);
    // Selling a Google review piece kept the business's Place ID on the lead.
    const [place] = (await db.execute(sql`SELECT google_place_id FROM sales_leads WHERE id = ${leadId}`)).rows as any[];
    assert.equal(place.google_place_id, new URL(REVIEW).searchParams.get("placeid"));

    // Admin report and overview.
    const report = await api("GET", "/api/xpot/admin/tags/report?range=7d", "it-admin");
    assert.equal(report.status, 200, report.text);
    const row = (id: number) => report.json.reps.find((r: any) => r.repId === id);
    assert.equal(row(repId["it-ana"]).soldInRange, 2);
    assert.equal(row(repId["it-ana"]).inStock, 1);
    assert.equal(row(repId["it-ana"]).activeTags, 2);
    assert.equal(row(repId["it-ana"]).customers, 1);
    assert.equal(row(repId["it-ana"]).nfc, 2);
    assert.equal(row(repId["it-ana"]).qr, 2);
    assert.equal(row(repId["it-ana"]).activationsInRange, 2);
    assert.equal(row(repId["it-bruno"]).inStock, 2);
    assert.equal(row(repId["it-bruno"]).soldInRange, 0);
    assert.equal(report.json.unassigned.inStock, 5);
    assert.equal(report.json.topTags[0].publicCode, a1.publicCode);
    assert.equal(report.json.topTags[0].repName, "Ana");
    const overview = await api("GET", "/api/xpot/admin/tags/overview", "it-admin");
    assert.deepEqual(overview.json.stock, { house: 5, withResellers: 3 });
    assert.equal(overview.json.counts.active, 2);

    // Admin re-activating Ana's piece keeps her credit.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/disable`, "it-ana")).json.status, "disabled");
    const back = await api("POST", `/api/xpot/tags/${a2.id}/activate`, "it-admin");
    assert.equal(back.json.repId, repId["it-ana"]);
    assert.equal(back.json.soldAt, (await api("GET", `/api/xpot/tags/${a2.id}`, "it-ana")).json.soldAt);

    // Bruno returns his kit; sold pieces cannot be returned.
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "it-admin", { codes: brunoCodes })).json.returned, 2);
    assert.equal((await api("GET", "/api/xpot/tags/summary", "it-bruno")).json.inStock, 0);
    assert.equal((await api("POST", "/api/xpot/admin/tag-kits/return", "it-admin", { codes: [a1.publicCode] })).status, 409);
    // A typo is refused; a piece already home is reported, not counted.
    const typo = await api("POST", "/api/xpot/admin/tag-kits/return", "it-admin", { codes: ["ZZZZZZZZ"] });
    assert.equal(typo.status, 404);
    assert.match(typo.json.message, /Unknown codes: ZZZZZZZZ/);
    const again = (await api("POST", "/api/xpot/admin/tag-kits/return", "it-admin", { codes: brunoCodes })).json;
    assert.equal(again.returned, 0);
    assert.deepEqual([...again.alreadyInHouse].sort(), brunoCodes.map((c: string) => c.toUpperCase()).sort());
    const kits = await api("GET", `/api/xpot/admin/tag-kits?repId=${repId["it-ana"]}`, "it-admin");
    assert.deepEqual(kits.json.map((k: any) => [k.pieceCount, k.unsoldCount, k.note]), [[3, 1, "WhatsApp order #1"]]);

    // Unassigning a sold piece undoes the sale but leaves it in Ana's hands.
    assert.equal((await api("POST", `/api/xpot/tags/${a2.id}/disable`, "it-ana")).status, 200);
    const unassigned = await api("POST", `/api/xpot/admin/tags/${a2.id}/unassign`, "it-admin");
    assert.equal(unassigned.json.status, "inventory");
    assert.equal(unassigned.json.soldAt, null);
    assert.equal(unassigned.json.repId, repId["it-ana"]);

    // The admin gives it to a new business by name: the lead belongs to Ana, who holds the piece.
    const reassigned = await api("POST", `/api/xpot/admin/tags/${a2.id}/assign`, "it-admin", { leadName: "Cafe Nuevo" });
    assert.equal(reassigned.status, 200, reassigned.text);
    assert.equal(reassigned.json.leadName, "Cafe Nuevo");
    const [cafe] = (await db.execute(sql`SELECT owner_rep_id, status FROM sales_leads WHERE id = ${reassigned.json.leadId}`)).rows as any[];
    assert.deepEqual(cafe, { owner_rep_id: repId["it-ana"], status: "customer" });
    assert.equal((await api("POST", `/api/xpot/admin/tags/${a2.id}/assign`, "it-admin", { leadId, leadName: "Both" })).status, 400);

    // Manufacturing export.
    const csv = await api("GET", `/api/xpot/admin/tag-batches/${batch.json.id}/export.csv`, "it-admin");
    const lines = csv.text.trim().split("\r\n");
    assert.equal(lines.length, 11);
    assert.equal(lines[1], `${batch.json.batchCode},001,${a1.publicCode},https://xpot.place/q/${a1.publicCode},https://xpot.place/n/${a1.publicCode},${a1.publicCode}.svg`);
    const zipRes = await fetch(`${base}/api/xpot/admin/tag-batches/${batch.json.id}/qr-assets.zip`, { headers: { "x-test-user": "it-admin" } });
    const zip = unzipSync(new Uint8Array(await zipRes.arrayBuffer()));
    assert.match(strFromU8(zip[`${batch.json.batchCode}/svg/${a1.publicCode}.svg`]), /<svg/);

    // Desktop provisioner: pair → job → claim → write → server-verified.
    const pairing = await api("POST", "/api/xpot/admin/tag-provisioners", "it-admin", { deviceName: "Workshop PC" });
    assert.equal(pairing.status, 201, pairing.text);
    const paired = await fetch(`${base}/api/provisioner/pair`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-provisioner-protocol": "1" },
      body: JSON.stringify({ pairingCode: pairing.json.pairingCode, platform: "win32", appVersion: "1.0.0" }),
    }).then((r) => r.json());
    assert.match(paired.token, /^snp_/);
    const device = (path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", "x-provisioner-protocol": "1", authorization: `Bearer ${paired.token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const session = await (await device("/api/provisioner/session")).json();
    assert.equal(session.baseUrl, "https://xpot.place");
    assert.equal((await api("POST", `/api/xpot/admin/tags/${a3.id}/provisioning-jobs`, "it-admin", {})).status, 201);
    const job = await (await device("/api/provisioner/jobs/claim", {})).json();
    assert.equal(job.expectedUrl, `https://xpot.place/n/${a3.publicCode}`);
    await device("/api/provisioner/events", { jobId: job.id, type: "write_started" });
    await device("/api/provisioner/events", { jobId: job.id, type: "write_completed" });
    const done = await (await device(`/api/provisioner/jobs/${job.id}/complete`, { outcome: "succeeded", readbackUrl: job.expectedUrl })).json();
    assert.equal(done.status, "succeeded");
    assert.equal((await api("GET", `/api/xpot/tags/${a3.id}`, "it-ana")).json.nfcStatus, "verified");
  } finally {
    server.close();
    await pool.end();
  }
});
