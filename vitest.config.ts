import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The client's aliases (vite.config.ts), so tests can load client modules as they are.
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // The first test of a file that boots the server routes pays for a cold
    // import of the whole graph; under a parallel run that can pass 5s.
    testTimeout: 20_000,
  },
});
