import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
  },
});
