// Vercel build script — client only.
//
// On Vercel, the Express server is bundled by Vercel's own build pipeline when
// it processes api/index.ts (it picks up server/, shared/, etc. via the
// `includeFiles` config in vercel.json). We only need to produce the static
// client into dist/public for Vercel to serve.

import { spawnSync } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("→ Building client (vite) for Vercel ...");
const result = spawnSync("npx", ["vite", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\n✓ Client build complete: dist/public/");
