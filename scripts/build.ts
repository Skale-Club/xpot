// Production build: bundle the server with esbuild, then build the client with Vite.
//
// Output layout:
//   dist/
//     index.cjs        — server entry point
//     public/          — Vite-built static client (served by server in production)

import { build as esbuild } from "esbuild";
import { spawnSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

async function buildServer() {
  console.log("→ Building server (esbuild) ...");
  await esbuild({
    entryPoints: [resolve(ROOT, "server/index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: resolve(ROOT, "dist/index.cjs"),
    external: [
      // Native deps that must stay external in node
      "pg-native",
      // Dynamic deps loaded at runtime by tsx — let node resolve them
    ],
    packages: "external",
    sourcemap: true,
    logLevel: "info",
  });
}

function buildClient() {
  console.log("→ Building client (vite) ...");
  const result = spawnSync("npx", ["vite", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  await buildServer();
  buildClient();
  console.log("\n✓ Build complete: dist/index.cjs + dist/public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
