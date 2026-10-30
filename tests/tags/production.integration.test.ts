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
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('print-manager', 'print-manager@print.test', 'Manager', false)");
  await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('print-manager', 'Manager', 'print-manager@print.test', 'manager', true)");
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
    const batch = (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === order.batchId);
    expect(batch.stage).toBe("printed");

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

  it("links a batch made before the catalog, with the status it already reached", async () => {
    const app = admin();
    await createSerializedModel(app);
    const legacy = await request(app, "POST", "/api/xpot/admin/tag-batches", {
      name: "Old plates", productType: "large_plate", salesProductId: await salesProductId(), face: "menu", quantity: 4,
    });
    await q("INSERT INTO tag_journey_entries (kind, action, title, batch_id, source, actor, occurred_at) VALUES ('execution', 'printed', 'Printed', $1, 'mcp', 'ai', '2026-10-21T12:00:00Z')", [legacy.body.id]);

    const linked = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", existingBatch: legacy.body.batchCode });
    expect(linked.status).toBe(201);
    expect(linked.body).toMatchObject({ quantity: 4, open: true });
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
    expect(batch.name).toBe("Plate Large · Menu · White · v1 · plate 3/3 · 2 of x4");

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

  it("keeps printed requests open until receiving is complete, while failed/cancelled plates do not block completion", async () => {
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

    await request(app, "POST", `/api/xpot/admin/print-jobs/${redo.body.id}/transition`, { action: "cancel" });
    expect((await request(app, "GET", "/api/xpot/admin/print-requests")).body.map((r: any) => r.id)).toEqual([asked.id]);
    expect((await request(app, "GET", "/api/xpot/admin/print-requests?status=done")).body).toEqual([]);
    const pieces = await q("SELECT public_code FROM tags WHERE batch_id = $1 ORDER BY serial_number", [one.batchId]);
    for (const piece of pieces.slice(0, -1)) {
      const received = await request(app, "POST", `/api/xpot/admin/tag-batches/${one.batchId}/scan`, { value: piece.public_code, idempotencyKey: `receive:${piece.public_code}` });
      expect(received.status).toBe(201);
    }
    expect((await request(app, "GET", "/api/xpot/admin/print-requests")).body).toHaveLength(1);
    const last = pieces[pieces.length - 1];
    expect((await request(app, "POST", `/api/xpot/admin/tag-batches/${one.batchId}/scan`, { value: last.public_code, idempotencyKey: `receive:${last.public_code}` })).status).toBe(201);
    expect((await request(app, "GET", "/api/xpot/admin/print-requests")).body).toEqual([]);
    const done = (await request(app, "GET", "/api/xpot/admin/print-requests?status=done&model=plate-large-menu-white")).body;
    expect(done.map((r: any) => [r.id, r.open])).toEqual([[asked.id, false]]);
    expect((await request(app, "GET", `/api/xpot/admin/print-requests/${asked.id}`)).body.plates).toHaveLength(3);
    expect((await request(app, "GET", `/api/xpot/admin/print-requests/${crypto.randomUUID()}`)).body.code).toBe("print_request_not_found");
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

  it("takes the parts a piece consumes off their counts once, for the pieces received", async () => {
    const app = admin();
    const order = await printedOrder(app, [{ part: "base-large", perPiece: 1 }]);
    await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: 10, reason: "printed" });
    for (const piece of order.pieces.slice(0, 3)) {
      expect((await request(app, "POST", `/api/xpot/admin/tag-batches/${order.batchId}/scan`, { value: piece.publicCode })).status).toBe(201);
    }
    const assembled = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/assembled`);
    expect(assembled.status).toBe(200);
    expect(assembled.body.report.assembledAt).toBeTruthy();
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.onHand).toBe(7);
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/assembled`)).body.code).toBe("print_assemble_done");

    // The same step written from the journey panel (or MCP) does not take them twice.
    await request(app, "POST", "/api/xpot/admin/tag-journey", { kind: "execution", action: "assembled", title: "Assembled again", batchId: order.batchId });
    expect((await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.onHand).toBe(7);
    const moves = (await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body.partMovements;
    expect(moves.map((m: any) => [m.delta, m.reason])).toEqual([[-3, "assembled"], [10, "printed"]]);
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
