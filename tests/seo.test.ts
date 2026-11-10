import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatTitle,
  LANDING_HERO_IMAGE,
  parsePublicSeoPath,
  publicPagePath,
  renderSeoHead,
} from "../shared/seo.js";
import { injectSeoHead, landingChunkPreloads, SEO_HEAD_MARKER, staticCacheControl } from "../server/seo.js";

describe("public SEO routes", () => {
  it("uses one minimal dot separator for every browser and SEO title", () => {
    expect(formatTitle("Dashboard", "Visits", "Xpot")).toBe("Dashboard · Visits · Xpot");
    for (const pathname of ["/", "/pt", "/es", "/privacy", "/pt/terms", "/es/privacy"]) {
      const head = renderSeoHead(pathname);
      const title = head.match(/<title>(.*?)<\/title>/)?.[1];
      expect(title).toContain(" · ");
      expect(title).not.toMatch(/[—|]/);
    }
  });

  it("maps one canonical URL per public page and language", () => {
    expect(publicPagePath("home", "en")).toBe("/");
    expect(publicPagePath("home", "pt")).toBe("/pt");
    expect(publicPagePath("privacy", "es")).toBe("/es/privacy");
    expect(parsePublicSeoPath("/pt/terms/")).toEqual({ page: "terms", lang: "pt" });
    expect(parsePublicSeoPath("/dashboard")).toBeNull();
  });

  it("renders indexable localized metadata and structured data for the landing", () => {
    const head = renderSeoHead("/pt");
    expect(head).toContain("Xpot · Plataforma de vendas externas");
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

  it("preloads the hero on the home pages only, matching its <img>", () => {
    for (const pathname of ["/", "/pt", "/es"]) {
      const head = renderSeoHead(pathname);
      expect(head).toContain('rel="preload" as="image"');
      expect(head).toContain(`imagesrcset="${LANDING_HERO_IMAGE.srcSet}"`);
      expect(head).toContain(`imagesizes="${LANDING_HERO_IMAGE.sizes}"`);
    }
    expect(renderSeoHead("/pt/terms")).not.toContain('rel="preload"');
    expect(renderSeoHead("/dashboard")).not.toContain('rel="preload"');
  });

  it("ships every hero variant the srcset names", () => {
    for (const candidate of LANDING_HERO_IMAGE.srcSet.split(", ")) {
      const url = candidate.split(" ")[0];
      expect(fs.existsSync(path.join(process.cwd(), "client", "public", url))).toBe(true);
    }
  });

  it("caches only what can safely stay in the browser", () => {
    expect(staticCacheControl("assets/index-4PCt7hnq.js")).toContain("immutable");
    expect(staticCacheControl("assets\\index-y9IlV3SI.css")).toContain("immutable");
    expect(staticCacheControl("landing/product/visit-mobile-clean.webp")).toContain("max-age=86400");
    expect(staticCacheControl("landing/product/visit-mobile-clean.webp")).not.toContain("immutable");
    // The worker must reach browsers as soon as it deploys.
    expect(staticCacheControl("sw.js")).toBeUndefined();
    expect(staticCacheControl("robots.txt")).toBeUndefined();
  });

  it("preloads the landing chunk on the home pages, without what the entry already loads", () => {
    const preloads = landingChunkPreloads({
      "index.html": { file: "assets/index.js", imports: ["_vendor.js"] },
      "_vendor.js": { file: "assets/vendor.js" },
      "_button.js": { file: "assets/button.js", imports: ["_vendor.js"] },
      "src/pages/xpot/XpotLandingPage.tsx": { file: "assets/landing.js", imports: ["_button.js", "_vendor.js"] },
    });
    expect(preloads).toContain('href="/assets/landing.js"');
    expect(preloads).toContain('href="/assets/button.js"');
    expect(preloads).not.toContain("vendor.js");
    const template = `<html lang="en"><head>${SEO_HEAD_MARKER}</head></html>`;
    expect(injectSeoHead(template, "/pt", preloads)).toContain("modulepreload");
    expect(injectSeoHead(template, "/pt/terms", preloads)).not.toContain("modulepreload");
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
