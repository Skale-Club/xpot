import type { Express } from "express";
import { registerXpotRoutes } from "./routes/xpot/index.js";
import { pool } from "./db.js";

export async function registerRoutes(app: Express) {
  // Mount the Xpot API (everything under /api/xpot/*)
  registerXpotRoutes(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Keep-alive: opens a real DB connection so the free-tier Supabase project
  // doesn't pause after ~7 days of inactivity. Driven by a daily Vercel Cron
  // (see vercel.json "crons"), which needs no external credential — the
  // function already holds POSTGRES_URL in its environment.
  app.get("/api/keepalive", async (_req, res) => {
    try {
      const { rows } = await pool.query("select 1 as keep_alive, now() as ts");
      res.json({ ok: true, ...rows[0] });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });
}
