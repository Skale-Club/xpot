import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore, type MemoryStore } from "../helpers/memoryStore.js";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): catalog, versions, print requests and their plates, files, the
// bench's side (building, the Print Now folder) and part counts, end to end through the HTTP routes on an in-process
// Postgres (PGlite) with every migration applied.

const pg = vi.hoisted(() => ({ client: null as any }));

vi.mock("../../server/db.js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../../shared/schema.js");
  const client = new PGlite();
  await client.exec(`CREATE TABLE "_xpot_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMP DEFAULT NOW())`);
  for (const file of readdirSync(join(process.cwd(), "migrations")).filter((entry) => entry.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  }
  pg.client = client;
  return { db: drizzle(client, { schema }), pool: { end: async () => {} } };
});

const { registerTagRoutes } = await import("../../server/tags/routes.js");
const { setFileStoresForTests } = await import("../../server/lib/files.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

let store: MemoryStore;

function appFor(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = userId ? { userId, email: `${userId}@print.test`, isAdmin: userId === "print-admin" } : {};
    next();
  });
  registerTagRoutes(app);
  return app;
}

type Reply = { status: number; body: any; headers: Headers };

async function request(app: express.Express, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const raw = body instanceof Uint8Array;
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          redirect: "manual",
          headers: body === undefined ? headers : { "Content-Type": raw ? "application/octet-stream" : "application/json", ...headers },
          body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        resolve({ status: response.status, body: parsed, headers: response.headers });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

const admin = () => appFor("print-admin");
const bytes = (text: string) => new TextEncoder().encode(text);
const year = new Date().getUTCFullYear();

async function salesProductId() {
  return (await q("SELECT id FROM sales_products WHERE sku = 'print-plate'"))[0].id as number;
}

const bedX4 = {
  label: "x4",
  copies: 4,
  positions: ["front-left", "front-right", "back-left", "back-right"],
  minutes: 273.5,
  swaps: 3,
  ams: [{ slot: 1, colour: "White PLA" }, { slot: 2, colour: "Black PLA" }],
  pause: { z: 1.8, text: "Press one NFC sticker into each pocket" },
};

async function createSerializedModel(app: express.Express, withVersion = true) {
  return request(app, "POST", "/api/xpot/admin/print-models", {
    slug: "plate-large-menu-white",
    kind: "serialized",
    title: "Plate Large · Menu · White",
    productType: "large_plate",
    face: "menu",
    theme: "white",
    salesProductId: await salesProductId(),
    batchPrefix: "TPLATE",
    ...(withVersion ? { version: { builder: "plate.menu", params: { size: "large", theme: "white" }, recipe: { wall_loops: "3" }, beds: [bedX4] } } : {}),
  });
}

/** Ask for a print and open its first plate (the print order the single-plate tests follow). */
async function firstPlate(app: express.Express, body: Record<string, unknown>) {
  const created = await request(app, "POST", "/api/xpot/admin/print-jobs", body);
  expect(created.status).toBe(201);
  return (await request(app, "GET", `/api/xpot/admin/print-jobs/${created.body.plates[0].id}`)).body;
}

/** A device paired through the real flow (admin pairing code → /api/provisioner/pair). */
async function pairDevice(app: express.Express, name: string, capabilities?: string[]) {
  const pairing = await request(app, "POST", "/api/xpot/admin/tag-provisioners", { deviceName: name });
  expect(pairing.status).toBe(201);
  const paired = await request(app, "POST", "/api/provisioner/pair", {
    pairingCode: pairing.body.pairingCode,
    platform: "test",
    appVersion: "test-1",
    ...(capabilities ? { capabilities } : {}),
  }, { "x-provisioner-protocol": "1" });
  expect(paired.status).toBe(201);
  return { "x-provisioner-protocol": "1", authorization: `Bearer ${paired.body.token}` };
}

beforeAll(() => {
  expect(pg.client).toBeTruthy();
});

afterAll(() => setFileStoresForTests(null));

beforeEach(async () => {
  store = memoryStore("r2");
  setFileStoresForTests({ r2: store, supabase: null, public: null });
  await q(`TRUNCATE print_part_movements, print_job_files, print_jobs, print_requests, print_model_versions, print_models,
    tag_journey_entries, tag_provisioning_devices, tags, tag_batches, sales_products, sales_reps, users RESTART IDENTITY CASCADE`);
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('print-admin', 'print-admin@print.test', 'Admin', true)");
  await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('print-admin', 'Admin', 'print-admin@print.test', 'admin', true)");
  // A row left over from the removed Manager role: a plain rep, refused wherever the owners alone may go.
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('print-manager', 'print-manager@print.test', 'Old Manager', false)");
  await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('print-manager', 'Old Manager', 'print-manager@print.test', 'manager', true)");
  await q("INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES ('print-plate', 'Print plate', 'physical', 3500, true)");
  await q("INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company') ON CONFLICT (slug) DO NOTHING");
});

describe("print catalog", () => {
  it("is the global admin's only", async () => {
    expect((await request(appFor("print-manager"), "GET", "/api/xpot/admin/print-models")).status).toBe(403);
    expect((await request(appFor(null), "GET", "/api/xpot/admin/print-jobs")).status).toBe(401);
  });

  it("keeps a model design_needed until its first version, and one current version after that", async () => {
    const app = admin();
    const created = await createSerializedModel(app, false);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("design_needed");

    const refused = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("print_model_design_needed");

    const v1 = await request(app, "POST", "/api/xpot/admin/print-models/plate-large-menu-white/versions", { builder: "plate.menu", beds: [bedX4] });
    expect(v1.status).toBe(201);
    expect(v1.body).toMatchObject({ version: 1, status: "current" });

    const noChangelog = await request(app, "POST", "/api/xpot/admin/print-models/plate-large-menu-white/versions", { builder: "plate.menu", beds: [bedX4] });
    expect(noChangelog.status).toBe(400);
    expect(noChangelog.body.code).toBe("print_version_changelog_required");

    const v2 = await request(app, "POST", "/api/xpot/admin/print-models/plate-large-menu-white/versions", {
      builder: "plate.menu",
      recipe: { wall_loops: "4", top_shell_layers: "6" },
      beds: [bedX4],
      changelog: "White came out translucent: one more wall, six top shells",
    });
    expect(v2.status).toBe(201);
    const model = (await request(app, "GET", "/api/xpot/admin/print-models/plate-large-menu-white")).body;
    expect(model.status).toBe("ready");
    expect(model.currentVersion.version).toBe(2);
    expect(model.versions.map((v: any) => [v.version, v.status])).toEqual([[2, "current"], [1, "superseded"]]);

    const duplicate = await createSerializedModel(app, false);
    expect(duplicate.status).toBe(409);
  });

  it("refuses a serialized model without its product, sales product and prefix", async () => {
    const res = await request(admin(), "POST", "/api/xpot/admin/print-models", { slug: "x-model", kind: "serialized", title: "X" });
    expect(res.status).toBe(400);
  });
});

describe("3D preview", () => {
  /** A minimal binary glTF header ("glTF", version 2) and some payload. */
  const glb = (tail: string) => new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 20, 0, 0, 0, ...bytes(tail)]);

  it("keeps one GLB per version, streams it from this origin and shows it on the version and its plates", async () => {
    const app = admin();
    const model = (await createSerializedModel(app)).body;
    const versionId = model.currentVersion.id;
    const path = `/api/xpot/admin/print-models/plate-large-menu-white/versions/${versionId}/preview`;
    expect(model.currentVersion.preview).toBeNull();
    expect((await request(app, "GET", path)).status).toBe(404);

    const notGlb = await request(app, "POST", `${path}?filename=menu.glb`, bytes("not a model"));
    expect(notGlb.status).toBe(400);
    expect(notGlb.body.code).toBe("print_preview_not_glb");
    expect((await request(appFor("print-manager"), "POST", `${path}?filename=menu.glb`, glb("x"))).status).toBe(403);

    const first = await request(app, "POST", `${path}?filename=menu`, glb("first"));
    expect(first.status).toBe(201);
    expect(first.body.preview).toMatchObject({ fileName: "menu.glb", bytes: 17 });
    expect(first.body.preview.fileRef).toBeUndefined();
    const firstKey = Array.from(store.objects.keys()).find((k) => k.endsWith("-menu.glb"))!;

    const streamed = await request(app, "GET", path);
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-type")).toContain("model/gltf-binary");
    expect(streamed.headers.get("content-length")).toBe("17");
    expect((await request(app, "GET", path, undefined, { "if-none-match": streamed.headers.get("etag")! })).status).toBe(304);

    const plate = await firstPlate(app, { model: "plate-large-menu-white" });
    expect(plate.preview).toMatchObject({ fileName: "menu.glb" });

    // A preview is not what an order printed: it can be replaced after the version was used, and the old file goes.
    const second = await request(app, "POST", `${path}?filename=menu-v2.glb`, glb("second one"));
    expect(second.status).toBe(201);
    expect(second.body.preview).toMatchObject({ fileName: "menu-v2.glb", bytes: 22 });
    expect(store.removed).toContain(firstKey);
    expect((await request(app, "GET", "/api/xpot/admin/print-models/plate-large-menu-white")).body.currentVersion.preview.fileName).toBe("menu-v2.glb");
  });

  it("gives every signed-in rep the catalog of previews, which model each batch came from, and the model's GLB", async () => {
    const app = admin();
    const rep = appFor("print-manager");
    const catalog = "/api/xpot/print-previews";
    const model = (await createSerializedModel(app)).body;
    expect((await request(appFor(null), "GET", catalog)).status).toBe(401);
    // Not an admin, but a rep: the piece pictures of every screen need this. No preview yet, so nothing in it.
    expect((await request(rep, "GET", catalog)).body).toEqual({ models: [], batches: {} });

    const plate = await firstPlate(app, { model: "plate-large-menu-white" });
    await request(app, "POST", `/api/xpot/admin/print-models/plate-large-menu-white/versions/${model.currentVersion.id}/preview?filename=menu.glb`, glb("first"));
    // A model with no version, and so no preview, never shows up.
    await request(app, "POST", "/api/xpot/admin/print-models", { slug: "plate-large-menu-black", kind: "serialized", title: "Plate Large · Menu · Black", productType: "large_plate", face: "menu", theme: "black", salesProductId: await salesProductId(), batchPrefix: "BPLATE" });

    const listed = (await request(rep, "GET", catalog)).body;
    expect(listed.models).toEqual([
      { slug: "plate-large-menu-white", title: "Plate Large · Menu · White", productType: "large_plate", face: "menu", theme: "white", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
    // The batch is what says white or black: a piece only knows its type and face.
    expect(listed.batches).toEqual({ [plate.batchCode]: "plate-large-menu-white" });

    const glbPath = `${catalog}/plate-large-menu-white/glb`;
    const streamed = await request(rep, "GET", glbPath);
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-type")).toContain("model/gltf-binary");
    expect(streamed.headers.get("content-length")).toBe("17");
    expect(streamed.headers.get("etag")).toBe(`"${listed.models[0].sha256}"`);
    expect((await request(rep, "GET", glbPath, undefined, { "if-none-match": streamed.headers.get("etag")! })).status).toBe(304);
    expect((await request(appFor(null), "GET", glbPath)).status).toBe(401);
    expect((await request(rep, "GET", `${catalog}/plate-large-menu-black/glb`)).status).toBe(404);
    expect((await request(rep, "GET", `${catalog}/no-such-model/glb`)).status).toBe(404);
  });

  it("takes a preview as raw bytes with an MCP token (preview.py --upload), and nothing without a valid one", async () => {
    const { registerMcpRoutes } = await import("../../server/mcp/routes.js");
    const { createMcpToken, revokeMcpToken } = await import("../../server/mcp/tokens.js");
    await createSerializedModel(admin());
    const mcp = express();
    registerMcpRoutes(mcp);
    const { token, secret } = await createMcpToken("preview upload", "print-admin");
    const path = "/mcp/print-preview/plate-large-menu-white";

    expect((await request(mcp, "POST", path, glb("x"))).status).toBe(401);
    expect((await request(mcp, "POST", path, glb("x"), { authorization: "Bearer xpot_not_a_real_token" })).status).toBe(401);
    expect((await request(mcp, "POST", path, bytes("not a model"), { authorization: `Bearer ${secret}` })).status).toBe(400);

    const sent = await request(mcp, "POST", path, glb("from the bench pc"), { authorization: `Bearer ${secret}` });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ model: "plate-large-menu-white", version: 1, preview: { fileName: "plate-large-menu-white-preview.glb", bytes: 29 } });
    expect((await request(admin(), "GET", "/api/xpot/admin/print-models/plate-large-menu-white")).body.currentVersion.preview.bytes).toBe(29);

    await revokeMcpToken(token.id);
    expect((await request(mcp, "POST", path, glb("again"), { authorization: `Bearer ${secret}` })).status).toBe(401);
  });
});

