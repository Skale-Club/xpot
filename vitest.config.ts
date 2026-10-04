import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // The first test of a file that boots the server routes pays for a cold
    // import of the whole graph; under a parallel run that can pass 5s.
    testTimeout: 20_000,
  },
});
