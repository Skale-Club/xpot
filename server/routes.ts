import type { Express } from "express";
import { registerXpotRoutes } from "./routes/xpot/index.js";

export async function registerRoutes(app: Express) {
  // Mount the Xpot API (everything under /api/xpot/*)
  registerXpotRoutes(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });
}