describe("serialized print orders", () => {
  it("issues the batch and the order in one step, with the next code for the prefix", async () => {
    const app = admin();
    await createSerializedModel(app);
    const first = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ quantity: 4, open: true, modelSlug: "plate-large-menu-white", version: 1 });
    expect(first.body.plates).toHaveLength(1);
    const plate = (await request(app, "GET", `/api/xpot/admin/print-jobs/${first.body.plates[0].id}`)).body;
    expect(plate).toMatchObject({
      status: "requested", quantity: 4, pieceCount: 4, receivedCount: 0, batchCode: `TPLATE-${year}-001`, version: 1,
      requestId: first.body.id, plateNumber: 1, plateCount: 1, requestQuantity: 4,
    });
    expect(plate.pieces.map((p: any) => p.position)).toEqual(["front-left", "front-right", "back-left", "back-right"]);
    expect(plate.pieces.every((p: any) => p.stockStatus === "pending")).toBe(true);

    const [batch] = await q("SELECT code_source, print_job_id, face, product_type FROM tag_batches WHERE id = $1", [plate.batchId]);
    expect(batch).toEqual({ code_source: "issued", print_job_id: plate.id, face: "menu", product_type: "large_plate" });
    const listed = (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === plate.batchId);
    expect(listed.printJobId).toBe(plate.id);
  });

  it("goes requested → building → ready through the bench, then printed from the panel", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });

    const nfcOnly = await pairDevice(app, "NFC writer");
    expect((await request(app, "POST", "/api/provisioner/print-jobs/claim", {}, nfcOnly)).status).toBe(403);

    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const ticket = await request(app, "POST", "/api/provisioner/print-jobs/claim", {}, bench);
    expect(ticket.status).toBe(200);
    expect(ticket.body.job.id).toBe(order.id);
    expect(ticket.body.version).toMatchObject({ builder: "plate.menu", bed: { label: "x4", copies: 4 } });
    expect(ticket.body.tags[0]).toMatchObject({ serial_number: "001", position: "front-left" });
    expect(ticket.body.tags[0].qr_url).toMatch(/\/q\/[0-9A-Z]{8}$/);
    expect((await request(app, "POST", "/api/provisioner/print-jobs/claim", {}, bench)).status).toBe(204);

    const early = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/complete`, { outcome: "ready" }, bench);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("print_job_file_missing");

    const upload = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/files?filename=${encodeURIComponent("1 - PLATES MENU.gcode.3mf")}`, bytes("gcode"), bench);
    expect(upload.status).toBe(201);
    expect(upload.body).toMatchObject({ kind: "gcode_3mf", filename: "1_-_PLATES_MENU.gcode.3mf", bytes: 5 });
    expect(Array.from(store.objects.keys())[0]).toMatch(new RegExp(`^print/${order.id}/\\d+-1_-_PLATES_MENU\\.gcode\\.3mf$`));

    const done = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/complete`, {
      outcome: "ready",
      report: { minutes: 273.5, swaps: 3, qr_check: "4/4" },
    }, bench);
    expect(done.body.status).toBe("ready");
    const detail = (await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body;
    expect(detail).toMatchObject({ status: "ready", deviceName: "Bench PC", report: { minutes: 273.5, qr_check: "4/4" } });
    expect(detail.files).toHaveLength(1);

    const download = await request(app, "GET", `/api/xpot/admin/print-files/${detail.files[0].id}`);
    expect(download.status).toBe(302);
    expect(download.headers.get("location")).toMatch(/^https:\/\/signed\.example\/r2\/print\//);

    const printed = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed" });
    expect(printed.body.status).toBe("printed");
    const steps = (await q("SELECT action FROM tag_journey_entries WHERE batch_id = $1 AND action IN ('sliced', 'printed') ORDER BY occurred_at", [order.batchId])).map((r) => r.action);
    expect(steps).toEqual(["sliced", "printed"]);
    // Marking it printed put the whole batch in house stock: nothing is left to scan.
    expect(printed.body).toMatchObject({ pieceCount: 4, receivedCount: 4, pendingCount: 0 });
    const stocked = await q("SELECT stock_status, ownership_type, registered_at IS NOT NULL AS registered FROM tags WHERE batch_id = $1", [order.batchId]);
    expect(stocked).toEqual(Array(4).fill({ stock_status: "available", ownership_type: "company", registered: true }));
    const intakes = await q("SELECT m.from_stock_status, m.to_stock_status FROM tag_stock_movements m JOIN tags t ON t.id = m.tag_id WHERE t.batch_id = $1 AND m.movement_type = 'intake'", [order.batchId]);
    expect(intakes).toEqual(Array(4).fill({ from_stock_status: "pending", to_stock_status: "available" }));
    expect((await q("SELECT count(*)::int AS n FROM tag_journey_entries WHERE batch_id = $1 AND action = 'pieces_stocked'", [order.batchId]))[0].n).toBe(1);
    const batch = (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === order.batchId);
    expect(batch.stage).toBe("received");

    const again = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed" });
    expect(again.status).toBe(409);
  });

  it("lets the admin attach a file by hand and mark the order ready", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    const file = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=batch.3mf`, bytes("3mf"));
    expect(file.body.kind).toBe("3mf");
    const ready = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    expect(ready.body.status).toBe("ready");
  });

  it("prints a failed order again on the same batch while none of its pieces was received", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    const failed = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "fail", reason: "Round tags lifted into the nozzle" });
    expect(failed.body).toMatchObject({ status: "failed", errorMessage: "Round tags lifted into the nozzle" });

    const redo = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`);
    expect(redo.status).toBe(201);
    expect(redo.body).toMatchObject({ status: "requested", batchId: order.batchId, batchCode: order.batchCode });
    const [batch] = await q("SELECT print_job_id FROM tag_batches WHERE id = $1", [order.batchId]);
    expect(batch.print_job_id).toBe(redo.body.id);
    expect((await q("SELECT count(*)::int AS n FROM tag_batches"))[0].n).toBe(1);
  });

  it("prints a plate that failed its QR check again with fresh codes, and retires the old ones", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const ticket = (await request(app, "POST", "/api/provisioner/print-jobs/claim", {}, bench)).body;
    const bad = ticket.tags[0].public_code;
    const failed = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/complete`, {
      outcome: "failed", errorCode: "qr_check_failed", errorMessage: `a QR on layer 1 does not decode to its own code: FAIL #001 ${bad}`,
      report: { qr_failed_codes: [bad] },
    }, bench);
    expect(failed.body.status).toBe("failed");
    // A failed build reaches the batch's journey like a plate marked failed by hand, and only while the bench holds it.
    const journey = await q("SELECT metadata FROM tag_journey_entries WHERE batch_id = $1 AND action = 'print_failed'", [order.batchId]);
    expect(journey).toEqual([{ metadata: expect.objectContaining({ printJobId: order.id, errorCode: "qr_check_failed" }) }]);
    const twice = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/complete`, { outcome: "failed" }, bench);
    expect(twice.body.code).toBe("print_job_not_claimed");
    const shown = (await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body;
    expect(shown).toMatchObject({ status: "failed", errorCode: "qr_check_failed", report: { qr_failed_codes: [bad] } });

    const redo = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`);
    expect(redo.status).toBe(201);
    expect(redo.body).toMatchObject({ status: "requested", requestId: order.requestId, plateNumber: 1, quantity: 4, pieceCount: 4, pendingCount: 4 });
    expect(redo.body.batchId).not.toBe(order.batchId);
    expect(redo.body.batchCode).not.toBe(order.batchCode);
    const fresh = (await q("SELECT public_code FROM tags WHERE batch_id = $1", [redo.body.batchId])).map((r) => r.public_code);
    expect(fresh).not.toContain(bad);

    // The old codes were never printed: retired, each with its movement, and their batch cancelled.
    const old = await q("SELECT status, stock_status FROM tags WHERE batch_id = $1", [order.batchId]);
    expect(old).toEqual(Array(4).fill({ status: "retired", stock_status: "retired" }));
    const moves = await q("SELECT m.from_stock_status, m.to_stock_status FROM tag_stock_movements m JOIN tags t ON t.id = m.tag_id WHERE t.batch_id = $1 AND m.movement_type = 'retire'", [order.batchId]);
    expect(moves).toEqual(Array(4).fill({ from_stock_status: "pending", to_stock_status: "retired" }));
    const [batch] = await q("SELECT status, print_job_id FROM tag_batches WHERE id = $1", [order.batchId]);
    expect(batch).toEqual({ status: "cancelled", print_job_id: order.id });
    const [entry] = await q("SELECT after_value, content, metadata FROM tag_journey_entries WHERE batch_id = $1 AND action = 'batch_status_changed'", [order.batchId]);
    expect(entry).toMatchObject({ after_value: "cancelled", metadata: { replacedBy: redo.body.id, retired: 4, qrFailedCodes: [bad] } });
    expect(entry.content).toContain(bad);

    // Plate 1 of the request is now the new order; the failed one stays as the record of what happened.
    const plates = await q("SELECT id, status FROM print_jobs WHERE request_id = $1 ORDER BY created_at", [order.requestId]);
    expect(plates).toEqual([{ id: order.id, status: "failed" }, { id: redo.body.id, status: "requested" }]);
  });

  it("links a batch made before the catalog, with the status it already reached", async () => {
    const app = admin();
    await createSerializedModel(app);
    const legacy = await request(app, "POST", "/api/xpot/admin/tag-batches", {
      name: "Old plates", productType: "large_plate", salesProductId: await salesProductId(), face: "menu", quantity: 4,
    });
    await q("INSERT INTO tag_journey_entries (kind, action, title, batch_id, source, actor, occurred_at) VALUES ('execution', 'printed', 'Printed', $1, 'mcp', 'ai', '2026-10-21T12:00:00Z')", [legacy.body.id]);

    const linked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: legacy.body.batchCode });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({ quantity: 4, open: false });
    expect(linked.body.plates[0]).toMatchObject({ status: "printed", batchId: legacy.body.id, quantity: 4, printedAt: "2026-10-21T12:00:00.000Z", plateNumber: 1 });

    const twice = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: legacy.body.batchCode });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("print_batch_linked");

    const stand = await request(app, "POST", "/api/xpot/admin/tag-batches", {
      name: "A stand", productType: "large_stand", salesProductId: await salesProductId(), quantity: 1,
    });
    const mismatch = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: stand.body.batchCode });
    expect(mismatch.body.code).toBe("print_batch_product_mismatch");
  });
});

