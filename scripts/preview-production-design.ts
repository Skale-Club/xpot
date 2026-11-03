// Isolated Vite preview. It never reads .env, connects to a database or creates real serials.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { execFileSync } from "node:child_process";

async function main() {
  execFileSync("python", ["print-pipeline/catalog/design_catalog.py", "--fixture", ".cache/production-design-models.json"], { stdio: "inherit" });
  const source = JSON.parse(readFileSync(resolve(".cache/production-design-models.json"), "utf8"));
  const server = await createServer({ server: { host: "127.0.0.1", port: 2112, strictPort: true }, plugins: [{ name: "production-preview-fixtures", configureServer(vite) {
  vite.middlewares.use((req, res, next) => {
    const url = req.url?.split("?")[0];
    let body: unknown;
    if (url === "/api/xpot/admin/print-models") body = source;
    else if (url === "/api/xpot/print-previews") body = { models: [], batches: [] };
    else if (url === "/api/xpot/me") body = { user: { isAdmin: true }, organizations: [{ id: 1, name: "Skale Club", slug: "xpot-company", isActive: true, printsOwnPieces: true }] };
    else if (url === "/api/xpot/admin/print-generate") {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const choice = JSON.parse(raw);
        console.log("PREVIEW ONLY choice", JSON.stringify(choice));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id: "preview", quantity: choice.quantity, plates: [], preview: true }));
      });
      return;
    } else if (url?.startsWith("/api/")) { res.statusCode = 404; res.end(); return; }
    else { next(); return; }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body));
  });
  } }] });
  await server.listen();
  console.log("Isolated preview: http://127.0.0.1:2112/dev/production-design.html");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
