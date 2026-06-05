// Dev-only: run Vite in middleware mode inside Express so the client (with HMR)
// and the API are served from a single port. server/index.ts imports this
// dynamically in development only, so `vite` (a devDependency) never ends up in
// the production server bundle built by esbuild.
import fs from "fs/promises";
import path from "path";
import type { Express } from "express";
import type { Server } from "http";
import { createServer as createViteServer } from "vite";

export async function setupVite(app: Express, httpServer: Server): Promise<void> {
  const vite = await createViteServer({
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    appType: "custom",
    server: {
      middlewareMode: true,
      // Share the Express HTTP server for the HMR websocket so it works over a
      // single port (and through dev proxies).
      hmr: { server: httpServer },
      allowedHosts: true,
    },
  });

  // Vite's own asset + HMR middlewares (/@vite/client, /src/*, /@fs/*, ...).
  app.use(vite.middlewares);

  // SPA fallback: serve the transformed index.html for any route that isn't an
  // /api/* endpoint or a Vite asset. Registered after registerRoutes(), so the
  // API always wins.
  app.use(async (req, res, next) => {
    try {
      const templatePath = path.resolve(process.cwd(), "client", "index.html");
      const template = await fs.readFile(templatePath, "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}