describe("print requests", () => {
  it("splits a quantity into full plates and a partial last one, each with its own batch", async () => {
    const app = admin();
    await createSerializedModel(app);
    const asked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 10, notes: "For the fair" });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ quantity: 10, notes: "For the fair", open: true });
    expect(asked.body.plates.map((p: any) => [p.plateNumber, p.plateCount, p.quantity, p.batchCode, p.status])).toEqual([
      [1, 3, 4, `TPLATE-${year}-001`, "requested"],
      [2, 3, 4, `TPLATE-${year}-002`, "requested"],
      [3, 3, 2, `TPLATE-${year}-003`, "requested"],
    ]);
    const partial = (await request(app, "GET", `/api/xpot/admin/print-jobs/${asked.body.plates[2].id}`)).body;
    expect(partial.pieces.map((p: any) => [p.serialNumber, p.position])).toEqual([[1, "front-left"], [2, "front-right"]]);
    const batch = (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === partial.batchId);
    expect(batch.name).toBe("Plate Large · Menu · White · print job 3/3");

    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const tickets = [];
    for (let i = 0; i < 3; i++) tickets.push((await request(app, "POST", "/api/provisioner/print-jobs/claim", {}, bench)).body);
    expect(tickets.map((ticket) => [ticket.job.id, ticket.tags.length])).toEqual(asked.body.plates.map((p: any) => [p.id, p.quantity]));

    const byOne = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 1 });
    expect(byOne.body.plates.map((p: any) => p.quantity)).toEqual([1]);
    const wholeBeds = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", plates: 2 });
    expect(wholeBeds.body).toMatchObject({ quantity: 8 });
    expect(wholeBeds.body.plates.map((p: any) => p.quantity)).toEqual([4, 4]);

    const tooMany = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 81 });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body).toMatchObject({ code: "print_too_many_plates", params: { max: 80 } });
  });

  it("keeps a request open until every plate is printed, while failed/cancelled plates do not block completion", async () => {
    const app = admin();
    await createSerializedModel(app);
    const asked = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 6 })).body;
    const [one, two] = asked.plates;
    await request(app, "POST", `/api/xpot/admin/print-jobs/${one.id}/files?filename=plate.3mf`, bytes("3mf"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${one.id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${one.id}/transition`, { action: "printed" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${two.id}/transition`, { action: "fail", reason: "Lifted" });

    const redo = await request(app, "POST", `/api/xpot/admin/print-jobs/${two.id}/redo`);
    expect(redo.body).toMatchObject({ requestId: asked.id, plateNumber: 2, plateCount: 2, batchCode: two.batchCode, status: "requested" });

    const open = (await request(app, "GET", "/api/xpot/admin/print-requests")).body;
    expect(open).toHaveLength(1);
    expect(open[0].plates.map((p: any) => [p.plateNumber, p.status])).toEqual([[1, "printed"], [2, "failed"], [2, "requested"]]);
    expect(open[0].plates[0].downloads).toEqual([expect.objectContaining({ kind: "3mf", filename: "plate.3mf" })]);

    // The printed plate is done (its pieces are in stock); the redone one is what keeps the request open.
    await request(app, "POST", `/api/xpot/admin/print-jobs/${redo.body.id}/transition`, { action: "cancel" });
    expect((await request(app, "GET", "/api/xpot/admin/print-requests")).body).toEqual([]);
    const done = (await request(app, "GET", "/api/xpot/admin/print-requests?status=done&model=plate-large-menu-white")).body;
    expect(done.map((r: any) => [r.id, r.open])).toEqual([[asked.id, false]]);
    expect((await request(app, "GET", `/api/xpot/admin/print-requests/${asked.id}`)).body.plates).toHaveLength(3);
    expect((await request(app, "GET", `/api/xpot/admin/print-requests/${crypto.randomUUID()}`)).body.code).toBe("print_request_not_found");
  });

  it("puts the good pieces in stock and the ones listed as bad become damaged, all or nothing", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=plate.3mf`, bytes("3mf"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    const [bad, other] = [order.pieces[1].publicCode as string, order.pieces[2].publicCode as string];

    // A code outside the batch refuses the whole step: the plate is not printed and no piece moved.
    const refused = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed", badPieces: ["ZZZZ9999"] });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("piece_not_in_batch");
    expect((await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body).toMatchObject({ status: "ready", pendingCount: 4 });
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "fail", reason: "x", badPieces: [bad] })).status).toBe(400);

    const printed = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed", badPieces: [bad.toLowerCase()] });
    expect(printed.status).toBe(200);
    expect(printed.body).toMatchObject({ status: "printed", pieceCount: 4, receivedCount: 3, pendingCount: 0 });
    const status = Object.fromEntries((await q("SELECT public_code, stock_status FROM tags WHERE batch_id = $1", [order.batchId])).map((t) => [t.public_code, t.stock_status]));
    expect(status[bad]).toBe("damaged");
    expect(status[other]).toBe("available");
    expect(Object.values(status).filter((v) => v === "available")).toHaveLength(3);
    const [move] = await q("SELECT m.movement_type, m.from_stock_status, m.to_stock_status, m.reason FROM tag_stock_movements m JOIN tags t ON t.id = m.tag_id WHERE t.public_code = $1 AND m.movement_type = 'damage'", [bad]);
    expect(move).toMatchObject({ movement_type: "damage", from_stock_status: "pending", to_stock_status: "damaged" });
    expect((await q("SELECT count(*)::int AS n FROM tag_journey_entries WHERE batch_id = $1 AND action = 'piece_damaged'", [order.batchId]))[0].n).toBe(1);
  });

  it("puts the pending pieces of a plate printed before this change in stock, and only once", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/stock`)).body.code).toBe("print_job_state");

    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=plate.3mf`, bytes("3mf"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed" });
    // The old behaviour: printed, every piece still waiting for its scan.
    await q("UPDATE tags SET stock_status = 'pending', registered_at = NULL WHERE batch_id = $1", [order.batchId]);
    expect((await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body).toMatchObject({ receivedCount: 0, pendingCount: 4 });

    const bad = order.pieces[3].publicCode as string;
    const stocked = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/stock`, { badPieces: [bad] });
    expect(stocked.status).toBe(200);
    expect(stocked.body).toMatchObject({ status: "printed", receivedCount: 3, pendingCount: 0 });
    expect((await q("SELECT stock_status FROM tags WHERE public_code = $1", [bad]))[0].stock_status).toBe("damaged");

    const again = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/stock`);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ receivedCount: 3, pendingCount: 0 });
    expect((await q("SELECT count(*)::int AS n FROM tag_stock_movements WHERE movement_type = 'intake'"))[0].n).toBe(3 + 4);
  });

  it("gives the bench the plates its Print Now folder holds, with signed links, and nothing is sent to a printer", async () => {
    const app = admin();
    await createSerializedModel(app);
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const asked = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 6 })).body;
    for (const plate of asked.plates) {
      await request(app, "POST", "/api/provisioner/print-jobs/claim", { jobId: plate.id }, bench);
      await request(app, "POST", `/api/provisioner/print-jobs/${plate.id}/files?filename=plate.3mf`, bytes("3mf"), bench);
      await request(app, "POST", `/api/provisioner/print-jobs/${plate.id}/files?filename=plate.gcode.3mf`, bytes("gcode"), bench);
      await request(app, "POST", `/api/provisioner/print-jobs/${plate.id}/complete`, { outcome: "ready" }, bench);
    }
    await request(app, "POST", `/api/xpot/admin/print-jobs/${asked.plates[0].id}/transition`, { action: "printed" });

    const listed = await request(app, "GET", "/api/provisioner/print-now", undefined, bench);
    expect(listed.status).toBe(200);
    expect(listed.body.map((p: any) => [p.plateNumber, p.plateCount, p.quantity, p.status, p.requestQuantity])).toEqual([[1, 2, 4, "printed", 6], [2, 2, 2, "ready", 6]]);
    expect(listed.body[1].files.map((f: any) => f.kind).sort()).toEqual(["3mf", "gcode_3mf"]);
    expect(listed.body[1].files[0].url).toMatch(/^https:\/\/signed\.example\/r2\/print\//);

    const nfcOnly = await pairDevice(app, "NFC writer");
    expect((await request(app, "GET", "/api/provisioner/print-now", undefined, nfcOnly)).status).toBe(403);
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${asked.plates[1].id}/send`)).status).toBe(404);
    expect((await request(app, "POST", "/api/provisioner/print-sends/claim", {}, bench)).status).toBe(404);
  });

  it("makes every order made before requests a request of one plate", async () => {
    const migration = readFileSync(join(process.cwd(), "migrations", "0062_print_requests.sql"), "utf8");
    const app = admin();
    await createSerializedModel(app);
    const plate = await firstPlate(app, { model: "plate-large-menu-white" });
    await q("UPDATE print_jobs SET request_id = NULL, plate_number = NULL");
    await q("DELETE FROM print_requests");
    await pg.client.exec(migration);
    const [row] = await q("SELECT request_id, plate_number FROM print_jobs WHERE id = $1", [plate.id]);
    expect(row).toEqual({ request_id: plate.id, plate_number: 1 });
    expect((await request(app, "GET", `/api/xpot/admin/print-requests/${plate.id}`)).body).toMatchObject({ quantity: 4, plates: [expect.objectContaining({ id: plate.id })] });
  });
});

