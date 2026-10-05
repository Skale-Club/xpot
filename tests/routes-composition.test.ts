// The Xpot API is many routers mounted on the same /api/xpot prefix, in order.
// A guard a router installs with a bare `router.use(...)` therefore runs for every
// request that reaches that router, including the ones meant for routers mounted
// after it. That is how a manager-only guard on the admin router once returned
// 403 to plain reps on Sales, Consignments, Products and Visit actions: each
// router passed its own tests, mounted alone. This file mounts the real
// composition (registerXpotRoutes) and checks who reaches what.

import "express-async-errors";
import express from "express";
import { describe, expect, it, vi } from "vitest";

const REPS = new Map<string, any>([
  ["rep", { id: 1, userId: "rep", displayName: "Rep", role: "rep", isActive: true, modules: ["visits", "tags"] }],
  ["tags-only", { id: 2, userId: "tags-only", displayName: "Reseller", role: "rep", isActive: true, modules: ["tags"] }],
  ["manager", { id: 3, userId: "manager", displayName: "Manager", role: "manager", isActive: true, modules: ["visits"] }],
  // A platform admin (session isAdmin) whose rep row only lists Tags: admins get every module anyway.
  ["platform-admin", { id: 4, userId: "platform-admin", displayName: "Admin", role: "rep", isActive: true, modules: ["tags"] }],
]);

/** Any storage call answers "nothing": these tests are about the guards, not the handlers. */
const anything = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => [])),
  });

const storage = anything();
(storage as any).getSalesRepByUserId = vi.fn(async (userId: string) => REPS.get(userId));
// Lead 5 belongs to the Tags-only reseller (rep 2).
(storage as any).getSalesLead = vi.fn(async (id: number) => (id === 5 ? { id: 5, name: "Shop", ownerRepId: 2, status: "prospect" } : undefined));
vi.mock("../server/storage.js", () => ({ storage }));
vi.mock("../server/storage-sales.js", () => ({ salesStorage: anything() }));
vi.mock("../server/db.js", () => ({ db: anything() }));

const { registerXpotRoutes } = await import("../server/routes/xpot/index.js");
const { apiErrorHandler } = await import("../server/errorHandler.js");

function appFor(userId: string | null) {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.use((req, _res, next) => {
    (req as any).session = userId ? { userId, email: `${userId}@x.test`, isAdmin: userId === "platform-admin" } : {};
    next();
  });
  registerXpotRoutes(app);
  // The real global handler (server/app.ts mounts the same one).
  app.use(apiErrorHandler);
  return app;
}

async function get(app: express.Express, path: string, init?: { method: string; body: string }): Promise<{ status: number; message?: string; code?: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, init ? { ...init, headers: { "content-type": "application/json" } } : undefined);
        const text = await res.text();
        let message: string | undefined;
        let code: string | undefined;
        try {
          ({ message, code } = JSON.parse(text));
        } catch {
          message = undefined;
        }
        resolve({ status: res.status, message, code });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

const REP_PATHS = ["/api/xpot/products", "/api/xpot/sales", "/api/xpot/consignments", "/api/xpot/xphere/config", "/api/xpot/visits/1/actions"];

describe("the composed /api/xpot routers", () => {
  it("a plain rep reaches the Sales, Consignments, Products, Xphere and Visit-action APIs", async () => {
    const app = appFor("rep");
    for (const path of REP_PATHS) {
      const res = await get(app, path);
      expect(res.message, path).not.toBe("Manager access required");
      // The visit-actions route answers 403 "Access denied" for a visit that is not the rep's own (the
      // empty storage owns nothing): that is ownership working, not the manager guard.
      if (!path.includes("/actions")) expect([401, 403], `${path} answered ${res.status} ${res.message}`).not.toContain(res.status);
    }
  });

  it("the admin paths stay manager-only", async () => {
    for (const path of ["/api/xpot/admin/overview"]) {
      expect((await get(appFor("rep"), path)).status, path).toBe(403);
      expect((await get(appFor("manager"), path)).status, path).not.toBe(403);
    }
  });

  it("integrations, branding and Xphere are the global admin's alone", async () => {
    for (const path of ["/api/xpot/admin/integrations", "/api/xpot/admin/branding", "/api/xpot/admin/xphere"]) {
      expect((await get(appFor("rep"), path)).status, path).toBe(403);
      const manager = await get(appFor("manager"), path);
      expect([manager.status, manager.code], path).toEqual([403, "super_admin_only"]);
      expect((await get(appFor("platform-admin"), path)).status, path).not.toBe(403);
    }
  });

  it("a Tags-only reseller is refused the Visits-only APIs, by the module gate", async () => {
    // module_off, not just 403: a misplaced manager guard also answers 403, and that is the bug #32 fixed.
    for (const path of ["/api/xpot/sales", "/api/xpot/visits", "/api/xpot/dashboard", "/api/xpot/consignments", "/api/xpot/products"]) {
      const res = await get(appFor("tags-only"), path);
      expect([res.status, res.code], path).toEqual([403, "module_off"]);
    }
  });

  it("a platform admin gets Visits even when the rep row lists only Tags", async () => {
    const res = await get(appFor("platform-admin"), "/api/xpot/sales");
    expect(res.code).not.toBe("module_off");
    expect([401, 403]).not.toContain(res.status);
  });

  it("a Tags-only reseller may edit a customer but not move it through the funnel", async () => {
    const app = appFor("tags-only");
    const promote = await get(app, "/api/xpot/leads/5", { method: "PATCH", body: JSON.stringify({ status: "lead" }) });
    expect([promote.status, promote.code]).toEqual([403, "module_off"]);
    const rename = await get(app, "/api/xpot/leads/5", { method: "PATCH", body: JSON.stringify({ name: "Shop & Co" }) });
    expect(rename.status).toBe(200);
  });

  it("a body over the JSON limit answers 413, not a 500", async () => {
    const res = await get(appFor("rep"), "/api/xpot/leads", { method: "POST", body: JSON.stringify({ name: "x".repeat(4096) }) });
    expect(res.status).toBe(413);
  });

  it("an anonymous caller gets 401, not a manager refusal", async () => {
    expect((await get(appFor(null), "/api/xpot/sales")).status).toBe(401);
  });
});
