// The contract of docs/PROFILES_EXECUTION_PLAN.md section 4, checked on the real server: every management route it
// registers is walked, classified by who may use it, and tried as each of the four profiles. Whoever may not use it
// gets 401 or 403. A new route nobody classified fails here, so it can't be forgotten.
//
// Requests that should be refused stop at the guard, so nothing runs. Of the allowed ones only GETs are sent: a
// platform route may call an external service (integration tests, Xphere).
//
// Skipped unless TAGS_INTEGRATION=1 and DATABASE_URL points at a disposable, migrated database. It replaces the pm-*
// users and their organizations.
import { test } from "vitest";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "net";
import { can, type Capability, type Profile } from "../shared/profiles";

const enabled = process.env.TAGS_INTEGRATION === "1";

type RouteEntry = { method: string; path: string };

/** Every route of an Express app, sub-routers included. They all mount under /api/xpot, or say so in their own paths. */
function routesOf(app: express.Express): RouteEntry[] {
  const out: RouteEntry[] = [];
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const path of paths) {
          if (typeof path !== "string") continue;
          for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: `${prefix}${path}` });
        }
      } else if (layer.handle?.stack) {
        const source = String(layer.regexp?.source ?? "");
        const mounted = /\\\/api\\\/xpot/.test(source) ? "/api/xpot" : /\\\/api\\\/([a-z-]+)/.exec(source)?.[0].replace(/\\/g, "") ?? "";
        walk(layer.handle.stack, `${prefix}${mounted}`);
      }
    }
  };
  walk((app as any)._router?.stack ?? (app as any).router?.stack ?? [], "");
  return out;
}

/** Who may use a management route: a capability of shared/profiles.ts, first match wins. Order matters. */
const CLASSES: ReadonlyArray<[RegExp, Capability]> = [
  // Separating a Stuscle order comes out of the company's stock.
  [/^\/api\/xpot\/admin\/tag-acquisitions\/[^/]+\/fulfill$/, "fulfillStuscleOrders"],
  // Tags management an organization's owner shares, scoped to their organization (tests/tags/ownerScope).
  [/^\/api\/xpot\/admin\/tags\/(overview|analytics|report)$/, "manageStock"],
  [/^\/api\/xpot\/admin\/tags\/:id(\/(internal-use|return-to-stock|damage|assign|unassign|retire|restore|rep|analytics|qr\.svg|qr\.png))?$/, "manageStock"],
  [/^\/api\/xpot\/admin\/tag-(kits|acquisitions|batch-options|people)(\/|$)/, "manageStock"],
  // Production: the platform, and a partner for their own organization.
  [/^\/api\/xpot\/admin\/tag-batches$/, "produce"],
  [/^\/api\/xpot\/admin\/tag-batches\/:[^/]+(\/.*)?$/, "produce"],
  [/^\/api\/xpot\/admin\/tag-provisioners(\/:id\/revoke)?$/, "produce"],
  [/^\/api\/xpot\/admin\/print-(jobs|requests|plates|files|now|parts|bench)(\/|$)/, "produce"],
  [/^\/api\/xpot\/admin\/print-(preview|generate)/, "produce"],
  // Everything else under /admin is the platform's: people, the catalog, integrations, branding, the Journey, MCP.
  [/^\/api\/xpot\/admin(\/|$)/, "managePlatform"],
];

/** Routes a partner uses but the capability's general rule would refuse or allow differently, with the reason. */
const EXCEPTIONS: ReadonlyArray<[RegExp, Profile[]]> = [
  // Making batches by hand, and editing them, stay the platform's: a partner's batches come out of print orders.
  [/^\/api\/xpot\/admin\/tag-batches(\/:id)?(\/(close|reopen))?$/, ["platform"]],
];

/** The catalog a partner orders from: they read it and never change it (D2). */
const PARTNER_READS = [/\/print-models$/, /\/print-models\/:ref$/, /\/print-models\/:ref\/versions\/:versionId\/preview$/];

function allowedProfiles(route: RouteEntry): Profile[] | null {
  for (const [pattern, profiles] of EXCEPTIONS) {
    if (pattern.test(route.path) && route.method !== "GET") return profiles;
  }
  if (route.method === "GET" && PARTNER_READS.some((pattern) => pattern.test(route.path))) return ["platform", "partner"];
  for (const [pattern, capability] of CLASSES) {
    if (pattern.test(route.path)) return (["platform", "partner", "owner", "member"] as Profile[]).filter((profile) => can(profile, capability));
  }
  return null;
}

