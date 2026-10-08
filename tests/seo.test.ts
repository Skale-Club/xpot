import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePublicSeoPath,
  publicPagePath,
  renderSeoHead,
} from "../shared/seo.js";
import { injectSeoHead, SEO_HEAD_MARKER } from "../server/seo.js";

describe("public SEO routes", () => {
  it("maps one canonical URL per public page and language", () => {
    expect(publicPagePath("home", "en")).toBe("/");
    expect(publicPagePath("home", "pt")).toBe("/pt");
    expect(publicPagePath("privacy", "es")).toBe("/es/privacy");
    expect(parsePublicSeoPath("/pt/terms/")).toEqual({ page: "terms", lang: "pt" });
    expect(parsePublicSeoPath("/dashboard")).toBeNull();
  });

  it("renders indexable localized metadata and structured data for the landing", () => {
    const head = renderSeoHead("/pt");
    expect(head).toContain("Xpot — Vendas externas");
    expect(head).toContain('name="robots" content="index, follow, max-image-preview:large"');
    expect(head).toContain('rel="canonical" href="https://xpot.place/pt"');
    expect(head).toContain('hreflang="es" href="https://xpot.place/es"');
    expect(head).toContain('property="og:image" content="https://xpot.place/og-image.png"');
    expect(head).toContain('property="og:image:width" content="1200"');
    expect(head).toContain('type="application/ld+json"');
    expect(head).toContain('"@type":"SoftwareApplication"');
  });

  it("keeps authenticated and operational routes out of search", () => {
    const head = renderSeoHead("/admin/tags");
    expect(head).toContain("noindex, nofollow, noarchive");
    expect(head).not.toContain('rel="canonical"');
    expect(head).not.toContain("application/ld+json");
  });

  it("injects the route head into the Vite template", () => {
    const html = injectSeoHead(`<html lang="en"><head>${SEO_HEAD_MARKER}</head></html>`, "/es/privacy");
    expect(html).toContain("Política de Privacidad · Xpot");
    expect(html).toContain('<html lang="es-US">');
    expect(html).not.toContain(SEO_HEAD_MARKER);
  });
});

describe("crawler files", () => {
  const publicDir = path.resolve(import.meta.dirname, "..", "client", "public");

  it("points robots at the sitemap and blocks private application routes", () => {
    const robots = fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8");
    expect(robots).toContain("Sitemap: https://xpot.place/sitemap.xml");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /tags");
  });

  it("lists the localized landing and legal URLs", () => {
    const sitemap = fs.readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
    for (const url of ["https://xpot.place/", "https://xpot.place/pt", "https://xpot.place/es", "https://xpot.place/privacy", "https://xpot.place/pt/terms"]) {
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    }
  });
});
