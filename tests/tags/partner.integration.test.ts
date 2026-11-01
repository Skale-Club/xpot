import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../helpers/memoryStore.js";

// A partner prints only our models (docs/PROFILES_EXECUTION_PLAN.md, D2): the organization lists which models are
// released to it (organizations.released_print_models), each model says what it needs (print_models.materials), and
// the platform makes a whole partner in one step. End to end through the HTTP routes on an in-process Postgres
// (PGlite) with every migration applied, in the style of production.integration.test.ts.

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
const { createOrganizationsRouter } = await import("../../server/routes/xpot/organizations.js");
const { setFileStoresForTests } = await import("../../server/lib/files.js");

const q = async (text: string, params: unknown[] = []) => (await pg.client.query(text, params)).rows as any[];

function appFor(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = userId ? { userId, email: `${userId}@partner.test`, isAdmin: userId === "platform-admin" } : {};
    next();
  });
  registerTagRoutes(app);
  app.use("/api/xpot", createOrganizationsRouter());
  return app;
}

type Reply = { status: number; body: any };

async function request(app: express.Express, method: string, path: string, body?: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        resolve({ status: response.status, body: parsed });
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

const platform = () => appFor("platform-admin");
const owner = () => appFor("alfa-owner");

const PLATE = "plate-large-menu-white";
const STAND = "stand-large-google-white";
const bed = { label: "x4", copies: 4, positions: ["front-left", "front-right", "back-left", "back-right"] };

async function salesProductId() {
  return (await q("SELECT id FROM sales_products WHERE sku = 'partner-plate'"))[0].id as number;
}

/** Two models of ours: a plate and a stand. */
async function catalog() {
  const created = async (body: Record<string, unknown>) => expect((await request(platform(), "POST", "/api/xpot/admin/print-models", body)).status).toBe(201);
  await created({
    slug: PLATE, kind: "serialized", title: "Plate Large · Menu · White", productType: "large_plate", face: "menu", theme: "white",
    salesProductId: await salesProductId(), batchPrefix: "TPLATE", version: { builder: "plate.menu", params: { size: "large", theme: "white" }, beds: [bed] },
  });
  await created({
    slug: STAND, kind: "serialized", title: "Stand Large · Google · White", productType: "large_stand", face: "google_review", theme: "white",
    salesProductId: await salesProductId(), batchPrefix: "TSTAND", version: { builder: "stand.google", params: { size: "large", theme: "white" }, beds: [bed] },
  });
}

async function organizationId(slug: string) {
  return (await q("SELECT id FROM organizations WHERE slug = $1", [slug]))[0].id as number;
}

/** A partner organization that prints its own pieces, owned by `alfa-owner`, with `released` models (null: every one). */
async function partner(released: string[] | null) {
  const [org] = await q(
    "INSERT INTO organizations (name, slug, prints_own_pieces, released_print_models) VALUES ('Studio Alfa', 'studio-alfa', true, $1) RETURNING id",
    [released],
  );
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('alfa-owner', 'alfa-owner@partner.test', 'Alfa', false)");
  const [rep] = await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('alfa-owner', 'Alfa', 'alfa-owner@partner.test', 'rep', true) RETURNING id");
  await q("INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES ($1, $2, 'admin')", [org.id, rep.id]);
  return org.id as number;
}

const release = (organization: number, models: string[] | null) =>
  request(platform(), "PATCH", `/api/xpot/organizations/${organization}`, { releasedPrintModels: models });

beforeAll(() => {
  expect(pg.client).toBeTruthy();
});

afterAll(() => setFileStoresForTests(null));

beforeEach(async () => {
  setFileStoresForTests({ r2: memoryStore("r2"), supabase: null, public: null });
  await q(`TRUNCATE print_part_movements, print_job_files, print_jobs, print_requests, print_model_versions, print_models,
    tag_journey_entries, tag_provisioning_devices, tags, tag_batches, sales_products, sales_reps, users, organizations RESTART IDENTITY CASCADE`);
  await q("INSERT INTO users (id, email, first_name, is_admin) VALUES ('platform-admin', 'platform-admin@partner.test', 'Admin', true)");
  await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES ('platform-admin', 'Admin', 'platform-admin@partner.test', 'admin', true)");
  await q("INSERT INTO sales_products (sku, name, kind, base_price_cents, is_active) VALUES ('partner-plate', 'Plate', 'physical', 3500, true)");
  await q("INSERT INTO organizations (name, slug) VALUES ('Xpot', 'xpot-company') ON CONFLICT (slug) DO NOTHING");
});

describe("models released to a partner", () => {
  it("refuses to request, generate or print again a model that is not released, and allows a released one", async () => {
    await catalog();
    const org = await partner([PLATE]);

    const plate = await request(owner(), "POST", "/api/xpot/admin/print-jobs", { model: PLATE });
    expect(plate.status).toBe(201);
    expect(await q("SELECT organization_id FROM print_requests")).toEqual([{ organization_id: org }]);

    const stand = await request(owner(), "POST", "/api/xpot/admin/print-jobs", { model: STAND });
    expect(stand.status).toBe(403);
    expect(stand.body).toMatchObject({ code: "print_model_not_released", params: { model: "Stand Large · Google · White" } });
    const generated = await request(owner(), "POST", "/api/xpot/admin/print-generate", { productType: "large_stand", theme: "white", face: "google_review", quantity: 4 });
    expect(generated.status).toBe(403);
    expect(generated.body.code).toBe("print_model_not_released");
    expect((await request(owner(), "POST", "/api/xpot/admin/print-generate", { productType: "large_plate", theme: "white", face: "menu", quantity: 4 })).status).toBe(201);
    // The refused ones left nothing behind: no request, no plate, no piece.
    expect(await q("SELECT count(*)::int AS n FROM print_requests")).toEqual([{ n: 2 }]);
    expect((await q("SELECT count(DISTINCT model_id)::int AS n FROM print_jobs"))[0].n).toBe(1);

    // A plate cancelled and then printed again: refused once the model is taken back, allowed when it is released again.
    const plateId = plate.body.plates[0].id;
    expect((await request(owner(), "POST", `/api/xpot/admin/print-jobs/${plateId}/transition`, { action: "cancel" })).status).toBe(200);
    expect((await release(org, [])).status).toBe(200);
    const redo = await request(owner(), "POST", `/api/xpot/admin/print-jobs/${plateId}/redo`);
    expect(redo.status).toBe(403);
    expect(redo.body.code).toBe("print_model_not_released");
    expect((await release(org, [PLATE])).status).toBe(200);
    expect((await request(owner(), "POST", `/api/xpot/admin/print-jobs/${plateId}/redo`)).status).toBe(201);
  });

  it("offers a partner only the released models, and every model while none is restricted", async () => {
    await catalog();
    const org = await partner([PLATE]);
    const slugs = async (app: express.Express) => (await request(app, "GET", "/api/xpot/admin/print-models")).body.map((model: any) => model.slug).sort();

    expect(await slugs(owner())).toEqual([PLATE]);
    expect((await request(owner(), "GET", `/api/xpot/admin/print-models/${PLATE}`)).status).toBe(200);
    expect((await request(owner(), "GET", `/api/xpot/admin/print-models/${STAND}`)).status).toBe(404);
    // The platform always sees the whole catalog.
    expect(await slugs(platform())).toEqual([PLATE, STAND]);

    await release(org, []);
    expect(await slugs(owner())).toEqual([]);
    await release(org, null);
    expect(await slugs(owner())).toEqual([PLATE, STAND]);
    expect((await request(owner(), "POST", "/api/xpot/admin/print-jobs", { model: STAND })).status).toBe(201);
  });

  it("lets the platform print any model for a partner", async () => {
    await catalog();
    const org = await partner([]);
    const made = await request(platform(), "POST", "/api/xpot/admin/print-jobs", { model: STAND, organization: org });
    expect(made.status).toBe(201);
    expect(await q("SELECT organization_id FROM print_requests")).toEqual([{ organization_id: org }]);
  });

  it("releases nothing when printing is switched on: a partner only does what the platform lets it", async () => {
    await catalog();
    const [org] = await q("INSERT INTO organizations (name, slug) VALUES ('Studio Beta', 'studio-beta') RETURNING id");
    const on = await request(platform(), "PATCH", `/api/xpot/organizations/${org.id}`, { printsOwnPieces: true });
    expect(on.status).toBe(200);
    expect(on.body.releasedPrintModels).toEqual([]);
    // Picking models at the same time is the platform saying which, and an existing choice survives off and on.
    await request(platform(), "PATCH", `/api/xpot/organizations/${org.id}`, { releasedPrintModels: [PLATE] });
    await request(platform(), "PATCH", `/api/xpot/organizations/${org.id}`, { printsOwnPieces: false });
    const back = await request(platform(), "PATCH", `/api/xpot/organizations/${org.id}`, { printsOwnPieces: true });
    expect(back.body.releasedPrintModels).toEqual([PLATE]);
  });

  it("changes the released models only for the platform, only with models of the catalog, and never a part", async () => {
    await catalog();
    await request(platform(), "POST", "/api/xpot/admin/print-models", { slug: "base-large", kind: "part", title: "Stand base · Large", version: { beds: [{ label: "x4", copies: 4 }] } });
    const org = await partner([PLATE]);
    const path = `/api/xpot/organizations/${org}`;

    const own = await request(owner(), "PATCH", path, { releasedPrintModels: [PLATE, STAND] });
    expect(own.status).toBe(403);
    expect(own.body.code).toBe("manager_required");
    expect((await q("SELECT released_print_models FROM organizations WHERE id = $1", [org]))[0].released_print_models).toEqual([PLATE]);

    const unknown = await request(platform(), "PATCH", path, { releasedPrintModels: [PLATE, "not-a-model"] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("print_model_unknown");
    expect((await request(platform(), "PATCH", path, { releasedPrintModels: ["base-large"] })).status).toBe(400);

    const both = await request(platform(), "PATCH", path, { releasedPrintModels: [STAND, PLATE, STAND] });
    expect(both.status).toBe(200);
    expect(both.body.releasedPrintModels).toEqual([STAND, PLATE]);
    expect((await request(platform(), "GET", "/api/xpot/organizations")).body.find((o: any) => o.id === org).releasedPrintModels).toEqual([STAND, PLATE]);
    expect((await request(platform(), "PATCH", path, { releasedPrintModels: null })).body.releasedPrintModels).toBeNull();
  });
});

describe("what a model needs", () => {
  const materials = [
    { kind: "nfc_sticker", name: "NFC sticker", spec: "10 x 20 mm", supplier: "LeadSeals", url: "https://example.com/sticker", note: "NTAG213" },
    { kind: "filament", name: "PLA", spec: "White" },
  ];

  it("is written by the platform and read by a partner; a partner cannot create or edit models, versions or materials", async () => {
    await catalog();
    await partner(null);
    const path = `/api/xpot/admin/print-models/${PLATE}`;

    const saved = await request(platform(), "PATCH", path, { materials });
    expect(saved.status).toBe(200);
    expect(saved.body.materials).toEqual(materials);
    expect((await request(owner(), "GET", path)).body.materials).toEqual(materials);
    expect((await request(owner(), "GET", "/api/xpot/admin/print-models")).body.find((m: any) => m.slug === PLATE).materials).toEqual(materials);

    expect((await request(owner(), "PATCH", path, { materials: [] })).status).toBe(403);
    expect((await request(owner(), "PATCH", path, { title: "Mine" })).status).toBe(403);
    expect((await request(owner(), "POST", "/api/xpot/admin/print-models", { slug: "own-model", kind: "serialized", title: "Own" })).status).toBe(403);
    expect((await request(owner(), "POST", `${path}/versions`, { builder: "plate.menu", beds: [bed], changelog: "mine" })).status).toBe(403);
    expect((await request(owner(), "GET", path)).body.materials).toEqual(materials);
    expect(await q("SELECT slug FROM print_models ORDER BY slug")).toEqual([{ slug: PLATE }, { slug: STAND }]);

    // The whole list is replaced, and an empty one clears it.
    expect((await request(platform(), "PATCH", path, { materials: [] })).body.materials).toEqual([]);
  });

  it("refuses a material that is not valid: an unknown kind, no name, a link that is not a web address", async () => {
    await catalog();
    const path = `/api/xpot/admin/print-models/${PLATE}`;
    for (const bad of [
      { kind: "wood", name: "Oak" },
      { kind: "other", name: "  " },
      { kind: "other", name: "Glue", url: "javascript:alert(1)" },
      { kind: "other", name: "Glue", extra: true },
    ]) {
      expect((await request(platform(), "PATCH", path, { materials: [bad] })).status).toBe(400);
    }
    expect((await request(platform(), "GET", path)).body.materials).toEqual([]);
  });

  it("fills in the 10 x 20 sticker for a model that already uses its pocket, and invents nothing else", async () => {
    const productId = await salesProductId();
    const make = async (slug: string, params: Record<string, unknown>, consumes: unknown[] = []) => {
      const created = await request(platform(), "POST", "/api/xpot/admin/print-models", {
        slug, kind: "serialized", title: slug, productType: "large_plate", face: "menu", theme: "white",
        salesProductId: productId, batchPrefix: "TB", version: { builder: "plate.menu", params, beds: [bed], consumes },
      });
      expect(created.status).toBe(201);
    };
    await request(platform(), "POST", "/api/xpot/admin/print-models", { slug: "nfc-sticker-10x20", kind: "part", title: "NFC sticker", version: { beds: [{ label: "bought", copies: 1 }] } });
    await make("by-param", { nfc_mount: "sticker_10x20" });
    await make("by-rear-param", { nfc_mount: "rear_sticker_10x20_covered" });
    await make("by-consumes", {}, [{ part: "nfc-sticker-10x20", perPiece: 1 }]);
    await make("round-tag", { nfc_mount: "embedded_round" });
    await make("no-mount", {});
    await request(platform(), "PATCH", "/api/xpot/admin/print-models/no-mount", { materials: [{ kind: "other", name: "Written by hand" }] });

    await pg.client.exec(readFileSync(join(process.cwd(), "migrations", "0069_partner_materials.sql"), "utf8"));
    const byModel = Object.fromEntries((await q("SELECT slug, materials FROM print_models")).map((row) => [row.slug, row.materials]));
    const sticker = [{ kind: "nfc_sticker", name: "NFC sticker", spec: "10 x 20 mm" }];
    expect(byModel).toMatchObject({ "by-param": sticker, "by-rear-param": sticker, "by-consumes": sticker, "round-tag": [], "nfc-sticker-10x20": [] });
    expect(byModel["no-mount"]).toEqual([{ kind: "other", name: "Written by hand" }]);
  });
});

describe("a new partner in one step", () => {
  const input = { name: "Studio Beta", ownerName: "Bia Souza", phone: "+55 11 98765-4321", releasedPrintModels: [PLATE] };

  it("makes the account, the organization that prints its own pieces with the released models, and the owner's membership", async () => {
    await catalog();
    const made = await request(platform(), "POST", "/api/xpot/organizations/partners", input);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: "Studio Beta", printsOwnPieces: true, releasedPrintModels: [PLATE], isActive: true });

    const [account] = await q("SELECT u.id, u.phone, u.is_admin, r.id AS rep_id, r.display_name, r.is_active, r.role, r.modules FROM users u JOIN sales_reps r ON r.user_id = u.id WHERE u.phone = '+5511987654321'");
    expect(account).toMatchObject({ is_admin: false, display_name: "Bia Souza", is_active: true, role: "rep" });
    expect(account.modules).toContain("tags");
    expect(await q("SELECT role, is_active FROM organization_memberships WHERE organization_id = $1 AND rep_id = $2", [made.body.id, account.rep_id]))
      .toEqual([{ role: "admin", is_active: true }]);
    // No second, personal organization: the partner's one organization is the only one.
    expect(await q("SELECT count(*)::int AS n FROM organization_memberships WHERE rep_id = $1", [account.rep_id])).toEqual([{ n: 1 }]);
    expect((await q("SELECT action, detail FROM organization_audit_log WHERE organization_id = $1", [made.body.id]))[0].action).toBe("partner_created");

    // The owner can print right away, in their own organization, only the released model.
    const app = appFor(account.id);
    expect((await request(app, "GET", "/api/xpot/admin/print-models")).body.map((m: any) => m.slug)).toEqual([PLATE]);
    expect((await request(app, "POST", "/api/xpot/admin/print-jobs", { model: STAND })).body.code).toBe("print_model_not_released");
    expect((await request(app, "POST", "/api/xpot/admin/print-jobs", { model: PLATE })).status).toBe(201);
    expect(await q("SELECT organization_id FROM print_requests")).toEqual([{ organization_id: made.body.id }]);
  });

  it("uses the account that already signs in with that phone", async () => {
    await catalog();
    await q("INSERT INTO users (id, email, first_name, phone, is_admin) VALUES ('known', 'known@partner.test', 'Known', '+5511987654321', false)");
    await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active, modules) VALUES ('known', 'Known', 'known@partner.test', 'rep', true, '{visits}')");
    const made = await request(platform(), "POST", "/api/xpot/organizations/partners", input);
    expect(made.status).toBe(201);
    expect(await q("SELECT count(*)::int AS n FROM users WHERE phone = '+5511987654321'")).toEqual([{ n: 1 }]);
    const [rep] = await q("SELECT id, modules FROM sales_reps WHERE user_id = 'known'");
    expect(rep.modules).toEqual(["visits", "tags"]);
    expect(await q("SELECT rep_id, role FROM organization_memberships WHERE organization_id = $1", [made.body.id])).toEqual([{ rep_id: rep.id, role: "admin" }]);
  });

  it("is the platform's alone", async () => {
    await catalog();
    await partner(null);
    const before = await q("SELECT count(*)::int AS n FROM organizations");
    for (const outsider of ["alfa-owner", null]) {
      const refused = await request(appFor(outsider), "POST", "/api/xpot/organizations/partners", input);
      expect(refused.status).toBe(outsider ? 403 : 401);
    }
    expect(await q("SELECT count(*)::int AS n FROM organizations")).toEqual(before);
    expect(await q("SELECT id FROM users WHERE phone = '+5511987654321'")).toEqual([]);
  });

  it("refuses a bad request before writing anything", async () => {
    await catalog();
    const nothing = async () => {
      expect(await q("SELECT id FROM users WHERE phone IS NOT NULL")).toEqual([]);
      expect(await q("SELECT id FROM organizations WHERE slug <> 'xpot-company'")).toEqual([]);
    };
    const unknown = await request(platform(), "POST", "/api/xpot/organizations/partners", { ...input, releasedPrintModels: [PLATE, "not-a-model"] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("print_model_unknown");
    const badPhone = await request(platform(), "POST", "/api/xpot/organizations/partners", { ...input, phone: "abcdef" });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.code).toBe("phone_invalid");
    expect((await request(platform(), "POST", "/api/xpot/organizations/partners", { ...input, name: "" })).status).toBe(400);
    expect((await request(platform(), "POST", "/api/xpot/organizations/partners", { ...input, extra: 1 })).status).toBe(400);
    await nothing();

    await q("INSERT INTO users (id, email, first_name, phone, is_admin) VALUES ('blocked', 'blocked@partner.test', 'Blocked', '+5511987654321', false)");
    await q("INSERT INTO sales_reps (user_id, display_name, email, role, is_active, blocked_at) VALUES ('blocked', 'Blocked', 'blocked@partner.test', 'rep', false, now())");
    const blocked = await request(platform(), "POST", "/api/xpot/organizations/partners", input);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("partner_owner_inactive");
    expect(await q("SELECT id FROM organizations WHERE slug <> 'xpot-company'")).toEqual([]);
    expect(await organizationId("xpot-company")).toBeGreaterThan(0);
  });
});
