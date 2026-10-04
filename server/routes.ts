import type { Express } from "express";
import { registerXpotRoutes } from "./routes/xpot/index.js";

export async function registerRoutes(app: Express) {
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
