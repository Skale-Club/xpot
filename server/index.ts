import "dotenv/config";
import express from "express";
import path from "path";
import { createApp, log } from "./app.js";
import { pool } from "./db.js";
import { ensureUploadBucket } from "./lib/supabase.js";

const PORT = Number(process.env.PORT) || 2110;

(async () => {
  // Ensure Supabase Storage bucket exists before accepting requests.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await ensureUploadBucket();
  }

  const { app, httpServer } = await createApp();

  // One port for everything (client + API).
  // - dev: Vite runs in middleware mode inside Express (server/vite.ts) and
  //   serves the client with HMR while Express owns /api/*.
  // - production: serve the static client built into dist/public.
  if (process.env.NODE_ENV === "production") {
    // dist/index.cjs lives next to dist/public — resolve relative to cwd to keep
    // the path stable whether esbuild emits CJS or ESM.
    const clientDist = path.resolve(process.cwd(), "dist", "public");
    app.use(express.static(clientDist));
    // A typo'd or removed API path must fail as an API, not answer 200 with the app's HTML.
    app.all("/api/*", (_req, res) => {
      res.status(404).json({ message: "Not found" });
    });
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    // Dynamic import so Vite (a devDependency) is never pulled into the
    // production server bundle built by esbuild.
    const { setupVite } = await import("./vite.js");
    await setupVite(app, httpServer);
  }

  httpServer.listen(PORT, () => {
    log(`Xpot server listening on http://localhost:${PORT}`);
  });

  // Coolify sends SIGTERM on every redeploy. Stop accepting connections, let
  // in-flight requests finish, drain the pool, then exit.
  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down`);
    httpServer.close(() => {
      pool.end().catch(() => undefined).finally(() => process.exit(0));
    });
    // Keep-alive sockets would otherwise hold close() open until they time out.
    httpServer.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
