import "dotenv/config";
import express from "express";
import path from "path";
import { createApp, log } from "./app.js";

const PORT = Number(process.env.PORT) || 2000;

(async () => {
  const { app, httpServer } = await createApp();

  // In production, serve the built client.
  // In dev, run Vite separately (the Vite dev server listens on port 2000 from vite.config.ts
  // — adjust if you want to proxy /api to Express).
  if (process.env.NODE_ENV === "production") {
    // dist/index.cjs lives next to dist/public — resolve relative to cwd to keep
    // the path stable whether esbuild emits CJS or ESM.
    const clientDist = path.resolve(process.cwd(), "dist", "public");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  httpServer.listen(PORT, () => {
    log(`Xpot server listening on http://localhost:${PORT}`);
  });
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
