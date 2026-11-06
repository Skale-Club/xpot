// Production build: bundle the server with esbuild, then build the client with Vite.
//
// Output layout:
//   dist/
//     index.cjs        — server entry point
//     migrate.cjs      — migration runner (the Docker image runs it before the server)
//     migrate-files.cjs — one-time move of photos/voice notes to private storage,
//                        run by hand in the container (README → Files)
//     shrink-photos.cjs — shrinks the lead photos already stored, same way
//     public/          — Vite-built static client (served by server in production)

import { build as esbuild } from "esbuild";
import { spawnSync } from "child_process";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

async function buildMigrate() {
  console.log("→ Building migration runner (esbuild) ...");
  await esbuild({
    entryPoints: [resolve(ROOT, "scripts/migrate.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: resolve(ROOT, "dist/migrate.cjs"),
    packages: "external",
    logLevel: "info",
  });
}

async function buildFilesMigrate() {
  console.log("→ Building private-files migration (esbuild) ...");
  await esbuild({
    entryPoints: [resolve(ROOT, "scripts/migrate-private-files.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: resolve(ROOT, "dist/migrate-files.cjs"),
    packages: "external",
    logLevel: "info",
  });

  console.log("→ Building lead photo shrinker (esbuild) ...");
  await esbuild({
    entryPoints: [resolve(ROOT, "scripts/shrink-lead-photos.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: resolve(ROOT, "dist/shrink-photos.cjs"),
    packages: "external",
    logLevel: "info",
  });
}

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

/**
 * What Xpot Desktop needs from the server: the program is public (dist/public/desktop; its installer, XpotDesktopSetup.exe,
 * comes from client/public/desktop with the client), the print code goes only to a connected computer (dist/bench,
 * GET /api/provisioner/bench-bundle).
 */
function buildBench() {
  console.log("→ Packing the print code ...");
  mkdirSync(resolve(ROOT, "dist/bench"), { recursive: true });
  const result = spawnSync("tar", ["-czf", "dist/bench/print-pipeline.tgz", "--exclude=__pycache__", "--exclude=tests", "-C", "print-pipeline", "."], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  mkdirSync(resolve(ROOT, "dist/public/desktop"), { recursive: true });
  copyFileSync(resolve(ROOT, "print-pipeline/desktop.py"), resolve(ROOT, "dist/public/desktop/desktop.py"));
}

async function main() {
  await buildServer();
  await buildMigrate();
  await buildFilesMigrate();
  buildClient();
  buildBench();
  console.log("\n✓ Build complete: dist/index.cjs + dist/migrate.cjs + dist/migrate-files.cjs + dist/shrink-photos.cjs + dist/public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
