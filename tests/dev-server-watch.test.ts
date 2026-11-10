// The local server stopped answering after any full load of "/?something": given the URL with its query, Vite took the
// module to be "/" and watched the root of the disk. (The tests run without a dev server, so this reads the sources.)

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("the local dev server", () => {
  it("hands Vite the page's path, never the URL with its query", () => {
    const source = readFileSync("server/vite.ts", "utf8");
    expect(source).toContain("vite.transformIndexHtml(req.path, template)");
    expect(source).not.toContain("transformIndexHtml(req.originalUrl");
  });

  it("watches nothing outside the project", () => {
    const ignored = config.server?.watch?.ignored as (file: string) => boolean;
    const root = process.cwd();
    expect(ignored(path.parse(root).root)).toBe(true);
    expect(ignored(path.resolve(root, ".."))).toBe(true);
    expect(ignored(path.resolve(root, "..", "another-project", "index.html"))).toBe(true);
    expect(ignored(root)).toBe(false);
    expect(ignored(path.join(root, "client", "src", "main.tsx"))).toBe(false);
    expect(ignored(path.join(root, "shared", "printProduction.ts"))).toBe(false);
  });
});
