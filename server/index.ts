import "dotenv/config";
import express from "express";
import path from "path";
import { createApp, log } from "./app.js";

const PORT = Number(process.env.PORT) || 2110;

(async () => {
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
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