describe("which NFC goes inside", () => {
  const roundPause = { z: 1.8, text: "Press one round sticker into each pocket" };
  const rectPause = { z: 1.8, text: "Press one 10 x 20 sticker into each pocket" };
  const tagPause = { z: 2.76, text: "Insert one programmed round tag into each cavity" };
  const nfcVariants = {
    sticker_round_25: { pause: roundPause, consumes: [{ part: "nfc-sticker-round-25", perPiece: 1 }], material: { kind: "nfc_sticker", name: "NFC sticker", spec: "25.4 mm round" } },
    sticker_10x20: { pause: rectPause, consumes: [{ part: "nfc-sticker-10x20", perPiece: 1 }] },
    embedded_round: { pause: tagPause, consumes: [{ part: "nfc-tag-round-25", perPiece: 1 }] },
  };

  async function choiceModel(app: express.Express) {
    for (const slug of ["nfc-sticker-round-25", "nfc-sticker-10x20", "nfc-tag-round-25"]) {
      await request(app, "POST", "/api/xpot/admin/print-models", { slug, kind: "part", title: slug, version: { beds: [{ label: "bought", copies: 1 }] } });
      await request(app, "POST", `/api/xpot/admin/print-models/${slug}/part-count`, { delta: 10, reason: "bought" });
    }
    const created = await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "plate-large-menu-white", kind: "serialized", title: "Plate Large · Menu · White", productType: "large_plate", face: "menu", theme: "white",
      salesProductId: await salesProductId(), batchPrefix: "TPLATE",
      version: { builder: "plate.menu", params: { size: "large", theme: "white" }, recipe: { pause_top_z: 1.8, _pause: "old note" }, beds: [bedX4], consumes: [{ part: "nfc-sticker-round-25", perPiece: 1 }], nfcVariants },
    });
    expect(created.status).toBe(201);
  }

  it("refuses a print that does not say which, and a type the version does not have", async () => {
    const app = admin();
    await choiceModel(app);
    const missing = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 4 });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("print_nfc_required");
    const generated = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_plate", theme: "white", face: "menu", quantity: 4 });
    expect(generated.body.code).toBe("print_nfc_required");
    await request(app, "POST", "/api/xpot/admin/print-models/plate-large-menu-white/versions", {
      builder: "plate.menu", beds: [bedX4], changelog: "Only the round sticker", nfcVariants: { sticker_round_25: nfcVariants.sticker_round_25 },
    });
    const absent = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 4, nfcMount: "embedded_round" });
    expect(absent.status).toBe(409);
    expect(absent.body.code).toBe("print_nfc_unavailable");
    const invalid = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 4, nfcMount: "sticker_round_99" });
    expect(invalid.status).toBe(400);
  });

  it("a version with no choice keeps printing what it says, and refuses a type", async () => {
    const app = admin();
    await createSerializedModel(app);
    const plain = await firstPlate(app, { model: "plate-large-menu-white", quantity: 4 });
    expect(plain.nfcMount).toBeNull();
    expect(plain.bed.pause).toEqual(bedX4.pause);
    const refused = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 4, nfcMount: "sticker_10x20" });
    expect(refused.body.code).toBe("print_nfc_unavailable");
  });

  it("gives the bench the chosen type's file, and takes that sticker off the count", async () => {
    const app = admin();
    await choiceModel(app);
    const created = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_plate", theme: "white", face: "menu", quantity: 4, nfcMount: "embedded_round" });
    expect(created.status).toBe(201);
    expect(created.body.nfcMount).toBe("embedded_round");
    expect(created.body.plates[0].nfcMount).toBe("embedded_round");
    const detail = (await request(app, "GET", `/api/xpot/admin/print-jobs/${created.body.plates[0].id}`)).body;
    expect(detail.bed.pause).toEqual(tagPause);
    expect(detail.params.nfc_mount).toBe("embedded_round");
    expect(detail.consumes).toEqual([{ part: "nfc-tag-round-25", perPiece: 1 }]);

    const ticket = await (await import("../../server/tags/production.js")).jobTicket(created.body.plates[0].id, null);
    expect(ticket.version.params).toMatchObject({ size: "large", theme: "white", nfc_mount: "embedded_round" });
    expect(ticket.version.recipe).toEqual({ pause_top_z: 2.76 });
    expect(ticket.version.bed.pause).toEqual(tagPause);

    const id = created.body.plates[0].id;
    await request(app, "POST", `/api/xpot/admin/print-jobs/${id}/files?filename=plate.gcode.3mf`, bytes("gcode"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${id}/transition`, { action: "printed" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${id}/assembled`);
    expect((await request(app, "GET", "/api/xpot/admin/print-models/nfc-tag-round-25")).body.onHand).toBe(6);
    expect((await request(app, "GET", "/api/xpot/admin/print-models/nfc-sticker-round-25")).body.onHand).toBe(10);
  });

  it("a plate printed again keeps its type", async () => {
    const app = admin();
    await choiceModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white", quantity: 4, nfcMount: "sticker_10x20" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "cancel" });
    const again = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`);
    expect(again.status).toBe(201);
    expect(again.body.nfcMount).toBe("sticker_10x20");
    expect(again.body.bed.pause).toEqual(rectPause);
  });
});

describe("feedback and assembly", () => {
  async function printedOrder(app: express.Express, consumes: Array<{ part: string; perPiece: number }> = []) {
    await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "base-large", kind: "part", title: "Stand base · Large", version: { beds: [{ label: "x4", copies: 4 }] },
    });
    await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "stand-large-google-white", kind: "serialized", title: "Stand Large · Google · White", productType: "large_stand",
      face: "google_review", theme: "white", salesProductId: await salesProductId(), batchPrefix: "TSTAND",
      version: { builder: "stand.google", beds: [bedX4], consumes },
    });
    const order = await firstPlate(app, { model: "stand-large-google-white" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=cards.gcode.3mf`, bytes("gcode"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed" });
    return order;
  }

  it("records a problem on the batch's log, for the next version to fix", async () => {
    const app = admin();
    const order = await printedOrder(app);
    const res = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/problem`, { text: "White came out translucent" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "observation", action: "print_problem", content: "White came out translucent" });
    const [entry] = await q("SELECT batch_id, metadata FROM tag_journey_entries WHERE action = 'print_problem'");
    expect(entry.batch_id).toBe(order.batchId);
    expect(entry.metadata).toMatchObject({ printJobId: order.id, version: 1 });
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/problem`, { text: "" })).status).toBe(400);
  });

  it("takes the parts a piece consumes off their counts once, for the pieces in stock", async () => {
    const app = admin();
    const order = await printedOrder(app, [{ part: "base-large", perPiece: 1 }]);
    await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: 10, reason: "printed" });
    // One piece was marked bad (not stock) and one is still pending: only the two in stock are assembled.
    await q("UPDATE tags SET stock_status = 'damaged' WHERE public_code = $1", [order.pieces[0].publicCode]);
    await q("UPDATE tags SET stock_status = 'pending' WHERE public_code = $1", [order.pieces[1].publicCode]);
    const assembled = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/assembled`);
    expect(assembled.status).toBe(200);
    expect(assembled.body.report.assembledAt).toBeTruthy();
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.onHand).toBe(8);
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/assembled`)).body.code).toBe("print_assemble_done");

    // The same step written from the journey panel (or MCP) does not take them twice.
    await request(app, "POST", "/api/xpot/admin/tag-journey", { kind: "execution", action: "assembled", title: "Assembled again", batchId: order.batchId });
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.onHand).toBe(8);
    const moves = (await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.partMovements;
    expect(moves.map((m: any) => [m.delta, m.reason])).toEqual([[-2, "assembled"], [10, "printed"]]);
  });

  it("warns below a part's reorder point", async () => {
    const app = admin();
    await printedOrder(app);
    const set = await request(app, "PATCH", "/api/xpot/admin/print-models/base-large", { partReorderAt: 6 });
    expect(set.body).toMatchObject({ partReorderAt: 6, lowStock: true, onHand: 0 });
    await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: 6 });
    expect((await request(app, "GET", "/api/xpot/admin/print-models")).body.find((m: any) => m.slug === "base-large").lowStock).toBe(false);
    expect((await request(app, "PATCH", "/api/xpot/admin/print-models/stand-large-google-white", { partReorderAt: 3 })).body.partReorderAt).toBeNull();
  });
});

