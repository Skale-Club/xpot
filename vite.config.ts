import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Readable browser stacks in Sentry; the maps are uploaded, never served.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: "skale-club",
            project: "xpot-frontend",
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: process.env.VITE_RELEASE || undefined },
            sourcemaps: { filesToDeleteAfterUpload: ["dist/public/assets/*.js.map"] },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Read by the server to preload the home page's lazy chunk (server/seo.ts).
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/") ||
            id.includes("/node_modules/wouter/")
          ) {
            return "vendor-react";
          }

          if (id.includes("/node_modules/@radix-ui/")) {
            return "vendor-ui";
          }

          if (id.includes("/node_modules/@tanstack/")) {
            return "vendor-query";
          }

          if (
            id.includes("/node_modules/zod/") ||
            id.includes("/node_modules/drizzle-zod/") ||
            id.includes("/node_modules/clsx/") ||
            id.includes("/node_modules/tailwind-merge/")
          ) {
            return "vendor-utils";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    // The client is served by Vite in middleware mode from inside the Express
    // server (see server/vite.ts), so everything runs on one port — there is no
    // standalone dev port or /api proxy to configure here.
    fs: { strict: true, deny: ["**/.*"] },
    // Nothing outside the project is watched, whatever asks for it: watching the whole disk stops the server.
    watch: {
      ignored: (file: string) => {
        const relative = path.relative(import.meta.dirname, file);
        return relative.startsWith("..") || path.isAbsolute(relative);
      },
    },
  },
});
