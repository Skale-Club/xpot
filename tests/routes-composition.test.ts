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
]);

/** Any storage call answers "nothing": these tests are about the guards, not the handlers. */
const anything = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (target[key] ??= vi.fn(async () => [])),
  });

const storage = anything();
(storage as any).getSalesRepByUserId = vi.fn(async (userId: string) => REPS.get(userId));
vi.mock("../server/storage.js", () => ({ storage }));
vi.mock("../server/storage-sales.js", () => ({ salesStorage: anything() }));
vi.mock("../server/db.js", () => ({ db: anything() }));

const { registerXpotRoutes } = await import("../server/routes/xpot/index.js");

function appFor(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = userId ? { userId, email: `${userId}@x.test`, isAdmin: false } : {};
    next();
  });
  registerXpotRoutes(app);
  // Whatever the handler does with the empty storage, a guard refusal is what we look for.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: err.message });
  });
  return app;
}

async function get(app: express.Express, path: string): Promise<{ status: number; message?: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address() as { port: number };
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        const text = await res.text();
        let message: string | undefined;
        try {
          message = JSON.parse(text).message;
        } catch {
          message = undefined;
        }
        resolve({ status: res.status, message });
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
    for (const path of ["/api/xpot/admin/overview", "/api/xpot/admin/integrations", "/api/xpot/admin/branding"]) {
      expect((await get(appFor("rep"), path)).status, path).toBe(403);
      expect((await get(appFor("manager"), path)).status, path).not.toBe(403);
    }
  });

  it("a Tags-only reseller is refused the Visits-only APIs", async () => {
    const res = await get(appFor("tags-only"), "/api/xpot/sales");
    expect(res.status).toBe(403);
  });

  it("an anonymous caller gets 401, not a manager refusal", async () => {
    expect((await get(appFor(null), "/api/xpot/sales")).status).toBe(401);
  });
});
