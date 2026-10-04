import type { Express } from "express";
import { registerXpotRoutes } from "./routes/xpot/index.js";
import { registerTagRoutes } from "./tags/routes.js";
import { registerWholesaleRoutes } from "./wholesale/index.js";

export async function registerRoutes(app: Express) {
  // Tags first: public /q and /n redirects, and /api/xpot/tags* / /api/xpot/admin/tag*
  // must be matched before the Xpot admin router, which guards every path it sees.
  registerTagRoutes(app);
  // Same reason: /api/xpot/wholesale and its admin route sit under those prefixes.
  registerWholesaleRoutes(app);

  // Mount the Xpot API (everything under /api/xpot/*)
  registerXpotRoutes(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Deployed commit (Coolify injects SOURCE_COMMIT); the deploy workflow checks it.
  app.get("/api/version", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ commit: process.env.SOURCE_COMMIT ?? null });
  });
}