describe("parts", () => {
  async function createPart(app: express.Express) {
    const created = await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "base-large",
      kind: "part",
      title: "Stand base · Large",
      version: { beds: [{ label: "x6 full plate", copies: 6, minutes: 345.8, pause: { z: 11.12, text: "5 washers per base" } }] },
    });
    expect(created.status).toBe(201);
    return created.body;
  }

  it("keeps a fixed file on the bed, prints it as a ready order and counts what came off the bed", async () => {
    const app = admin();
    const model = await createPart(app);
    const versionId = model.currentVersion.id;
    const label = encodeURIComponent("x6 full plate");

    const noFile = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "base-large" });
    expect(noFile.body.plates[0].status).toBe("requested");
    await request(app, "POST", `/api/xpot/admin/print-jobs/${noFile.body.plates[0].id}/transition`, { action: "cancel" });

    const forged = await request(app, "POST", "/api/xpot/admin/print-models/base-large/versions", {
      beds: [{ label: "x6", copies: 6, fileRef: "r2:photos/1/secret.jpg" }], changelog: "forged",
    });
    expect(forged.body.code).toBe("print_bed_file_invalid");

    const upload = await request(app, "POST", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file?filename=6-BASES-LARGE.gcode.3mf`, bytes("bases"));
    expect(upload.status).toBe(201);
    expect(upload.body.beds[0]).toMatchObject({ fileName: "6-BASES-LARGE.gcode.3mf", fileBytes: 5 });
    expect((await request(app, "GET", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file`)).status).toBe(302);

    // 8 bases on a 6-up bed: a part's plate is its fixed file, so two whole plates (12).
    const asked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "base-large", quantity: 8 });
    expect(asked.body).toMatchObject({ quantity: 8 });
    expect(asked.body.plates.map((p: any) => [p.quantity, p.status, p.batchId])).toEqual([[6, "ready", null], [6, "ready", null]]);
    const order = await request(app, "GET", `/api/xpot/admin/print-jobs/${asked.body.plates[0].id}`);
    expect(order.body.files).toEqual([expect.objectContaining({ kind: "gcode_3mf", filename: "6-BASES-LARGE.gcode.3mf" })]);

    const locked = await request(app, "POST", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file?filename=new.3mf`, bytes("x"));
    expect(locked.status).toBe(409);

    for (const plate of asked.body.plates) await request(app, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "printed" });
    let detail = (await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body;
    expect(detail.onHand).toBe(12);

    const used = await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: -2, reason: "used", note: "Two bases for samples" });
    expect(used.body.onHand).toBe(10);
    detail = used.body;
    expect(detail.partMovements.map((m: any) => [m.delta, m.reason])).toEqual([[-2, "used"], [6, "printed"], [6, "printed"]]);
    const negative = await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: -11 });
    expect(negative.body.code).toBe("print_part_negative");
  });

  it("takes a part's fixed file from the bench too", async () => {
    const app = admin();
    const model = await createPart(app);
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const read = await request(app, "GET", "/api/provisioner/print-models/base-large", undefined, bench);
    expect(read.body.currentVersion.id).toBe(model.currentVersion.id);
    const label = encodeURIComponent("x6 full plate");
    const upload = await request(app, "POST", `/api/provisioner/print-models/base-large/versions/${model.currentVersion.id}/beds/${label}/file?filename=bases.gcode.3mf`, bytes("bases"), bench);
    expect(upload.status).toBe(201);
    expect(upload.body.beds[0]).toMatchObject({ fileName: "bases.gcode.3mf", fileBytes: 5 });
    const nfcOnly = await pairDevice(app, "NFC writer");
    expect((await request(app, "GET", "/api/provisioner/print-models/base-large", undefined, nfcOnly)).status).toBe(403);
  });
});

// Production per organization (migrations/0065, docs/organizations-execution-plan.md): a branch that prints its own
// pieces files its requests, plates, batches and pieces under itself; its Rep Admin and its bench see only its own,
// the admin (the owners) sees every one, and Boston (the company) keeps working as before.
describe("production per organization", () => {
  interface Branches { ny: number; miami: number; team: number; company: number }

  async function branches(): Promise<Branches> {
    const org = async (name: string, slug: string, prints: boolean) => (await q(
      `INSERT INTO organizations (name, slug, prints_own_pieces) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, prints_own_pieces = EXCLUDED.prints_own_pieces, is_active = true RETURNING id`,
      [name, slug, prints],
    ))[0].id as number;
    const ids = {
      ny: await org("Xpot New York", "xpot-ny", true),
      miami: await org("Xpot Miami", "xpot-miami", true),
      team: await org("Sales team", "sales-team", false),
      company: (await q("SELECT id FROM organizations WHERE slug = 'xpot-company'"))[0].id as number,
    };
    const person = async (userId: string, organizationId: number, role: "admin" | "member") => {
      await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ($1, $2, $1, false)", [userId, `${userId}@print.test`]);
      const [rep] = await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ($1, $1, $2, 'rep', true) RETURNING id", [userId, `${userId}@print.test`]);
      await q("INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, $3)", [organizationId, rep.id, role]);
    };
    await person("ny-admin", ids.ny, "admin");
    await person("ny-member", ids.ny, "member");
    await person("miami-admin", ids.miami, "admin");
    await person("team-admin", ids.team, "admin");
    return ids;
  }

  const orgOf = async (table: string, id: string) => (await q(`SELECT organization_id FROM ${table} WHERE id = $1`, [id]))[0].organization_id as number;

  it("lets in only the admin and the Rep Admin of a branch that prints its own pieces", async () => {
    await branches();
    await createSerializedModel(admin());
    for (const outsider of ["ny-member", "team-admin", "print-manager"]) {
      expect((await request(appFor(outsider), "GET", "/api/xpot/admin/print-requests")).status).toBe(403);
      expect((await request(appFor(outsider), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).status).toBe(403);
    }
    expect((await request(appFor("ny-admin"), "GET", "/api/xpot/admin/print-requests")).status).toBe(200);
    // The catalog itself stays the owners'.
    expect((await request(appFor("ny-admin"), "POST", "/api/xpot/admin/print-models", { slug: "x", kind: "part", title: "X" })).status).toBe(403);
    expect((await request(appFor("ny-admin"), "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { title: "Mine" })).status).toBe(403);
  });

  it("files a branch's request, plates, batch and pieces under the branch, and Boston's under the company", async () => {
    const ids = await branches();
    await createSerializedModel(admin());

    const ny = await request(appFor("ny-admin"), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 6 });
    expect(ny.status).toBe(201);
    expect(ny.body).toMatchObject({ organizationId: ids.ny, organizationName: "Xpot New York" });
    expect(ny.body.plates.map((p: any) => [p.quantity, p.organizationId])).toEqual([[4, ids.ny], [2, ids.ny]]);
    expect(await orgOf("print_requests", ny.body.id)).toBe(ids.ny);
    for (const plate of ny.body.plates) {
      expect(await orgOf("print_jobs", plate.id)).toBe(ids.ny);
      expect(await orgOf("tag_batches", plate.batchId)).toBe(ids.ny);
    }
    const nyPieces = await q("SELECT DISTINCT organization_id FROM tags WHERE batch_id = ANY($1::uuid[])", [ny.body.plates.map((p: any) => p.batchId)]);
    expect(nyPieces).toEqual([{ organization_id: ids.ny }]);

    // Boston unchanged: an admin's request without an organization is the company's.
    const boston = await request(admin(), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" });
    expect(boston.body.organizationId).toBe(ids.company);
    expect(await orgOf("tag_batches", boston.body.plates[0].batchId)).toBe(ids.company);
    // The admin may print for a branch that prints its own pieces, and for no other organization.
    const forMiami = await request(admin(), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", organization: "xpot-miami" });
    expect(forMiami.body.organizationId).toBe(ids.miami);
    const forTeam = await request(admin(), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", organization: "sales-team" });
    expect(forTeam.status).toBe(409);
    expect(forTeam.body.code).toBe("print_organization_not_printing");
  });

  it("keeps a branch's production away from every other branch, whatever the URL", async () => {
    const ids = await branches();
    await createSerializedModel(admin());
    const nyApp = appFor("ny-admin");
    const miami = appFor("miami-admin");
    const nyRequest = (await request(nyApp, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body;
    const plate = nyRequest.plates[0];
    const file = await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/files?filename=plate.gcode.3mf`, bytes("gcode"));
    expect(file.status).toBe(201);

    expect((await request(miami, "GET", "/api/xpot/admin/print-requests?status=all")).body).toEqual([]);
    expect((await request(miami, "GET", `/api/xpot/admin/print-requests?status=all&organization=${ids.ny}`)).body).toEqual([]);
    expect((await request(miami, "GET", "/api/xpot/admin/print-jobs?status=all")).body).toEqual([]);
    expect((await request(miami, "GET", `/api/xpot/admin/print-requests/${nyRequest.id}`)).status).toBe(404);
    expect((await request(miami, "GET", `/api/xpot/admin/print-jobs/${plate.id}`)).status).toBe(404);
    const attempts: Array<[string, string, unknown]> = [
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "cancel" }],
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/stock`, {}],
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/redo`, undefined],
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/problem`, { text: "Not mine to say" }],
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/assembled`, undefined],
      ["POST", `/api/xpot/admin/print-jobs/${plate.id}/files?filename=x.3mf`, bytes("x")],
      ["GET", `/api/xpot/admin/print-files/${file.body.id}`, undefined],
      ["GET", `/api/xpot/admin/tag-batches/${plate.batchId}`, undefined],
      ["GET", `/api/xpot/admin/tag-batches/${plate.batchId}/export.csv`, undefined],
      ["GET", `/api/xpot/admin/tag-batches/${plate.batchId}/qr-assets.zip`, undefined],
      ["POST", `/api/xpot/admin/tag-batches/${plate.batchId}/scan`, { value: "ABCDEFGH" }],
    ];
    for (const [method, path, body] of attempts) {
      expect([method, path, (await request(miami, method, path, body)).status]).toEqual([method, path, 404]);
    }
    expect((await request(miami, "GET", "/api/xpot/admin/tag-batches")).body).toEqual([]);
    // Asking to print for another branch reads as an organization that is not there.
    const intoNy = await request(miami, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", organization: "xpot-ny" });
    expect(intoNy.status).toBe(404);
    expect(await orgOf("print_jobs", plate.id)).toBe(ids.ny);
    expect((await request(nyApp, "GET", `/api/xpot/admin/print-jobs/${plate.id}`)).body.status).toBe("requested");

    // The owners see every organization and can narrow to one.
    await request(admin(), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" });
    const all = (await request(admin(), "GET", "/api/xpot/admin/print-requests?status=all")).body;
    expect(all.map((r: any) => r.organizationId).sort()).toEqual([ids.company, ids.ny].sort());
    const onlyNy = (await request(admin(), "GET", `/api/xpot/admin/print-requests?status=all&organization=${ids.ny}`)).body;
    expect(onlyNy.map((r: any) => r.id)).toEqual([nyRequest.id]);
    expect((await request(admin(), "GET", `/api/xpot/admin/print-jobs/${plate.id}`)).status).toBe(200);
    expect((await request(admin(), "GET", `/api/xpot/admin/tag-batches/${plate.batchId}`)).status).toBe(200);
  });

  it("generates a branch's pieces from the board in the branch, and the owners choose whose", async () => {
    const ids = await branches();
    await createSerializedModel(admin());
    const generate = { productType: "large_plate", theme: "white", face: "menu", quantity: 4 };
    const ny = await request(appFor("ny-admin"), "POST", "/api/xpot/admin/print-generate", generate);
    expect(ny.status).toBe(201);
    expect(ny.body.organizationId).toBe(ids.ny);
    expect(await orgOf("tag_batches", ny.body.plates[0].batchId)).toBe(ids.ny);
    expect((await request(appFor("miami-admin"), "GET", `/api/xpot/admin/print-requests/${ny.body.id}`)).status).toBe(404);
    expect((await request(appFor("miami-admin"), "POST", "/api/xpot/admin/print-generate", { ...generate, organization: "xpot-ny" })).status).toBe(404);
    expect((await request(appFor("ny-member"), "POST", "/api/xpot/admin/print-generate", generate)).status).toBe(403);
    expect((await request(admin(), "POST", "/api/xpot/admin/print-generate", generate)).body.organizationId).toBe(ids.company);
    expect((await request(admin(), "POST", "/api/xpot/admin/print-generate", { ...generate, organization: ids.miami })).body.organizationId).toBe(ids.miami);
  });

  it("lets a branch print, mark printed and stock its own pieces, in its own inventory", async () => {
    const ids = await branches();
    await createSerializedModel(admin());
    const nyApp = appFor("ny-admin");
    const plate = (await request(nyApp, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body.plates[0];
    await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/files?filename=plate.gcode.3mf`, bytes("gcode"));
    expect((await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "complete" })).status).toBe(200);
    const printed = await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "printed" });
    expect(printed.status).toBe(200);
    expect(printed.body.pieces.map((p: any) => p.stockStatus)).toEqual(["available", "available", "available", "available"]);
    expect(await q("SELECT DISTINCT organization_id, stock_status FROM tags WHERE batch_id = $1", [plate.batchId]))
      .toEqual([{ organization_id: ids.ny, stock_status: "available" }]);
    // Its batch page and the model's counts are its own.
    expect((await request(nyApp, "GET", `/api/xpot/admin/tag-batches/${plate.batchId}`)).body.organizationId).toBe(ids.ny);
    const count = async (userId: string) =>
      (await request(appFor(userId), "GET", "/api/xpot/admin/print-models")).body.find((m: any) => m.slug === "plate-large-menu-white").onHand;
    expect(await count("ny-admin")).toBe(4);
    expect(await count("miami-admin")).toBe(0);
    expect(await count("print-admin")).toBe(4);
  });

  it("keeps parts and their counts the company's", async () => {
    await branches();
    const app = admin();
    await request(app, "POST", "/api/xpot/admin/print-models", { slug: "base-large", kind: "part", title: "Stand base · Large", version: { beds: [{ label: "x4", copies: 4 }] } });
    await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "stand-large-google-white", kind: "serialized", title: "Stand Large · Google · White", productType: "large_stand",
      face: "google_review", theme: "white", salesProductId: await salesProductId(), batchPrefix: "TSTAND",
      version: { builder: "stand.google", beds: [bedX4], consumes: [{ part: "base-large", perPiece: 1 }] },
    });
    await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: 10, reason: "printed" });
    const nyApp = appFor("ny-admin");
    expect((await request(nyApp, "GET", "/api/xpot/admin/print-models")).body.map((m: any) => m.slug)).toEqual(["stand-large-google-white"]);
    expect((await request(nyApp, "GET", "/api/xpot/admin/print-models/base-large")).status).toBe(404);
    expect((await request(nyApp, "POST", "/api/xpot/admin/print-jobs", { model: "base-large" })).status).toBe(404);
    expect((await request(nyApp, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: 1, reason: "printed" })).status).toBe(403);
    const forNy = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "base-large", organization: "xpot-ny" });
    expect(forNy.status).toBe(409);
    expect(forNy.body.code).toBe("print_part_company_only");

    // Assembling a branch's batch takes nothing off the company's bases.
    const plate = (await request(nyApp, "POST", "/api/xpot/admin/print-jobs", { model: "stand-large-google-white" })).body.plates[0];
    await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/files?filename=s.gcode.3mf`, bytes("gcode"));
    await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "complete" });
    await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "printed" });
    expect((await request(nyApp, "POST", `/api/xpot/admin/print-jobs/${plate.id}/assembled`)).status).toBe(200);
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.onHand).toBe(10);
  });

  it("gives a branch's bench only its branch's plates, and a branch's writer only its pieces' chips", async () => {
    const ids = await branches();
    await createSerializedModel(admin());
    const boston = (await request(admin(), "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body.plates[0];
    const nyApp = appFor("ny-admin");
    const nyPlate = (await request(nyApp, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body.plates[0];

    // The branch's Rep Admin pairs its own bench, which works for the branch.
    const nyBench = await pairDevice(nyApp, "NY bench", ["print", "nfc"]);
    const nyDevices = (await request(nyApp, "GET", "/api/xpot/admin/tag-provisioners")).body;
    expect(nyDevices.map((d: any) => [d.deviceName, d.organizationId])).toEqual([["NY bench", ids.ny]]);
    expect((await request(appFor("miami-admin"), "GET", "/api/xpot/admin/tag-provisioners")).body).toEqual([]);
    expect((await request(appFor("miami-admin"), "POST", `/api/xpot/admin/tag-provisioners/${nyDevices[0].id}/revoke`)).status).toBe(404);
    expect((await request(appFor("miami-admin"), "POST", "/api/xpot/admin/tag-provisioners", { deviceName: "Sneaky", organizationId: ids.ny })).status).toBe(404);

    // Boston's plate is older, yet the NY bench takes the NY one, and cannot take Boston's by id.
    const ticket = await request(nyApp, "POST", "/api/provisioner/print-jobs/claim", {}, nyBench);
    expect(ticket.body.job.id).toBe(nyPlate.id);
    expect((await request(nyApp, "POST", "/api/provisioner/print-jobs/claim", {}, nyBench)).status).toBe(204);
    expect((await request(nyApp, "POST", "/api/provisioner/print-jobs/claim", { jobId: boston.id }, nyBench)).status).toBe(404);
    const bostonBench = await pairDevice(admin(), "Boston bench", ["print"]);
    expect((await request(admin(), "POST", "/api/provisioner/print-jobs/claim", {}, bostonBench)).body.job.id).toBe(boston.id);

    await request(nyApp, "POST", `/api/provisioner/print-jobs/${nyPlate.id}/files?filename=ny.gcode.3mf`, bytes("ny"), nyBench);
    await request(nyApp, "POST", `/api/provisioner/print-jobs/${nyPlate.id}/complete`, { outcome: "ready" }, nyBench);
    await request(admin(), "POST", `/api/provisioner/print-jobs/${boston.id}/files?filename=boston.gcode.3mf`, bytes("bos"), bostonBench);
    await request(admin(), "POST", `/api/provisioner/print-jobs/${boston.id}/complete`, { outcome: "ready" }, bostonBench);
    expect((await request(nyApp, "GET", "/api/provisioner/print-now", undefined, nyBench)).body.map((p: any) => p.id)).toEqual([nyPlate.id]);
    expect((await request(admin(), "GET", "/api/provisioner/print-now", undefined, bostonBench)).body.map((p: any) => p.id)).toEqual([boston.id]);
    // The catalog's fixed files are the company's: a branch bench does not upload them.
    const model = (await request(admin(), "GET", "/api/xpot/admin/print-models/plate-large-menu-white")).body;
    const bedFile = `/api/provisioner/print-models/plate-large-menu-white/versions/${model.currentVersion.id}/beds/x4/file?filename=x.3mf`;
    expect((await request(nyApp, "POST", bedFile, bytes("x"), nyBench)).status).toBe(403);

    // A chip of a Boston piece is not for the NY writer.
    const [bostonPiece] = await q("SELECT id FROM tags WHERE batch_id = $1 ORDER BY serial_number LIMIT 1", [boston.batchId]);
    expect((await request(admin(), "POST", `/api/xpot/admin/tags/${bostonPiece.id}/provisioning-jobs`, {})).status).toBe(201);
    expect((await request(nyApp, "POST", "/api/provisioner/jobs/claim", {}, nyBench)).status).toBe(204);
    const pointed = await request(admin(), "POST", `/api/xpot/admin/tags/${bostonPiece.id}/provisioning-jobs`, { deviceId: nyDevices[0].id });
    expect(pointed.status).toBe(409);
    expect(pointed.body.code).toBe("provisioner_other_organization");
    // Handed out in a kit, a Boston piece moves to the rep's organization: Boston's writer still writes its chip.
    await q("UPDATE tags SET organization_id = $1 WHERE id = $2", [ids.miami, bostonPiece.id]);
    // (The Boston bench claims chip jobs too; pairing another computer would trip the pairing rate limit.)
    const claimed = await request(admin(), "POST", "/api/provisioner/jobs/claim", {}, bostonBench);
    expect(claimed.status).toBe(200);
    expect(claimed.body.tagId).toBe(bostonPiece.id);
  });

  it("lets only the admin switch a branch to printing its own pieces", async () => {
    const ids = await branches();
    const { createOrganizationsRouter } = await import("../../server/routes/xpot/organizations.js");
    const orgApp = (userId: string) => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).session = { userId, email: `${userId}@print.test`, isAdmin: userId === "print-admin" };
        next();
      });
      app.use("/api/xpot", createOrganizationsRouter());
      return app;
    };
    const path = `/api/xpot/organizations/${ids.team}`;
    expect((await request(orgApp("print-manager"), "PATCH", path, { printsOwnPieces: true })).status).toBe(403);
    expect((await request(orgApp("team-admin"), "PATCH", path, { printsOwnPieces: true })).status).toBe(403);
    expect((await request(appFor("team-admin"), "GET", "/api/xpot/admin/print-requests")).status).toBe(403);
    const on = await request(orgApp("print-admin"), "PATCH", path, { printsOwnPieces: true });
    expect(on.status).toBe(200);
    expect(on.body.printsOwnPieces).toBe(true);
    expect((await request(appFor("team-admin"), "GET", "/api/xpot/admin/print-requests")).status).toBe(200);
  });
});

