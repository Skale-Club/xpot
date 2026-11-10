import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";
import type { Express } from "express";

// Xpot Desktop's own files, public: the program it updates itself from and what version it is.
//   GET /desktop/version.json  { version, sha256, url }  Xpot Desktop compares the version with its own
//                              (print-pipeline/desktop.py, VERSION = 'desktop-N') and, when newer, downloads `url`,
//                              checks the hash and restarts into it.
//   GET /desktop/desktop.py    the program. In production scripts/build.ts copies it to dist/public/desktop; in
//                              development it comes straight from print-pipeline, so a local Xpot updates it too.
// The installer (XpotDesktopSetup.exe) is a static file of client/public/desktop.

const ROOT = process.cwd();
const BUILT = resolve(ROOT, "dist/public/desktop/desktop.py");
const SOURCE = resolve(ROOT, "print-pipeline/desktop.py");

function desktopFile(): string {
  return existsSync(BUILT) ? BUILT : SOURCE;
}

let cached: { path: string; mtime: number; info: { version: string; sha256: string; url: string } } | null = null;

/** The version and hash of the program this server hands out, read again only when the file changes. */
export function desktopVersion(path = desktopFile()) {
  const mtime = statSync(path).mtimeMs;
  if (cached && cached.path === path && cached.mtime === mtime) return cached.info;
  const content = readFileSync(path);
  const version = /^VERSION = '([^']+)'/m.exec(content.toString("utf-8"))?.[1];
  if (!version) throw new Error("desktop.py has no VERSION");
  const info = { version, sha256: createHash("sha256").update(content).digest("hex"), url: "/desktop/desktop.py" };
  cached = { path, mtime, info };
  return info;
}

/** Development: the print code a connected computer downloads, packed on first ask (the build packs it in production). */
export function ensureDevBenchBundle(): void {
  const bundle = resolve(ROOT, "dist/bench/print-pipeline.tgz");
  if (process.env.NODE_ENV !== "development" || existsSync(bundle)) return;
  mkdirSync(resolve(ROOT, "dist/bench"), { recursive: true });
  spawnSync("tar", ["-czf", "dist/bench/print-pipeline.tgz", "--exclude=__pycache__", "--exclude=tests", "-C", "print-pipeline", "."], { cwd: ROOT });
}

export function registerDesktopRoutes(app: Express) {
  app.get("/desktop/version.json", (_req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(desktopVersion());
    } catch {
      res.status(404).json({ message: "This server has no Xpot Desktop to offer" });
    }
  });

  app.get("/desktop/desktop.py", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.type("text/x-python");
    res.sendFile(desktopFile(), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: "This server has no Xpot Desktop to offer" });
    });
  });
}
