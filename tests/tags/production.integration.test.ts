import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore, type MemoryStore } from "../helpers/memoryStore.js";

// Tags › Production (docs/PRINT_EXECUTION_PLAN.md): catalog, versions, print orders, files, the bench's side and
// part counts, end to end through the HTTP routes on an in-process Postgres (PGlite) with every migration applied.

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
  await q(`TRUNCATE print_part_movements, print_job_files, print_jobs, print_model_versions, print_models,
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

describe("serialized print orders", () => {
  it("issues the batch and the order in one step, with the next code for the prefix", async () => {
    const app = admin();
    await createSerializedModel(app);
    const first = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "requested", quantity: 4, pieceCount: 4, receivedCount: 0, batchCode: `TPLATE-${year}-001`, version: 1 });
    expect(first.body.pieces.map((p: any) => p.position)).toEqual(["front-left", "front-right", "back-left", "back-right"]);
    expect(first.body.pieces.every((p: any) => p.stockStatus === "pending")).toBe(true);

    const [batch] = await q("SELECT code_source, print_job_id, face, product_type FROM tag_batches WHERE id = $1", [first.body.batchId]);
    expect(batch).toEqual({ code_source: "issued", print_job_id: first.body.id, face: "menu", product_type: "large_plate" });
    const listed = (await request(app, "GET", "/api/xpot/admin/tag-batches")).body.find((b: any) => b.id === first.body.batchId);
    expect(listed.printJobId).toBe(first.body.id);

    const two = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white", plates: 2 });
    expect(two.body).toMatchObject({ batchCode: `TPLATE-${year}-002`, quantity: 8, plates: 2 });
    expect(two.body.pieces.map((p: any) => p.position).slice(4)).toEqual(["front-left", "front-right", "back-left", "back-right"]);

    const queue = (await request(app, "GET", "/api/xpot/admin/print-jobs")).body;
    expect(queue).toHaveLength(2);
    const catalog = (await request(app, "GET", "/api/xpot/admin/print-models")).body;
    expect(catalog[0]).toMatchObject({ openJobs: 2, onHand: 0 });
  });

  it("goes requested → building → ready through the bench, then printed from the panel", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body;

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
    const order = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body;
    const file = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/files?filename=batch.3mf`, bytes("3mf"));
    expect(file.body.kind).toBe("3mf");
    const ready = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/transition`, { action: "complete" });
    expect(ready.body.status).toBe("ready");
  });

  it("prints a failed order again on the same batch while none of its pieces was received", async () => {
    const app = admin();
    await createSerializedModel(app);
    const order = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body;
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
    expect(linked.body).toMatchObject({ status: "printed", batchId: legacy.body.id, quantity: 4, printedAt: "2026-10-21T12:00:00.000Z" });

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

describe("send to printer", () => {
  async function readyOrder(app: express.Express, bench: Record<string, string>, sliced = true) {
    await createSerializedModel(app);
    const order = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "plate-large-menu-white" })).body;
    await request(app, "POST", "/api/provisioner/print-jobs/claim", { jobId: order.id }, bench);
    const name = sliced ? "plates.gcode.3mf" : "plates.3mf";
    await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/files?filename=${name}`, bytes("gcode"), bench);
    await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/complete`, { outcome: "ready" }, bench);
    return order;
  }

  it("goes from the admin's click through the bench to printing, once", async () => {
    const app = admin();
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const order = await readyOrder(app, bench);
    expect((await request(app, "POST", "/api/provisioner/print-sends/claim", {}, bench)).status).toBe(204);

    const asked = await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/send`);
    expect(asked.status).toBe(200);
    expect(asked.body.sendRequestedAt).toBeTruthy();
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/send`)).body.code).toBe("print_send_pending");

    const ticket = await request(app, "POST", "/api/provisioner/print-sends/claim", {}, bench);
    expect(ticket.status).toBe(200);
    expect(ticket.body).toMatchObject({ job: { id: order.id, quantity: 4 }, file: { filename: "plates.gcode.3mf" }, amsMapping: [0, 1] });
    expect(ticket.body.file.url).toMatch(/^https:\/\/signed\.example\/r2\/print\//);
    expect(ticket.body.subtaskName).toMatch(new RegExp(`^TPLATE-${year}-001 Plate Large Menu White$`));
    expect((await request(app, "POST", "/api/provisioner/print-sends/claim", {}, bench)).status).toBe(204);
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/send/cancel`)).body.code).toBe("print_send_in_progress");

    const sent = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/sent`, { ok: true, printer: "Jujubinha" }, bench);
    expect(sent.body.status).toBe("printing");
    const detail = (await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body;
    expect(detail.sentAt).toBeTruthy();
    expect(detail.report.printer).toBe("Jujubinha");
  });

  it("clears the request and keeps the reason when the printer refuses", async () => {
    const app = admin();
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const order = await readyOrder(app, bench);
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/send`);
    await request(app, "POST", "/api/provisioner/print-sends/claim", {}, bench);
    const refused = await request(app, "POST", `/api/provisioner/print-jobs/${order.id}/sent`, { ok: false, error: "Printer busy: RUNNING" }, bench);
    expect(refused.body.status).toBe("ready");
    const detail = (await request(app, "GET", `/api/xpot/admin/print-jobs/${order.id}`)).body;
    expect(detail.sendRequestedAt).toBeNull();
    expect(detail.report.sendError.message).toBe("Printer busy: RUNNING");
  });

  it("needs a sliced file, and shows each bench's printer", async () => {
    const app = admin();
    const bench = await pairDevice(app, "Bench PC", ["print"]);
    const order = await readyOrder(app, bench, false);
    expect((await request(app, "POST", `/api/xpot/admin/print-jobs/${order.id}/send`)).body.code).toBe("print_send_no_gcode");

    expect((await request(app, "GET", "/api/xpot/admin/print-printers")).body).toEqual([
      expect.objectContaining({ deviceName: "Bench PC", status: null, stale: true }),
    ]);
    const status = { name: "Jujubinha", model: "N2S", state: "RUNNING", percent: 42, remainingMinutes: 161, subtask: "TPLATE-2026-001" };
    expect((await request(app, "POST", "/api/provisioner/printer-status", status, bench)).status).toBe(200);
    expect((await request(app, "POST", "/api/provisioner/printer-status", { ...status, state: "BOILING" }, bench)).status).toBe(400);
    const printers = (await request(app, "GET", "/api/xpot/admin/print-printers")).body;
    expect(printers[0]).toMatchObject({ status, stale: false });
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
    const order = (await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "stand-large-google-white" })).body;
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
    expect(noFile.body.status).toBe("requested");
    await request(app, "POST", `/api/xpot/admin/print-jobs/${noFile.body.id}/transition`, { action: "cancel" });

    const forged = await request(app, "POST", "/api/xpot/admin/print-models/base-large/versions", {
      beds: [{ label: "x6", copies: 6, fileRef: "r2:photos/1/secret.jpg" }], changelog: "forged",
    });
    expect(forged.body.code).toBe("print_bed_file_invalid");

    const upload = await request(app, "POST", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file?filename=6-BASES-LARGE.gcode.3mf`, bytes("bases"));
    expect(upload.status).toBe(201);
    expect(upload.body.beds[0]).toMatchObject({ fileName: "6-BASES-LARGE.gcode.3mf", fileBytes: 5 });
    expect((await request(app, "GET", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file`)).status).toBe(302);

    const order = await request(app, "POST", "/api/xpot/admin/print-jobs", { model: "base-large", plates: 2 });
    expect(order.body).toMatchObject({ status: "ready", quantity: 12, batchId: null });
    expect(order.body.files).toEqual([expect.objectContaining({ kind: "gcode_3mf", filename: "6-BASES-LARGE.gcode.3mf" })]);

    const locked = await request(app, "POST", `/api/xpot/admin/print-models/base-large/versions/${versionId}/beds/${label}/file?filename=new.3mf`, bytes("x"));
    expect(locked.status).toBe(409);

    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.body.id}/transition`, { action: "start" });
    await request(app, "POST", `/api/xpot/admin/print-jobs/${order.body.id}/transition`, { action: "printed" });
    let detail = (await request(app, "GET", "/api/xpot/admin/print-models/base-large")).body;
    expect(detail.onHand).toBe(12);

    const used = await request(app, "POST", "/api/xpot/admin/print-models/base-large/part-count", { delta: -2, reason: "used", note: "Two bases for samples" });
    expect(used.body.onHand).toBe(10);
    detail = used.body;
    expect(detail.partMovements.map((m: any) => [m.delta, m.reason])).toEqual([[-2, "used"], [12, "printed"]]);
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