describe("the Production page", () => {
  async function createModel(app: express.Express, slug: string, theme: string, face: string, builder: string | null) {
    const created = await request(app, "POST", "/api/xpot/admin/print-models", {
      slug,
      kind: "serialized",
      title: slug,
      productType: "large_stand",
      face,
      theme,
      salesProductId: await salesProductId(),
      batchPrefix: "TREV",
      ...(builder ? { version: { builder, params: { size: "large", theme }, recipe: {}, beds: [bedX4] } } : {}),
    });
    expect(created.status).toBe(201);
  }

  it("generates a stocked stand by colour and face: fresh serials per plate, pending until the plate is printed", async () => {
    const app = admin();
    await createModel(app, "stand-large-google-white", "white", "google_review", "stand.google");
    await createModel(app, "stand-large-instagram-black", "black", "instagram", "stand.instagram");
    await createModel(app, "stand-large-venmo-black", "black", "venmo", null);

    const made = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_stand", theme: "White", face: "google_review", quantity: 6 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ modelSlug: "stand-large-google-white", quantity: 6, open: true });
    expect(made.body.plates.map((p: any) => [p.quantity, p.status, p.batchCode])).toEqual([
      [4, "requested", `TREV-${year}-001`],
      [2, "requested", `TREV-${year}-002`],
    ]);
    const pieces = await q("SELECT public_code, stock_status FROM tags");
    expect(pieces).toHaveLength(6);
    expect(new Set(pieces.map((p) => p.public_code)).size).toBe(6);
    expect(pieces.every((p) => p.stock_status === "pending")).toBe(true);

    const [first, second] = made.body.plates;
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${first.id}/transition`, { action: "printed" })).status).toBe(200);
    const byBatch = await q("SELECT batch_id, stock_status, count(*)::int AS n FROM tags GROUP BY batch_id, stock_status ORDER BY n DESC");
    expect(byBatch).toEqual([
      { batch_id: first.batchId, stock_status: "available", n: 4 },
      { batch_id: second.batchId, stock_status: "pending", n: 2 },
    ]);
    const open = (await request(app, "GET", "/api/xpot/admin/print-requests?status=open")).body;
    expect(open.map((r: any) => r.plates.map((p: any) => p.status))).toEqual([["printed", "requested"]]);
  });

  it("refuses a colour or face the house does not make, and anything outside the known values", async () => {
    const app = admin();
    await createModel(app, "stand-large-google-white", "white", "google_review", "stand.google");
    await createModel(app, "stand-large-venmo-black", "black", "venmo", null);
    const notDrawn = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_stand", theme: "black", face: "venmo", quantity: 4 });
    expect(notDrawn.status).toBe(409);
    expect(notDrawn.body.code).toBe("print_choice_unavailable");
    const otherProduct = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "small_plate", theme: "white", face: "google_review", quantity: 4 });
    expect(otherProduct.body.code).toBe("print_choice_unavailable");
    const unknownFace = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_stand", theme: "white", face: "myspace", quantity: 4 });
    expect(unknownFace.status).toBe(400);
    expect(await q("SELECT id FROM print_requests")).toEqual([]);
    expect(await q("SELECT id FROM tags")).toEqual([]);
    const leftoverManager = await request(appFor("print-manager"), "POST", "/api/xpot/admin/print-generate", { productType: "large_stand", theme: "white", face: "google_review", quantity: 4 });
    expect(leftoverManager.status).toBe(403);
  });

  it("downloads an always-ready piece's file as often as needed, and records nothing", async () => {
    const app = admin();
    const created = await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "base-large",
      kind: "part",
      title: "Stand base · Large",
      version: { beds: [{ label: "x4", copies: 4 }, { label: "x6 full plate", copies: 6 }] },
    });
    expect(created.status).toBe(201);
    const missing = await request(app, "GET", "/api/xpot/admin/print-models/base-large/print-file");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("print_bed_file_missing");

    const versionId = created.body.currentVersion.id;
    const label = encodeURIComponent("x6 full plate");
    expect((await request(app, "POST", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file?filename=bases-x6.3mf`, bytes("bases"))).status).toBe(201);

    for (let i = 0; i < 3; i++) {
      const download = await request(app, "GET", "/api/xpot/admin/print-models/base-large/print-file");
      expect(download.status).toBe(302);
      expect(download.headers.get("location")).toBeTruthy();
    }
    expect((await request(app, "GET", `/api/xpot/admin/print-models/base-large/print-file?bed=${label}`)).status).toBe(302);
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large/print-file?bed=x4")).body.code).toBe("print_bed_file_missing");
    expect(await q("SELECT id FROM print_requests")).toEqual([]);
    expect(await q("SELECT id FROM print_jobs")).toEqual([]);
    expect((await q("SELECT part_on_hand FROM print_models WHERE slug = 'base-large'"))[0].part_on_hand).toBe(0);

    await createSerializedModel(app);
    const serialized = await request(app, "GET", "/api/xpot/admin/print-models/plate-large-menu-white/print-file");
    expect(serialized.status).toBe(400);
    expect((await request(appFor("print-manager"), "GET", "/api/xpot/admin/print-models/base-large/print-file")).status).toBe(403);
  });
});