test.skipIf(!enabled)("every management route refuses the profiles the contract leaves out", async () => {
  const { registerRoutes } = await import("../server/routes.js");
  const { db, pool } = await import("../server/db.js");
  const { sql } = await import("drizzle-orm");
  const one = async <T = any>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as T;

  const clean = async () => {
    await db.execute(sql`DELETE FROM organization_memberships WHERE rep_id IN (SELECT id FROM sales_reps WHERE user_id LIKE 'pm-%')`);
    await db.execute(sql`DELETE FROM organizations WHERE slug LIKE 'pm-test-%'`);
    await db.execute(sql`DELETE FROM sales_reps WHERE user_id LIKE 'pm-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'pm-%'`);
  };
  await clean();

  await db.execute(sql`INSERT INTO users (id, email, first_name, is_admin) VALUES
    ('pm-platform', 'platform@pm.test', 'Platform', true), ('pm-partner', 'partner@pm.test', 'Partner', false),
    ('pm-owner', 'owner@pm.test', 'Owner', false), ('pm-member', 'member@pm.test', 'Member', false)`);
  const reps = await db.execute(sql`INSERT INTO sales_reps (user_id, display_name, email, role, is_active) VALUES
    ('pm-platform', 'PM Platform', 'platform@pm.test', 'admin', true), ('pm-partner', 'PM Partner', 'partner@pm.test', 'rep', true),
    ('pm-owner', 'PM Owner', 'owner@pm.test', 'rep', true), ('pm-member', 'PM Member', 'member@pm.test', 'rep', true)
    RETURNING id, user_id`);
  const repId = Object.fromEntries((reps.rows as Array<{ id: number; user_id: string }>).map((r) => [r.user_id, r.id]));
  const printing = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug, prints_own_pieces) VALUES ('PM Partner', 'pm-test-partner', true) RETURNING id`);
  const selling = await one<{ id: number }>(sql`INSERT INTO organizations (name, slug) VALUES ('PM Seller', 'pm-test-seller') RETURNING id`);
  await db.execute(sql`INSERT INTO organization_memberships (organization_id, rep_id, role) VALUES
    (${printing.id}, ${repId["pm-partner"]}, 'admin'),
    (${selling.id}, ${repId["pm-owner"]}, 'admin'), (${selling.id}, ${repId["pm-member"]}, 'member')`);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    (req as any).session = userId ? { userId, isAdmin: userId === "pm-platform", email: `${userId}@pm.test`, save: (cb: () => void) => cb?.() } : {};
    next();
  });
  await registerRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const ID = "00000000-0000-4000-8000-000000000001";

  try {
    const routes = routesOf(app).filter((route) => route.path.startsWith("/api/xpot/admin"));
    assert.ok(routes.length > 80, `found only ${routes.length} management routes: the walker broke`);

    const unclassified = routes.filter((route) => allowedProfiles(route) === null).map((route) => `${route.method} ${route.path}`);
    assert.deepEqual(unclassified, [], "classify these routes in tests/profiles-matrix");

    const wrong: string[] = [];
    for (const route of routes) {
      const allowed = allowedProfiles(route)!;
      const url = `${base}${route.path.replace(/\*.*$/, "x").replace(/:[A-Za-z]+\??/g, ID)}`;
      for (const profile of ["platform", "partner", "owner", "member"] as Profile[]) {
        const permitted = allowed.includes(profile);
        if (permitted && route.method !== "GET") continue;
        const res = await fetch(url, {
          method: route.method,
          headers: { "content-type": "application/json", "x-test-user": `pm-${profile}`, "x-xpot-view": "manage" },
          body: route.method === "GET" ? undefined : "{}",
        });
        const refused = res.status === 401 || res.status === 403;
        if (permitted === refused) wrong.push(`${route.method} ${route.path} as ${profile}: ${res.status}, expected ${permitted ? "allowed" : "refused"}`);
      }
    }
    assert.deepEqual(wrong, []);
  } finally {
    await clean();
    server.close();
    await pool.end();
  }
}, 180_000);