describe("consistency of the piece creation", () => {
  it("prints a failed plate again once, even when asked twice at the same moment", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "fail", reason: "Lifted" });

    const [one, two] = await Promise.all([
      request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`),
      request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`),
    ]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    const made = one.status === 201 ? one.body : two.body;
    expect((one.status === 409 ? one.body : two.body).code).toBe("print_job_redone");
    expect((await q("SELECT count(*)::int AS n FROM print_jobs WHERE request_id = $1", [order.requestId]))[0].n).toBe(2);

    // The old attempt says which one took its place; the new one has no successor.
    expect((await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body.redoneBy).toBe(made.id);
    expect(made.redoneBy).toBeNull();
    const again = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`);
    expect(again).toMatchObject({ status: 409, body: { code: "print_job_redone" } });
  });

  it("asks for the damaged pieces of a printed plate again once, even when asked twice at the same moment", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    const again = (id: string) => request(app, "POST", `/api/xpot/admin/print-jobs/${id}/reprint-damaged`);
    // Not printed yet: nothing to ask for.
    expect((await again(order.id)).body.code).toBe("print_job_state");
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=plate.3mf`, bytes("3mf"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed", badPieces: [order.pieces[1].publicCode, order.pieces[2].publicCode] });

    const [one, two] = await Promise.all([again(order.id), again(order.id)]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    const made = one.status === 201 ? one.body : two.body;
    expect((one.status === 409 ? one.body : two.body).code).toBe("print_job_reprinted");
    // One request for the two damaged pieces, counted by the server and tied to the plate it replaces.
    expect(made.quantity).toBe(2);
    expect(await q("SELECT quantity, replaces_job_id FROM print_requests WHERE replaces_job_id = $1", [order.id])).toEqual([{ quantity: 2, replaces_job_id: order.id }]);
    expect((await q("SELECT count(*)::int AS n FROM print_requests"))[0].n).toBe(2);

    // Each side says which one it is: the old plate points to the new one, the new one to the old.
    const old = (await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body;
    expect(old.reprintedBy).toMatchObject({ id: made.plates[0].id, batchCode: made.plates[0].batchCode });
    expect((await request(app, "GET", `/api/xpot/admin/print-jobs/${made.plates[0].id}`)).body.replaces).toMatchObject({ id: order.id, batchCode: order.batchCode });
    expect(await again(order.id)).toMatchObject({ status: 409, body: { code: "print_job_reprinted" } });

    // A replacement cancelled whole leaves the damaged pieces free to be asked for again.
    await request(app, "POST", `/api/xpot/admin/print-jobs/${made.plates[0].id}/transition`, { action: "cancel" });
    expect((await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body.reprintedBy).toBeNull();
    expect((await again(order.id)).status).toBe(201);
  });

  it("refuses to ask for damaged pieces again when none came out damaged", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=plate.3mf`, bytes("3mf"));
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "printed" });
    expect(await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/reprint-damaged`)).toMatchObject({ status: 409, body: { code: "print_job_no_damaged" } });
    expect((await q("SELECT count(*)::int AS n FROM print_requests"))[0].n).toBe(1);
  });

  it("closes a failed plate that will not be printed again with cancel", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "fail", reason: "Lifted" });
    const cancelled = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "cancel" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: "cancelled", redoneBy: null });
  });

  it("writes a model and its first version together, or neither", async () => {
    const app = admin();
    const body = {
      slug: "plate-large-menu-white", kind: "serialized", title: "Plate", productType: "large_plate", face: "menu", theme: "white",
      salesProductId: await salesProductId(), batchPrefix: "TPLATE",
    };
    const refused = await request(app, "POST", "/api/xpot/admin/print-models", { ...body, version: { builder: "plate.menu", beds: [bedX4], fixesBatch: "NOPE-2026-001" } });
    expect(refused.status).toBe(404);
    expect((await q("SELECT count(*)::int AS n FROM print_models"))[0].n).toBe(0);
    const retried = await request(app, "POST", "/api/xpot/admin/print-models", { ...body, version: { builder: "plate.menu", beds: [bedX4] } });
    expect(retried.status).toBe(201);
    expect(retried.body).toMatchObject({ status: "ready", currentVersion: { version: 1 } });
  });

  it("writes a request and all its plates together, or none of them", async () => {
    const app = admin();
    await createSerializedModel(app);
    await q(`CREATE FUNCTION refuse_second_plate() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.plate_number = 2 THEN RAISE EXCEPTION 'plate 2 refused'; END IF; RETURN NEW; END $$`);
    await q("CREATE TRIGGER refuse_second_plate BEFORE INSERT ON print_jobs FOR EACH ROW EXECUTE FUNCTION refuse_second_plate()");
    try {
      const failed = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 8 });
      expect(failed.status).toBe(500);
      for (const table of ["print_requests", "print_jobs", "tag_batches", "tags", "tag_journey_entries"]) {
        expect((await q(`SELECT count(*)::int AS n FROM ${table}`))[0].n).toBe(0);
      }
    } finally {
      await q("DROP TRIGGER refuse_second_plate ON print_jobs");
      await q("DROP FUNCTION refuse_second_plate()");
    }
    // Without the failure, the same request makes both plates with consecutive batch codes, and their journey.
    const asked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", quantity: 8 });
    expect(asked.body.plates.map((p: any) => p.batchCode)).toEqual([`TPLATE-${year}-001`, `TPLATE-${year}-002`]);
    expect((await q("SELECT count(*)::int AS n FROM tag_journey_entries WHERE action = 'batch_created'"))[0].n).toBe(2);
  });

  it("generates a model whatever case its colour was typed in", async () => {
    const app = admin();
    const created = await createSerializedModel(app);
    expect(created.body.theme).toBe("white");
    const typed = await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { theme: "  Black " });
    expect(typed.body.theme).toBe("black");
    // A colour saved before it was kept in lowercase still groups and generates.
    await q("UPDATE print_models SET theme = 'WHITE' WHERE slug = 'plate-large-menu-white'");
    const made = await request(app, "POST", "/api/xpot/admin/print-generate", { productType: "large_plate", theme: "White", face: "menu", quantity: 4 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ modelSlug: "plate-large-menu-white", quantity: 4 });
  });

  it("keeps a serialized model complete, and its product and face once a plate was ordered", async () => {
    const app = admin();
    const noFace = await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "plate-x", kind: "serialized", title: "Plate", productType: "large_plate", theme: "white", salesProductId: await salesProductId(), batchPrefix: "TPLATE",
    });
    expect(noFace.status).toBe(400);
    await createSerializedModel(app);
    const emptied = await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { theme: null });
    expect(emptied).toMatchObject({ status: 400, body: { code: "print_model_incomplete" } });
    // Before any plate the product and face can still be corrected.
    expect((await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { face: "google_review" })).body.face).toBe("google_review");
    expect((await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { face: "menu", productType: "small_plate" })).body.productType).toBe("small_plate");
    await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { productType: "large_plate" });
    await firstPlate(app, { model: "plate-large-menu-white" });
    const changed = await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { face: "google_review" });
    expect(changed).toMatchObject({ status: 409, body: { code: "print_model_used" } });
    // A face that was never set is filled in, not changed.
    await q("UPDATE print_models SET face = NULL WHERE slug = 'plate-large-menu-white'");
    const completed = await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { face: "menu" });
    expect(completed).toMatchObject({ status: 200, body: { face: "menu" } });

    // A model saved before face and colour were required is still retired, restored and reordered as it is; only an
    // edit of those fields (or emptying one) has to complete it.
    await q("UPDATE print_models SET face = NULL, theme = NULL WHERE slug = 'plate-large-menu-white'");
    for (const patch of [{ retired: true }, { retired: false }, { sortOrder: 5 }, { title: "Legacy plate" }]) {
      expect((await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", patch)).status).toBe(200);
    }
    expect((await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { theme: "" })).body.code).toBe("print_model_incomplete");
    expect((await request(app, "PATCH", "/api/xpot/admin/print-models/plate-large-menu-white", { batchPrefix: null })).body.code).toBe("print_model_incomplete");
  });

  it("links an existing batch with the Print dialog's checks, for the batch's own organization", async () => {
    const app = admin();
    await createSerializedModel(app);
    const batch = async (face: string, quantity: number) => (await request(app, "POST", "/api/xpot/admin/tag-batches", {
      name: "Old plates", productType: "large_plate", salesProductId: await salesProductId(), face, quantity,
    })).body;
    const google = await batch("google_review", 4);
    const wrongFace = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: google.batchCode });
    expect(wrongFace.body.code).toBe("print_batch_face_mismatch");
    const six = await batch("menu", 6);
    const tooBig = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: six.batchCode });
    expect(tooBig.body.code).toBe("print_batch_bed_too_small");

    // A branch's batch is linked for the branch when no organization is named.
    const [branch] = await q("INSERT INTO organizations (name, slug, prints_own_pieces) VALUES ('Xpot New York', 'xpot-ny', true) RETURNING id");
    const theirs = await batch("menu", 4);
    await q("UPDATE tag_batches SET organization_id = $1 WHERE id = $2", [branch.id, theirs.id]);
    await q("UPDATE tags SET organization_id = $1 WHERE batch_id = $2", [branch.id, theirs.id]);
    const linked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: theirs.batchCode });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({ organizationId: branch.id, quantity: 4 });
  });

  it("prints again with fresh codes once a piece was received, retiring the codes never printed", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = await firstPlate(app, { model: "plate-large-menu-white" });
    const [kept] = await q("UPDATE tags SET stock_status = 'available' WHERE id = (SELECT id FROM tags WHERE batch_id = $1 ORDER BY serial_number LIMIT 1) RETURNING id", [order.batchId]);
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "fail", reason: "Half the plate lifted" });
    const redo = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/redo`);
    expect(redo.status).toBe(201);
    expect(redo.body.batchId).not.toBe(order.batchId);
    const old = await q("SELECT id, stock_status FROM tags WHERE batch_id = $1 ORDER BY serial_number", [order.batchId]);
    expect(old).toEqual([{ id: kept.id, stock_status: "available" }, ...Array(3).fill(expect.objectContaining({ stock_status: "retired" }))]);
    // The batch keeps the piece it received: it is not cancelled.
    expect((await q("SELECT status FROM tag_batches WHERE id = $1", [order.batchId]))[0].status).not.toBe("cancelled");
  });

  it("never replaces a part's file a plate took, even a failed one, and drops a file it replaces", async () => {
    const app = admin();
    const part = (await request(app, "POST", "/api/xpot/admin/print-models", {
      slug: "base-large", kind: "part", title: "Stand base · Large", version: { beds: [{ label: "x6", copies: 6 }] },
    })).body;
    const url = (name: string) => `/api/xpot/admin/print-models/base-large/versions/${part.currentVersion.id}/beds/x6/file?filename=${name}`;
    const first = await request(app, "POST", url("first.3mf"), bytes("first"));
    const firstRef = first.body.beds[0].fileName;
    expect(firstRef).toBe("first.3mf");
    await request(app, "POST", url("second.3mf"), bytes("second"));
    expect(store.removed.some((key) => key.endsWith("first.3mf"))).toBe(true);

    const plate = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "base-large" })).body.plates[0];
    expect(plate.status).toBe("ready");
    await request(app, "POST", `/api/xpot/admin/print-jobs/${plate.id}/transition`, { action: "fail", reason: "Warped" });
    const locked = await request(app, "POST", url("third.3mf"), bytes("third"));
    expect(locked).toMatchObject({ status: 409, body: { code: "print_version_used" } });
    // The refused upload leaves no file behind in storage.
    expect(Array.from(store.objects.keys()).some((key) => key.endsWith("third.3mf"))).toBe(false);
    const redo = await request(app, "POST", `/api/xpot/admin/print-jobs/${plate.id}/redo`);
    expect(redo.body).toMatchObject({ status: "ready" });
    expect(redo.body.files).toEqual([expect.objectContaining({ filename: "second.3mf" })]);
  });
});
