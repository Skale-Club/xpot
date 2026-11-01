import { parsePublicSeoPath, publicSeoMetadata, renderSeoHead } from "#shared/seo.js";

export const SEO_HEAD_MARKER = "<!-- xpot:seo -->";

type ViteManifest = Record<string, { file: string; imports?: string[] }>;
const LANDING_CHUNK_SOURCE = "src/pages/xpot/XpotLandingPage.tsx";

/**
 * <link>s for the landing's lazy chunk and what it imports: the browser would only find them
 * after the entry has run, and the page shows nothing until they arrive. Files the entry
 * already pulls in are in the template.
 */
export function landingChunkPreloads(manifest: ViteManifest): string {
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    manifest[key].imports?.forEach(walk);
  };
  walk("index.html");
  const inTemplate = new Set(seen);
  walk(LANDING_CHUNK_SOURCE);
  return Array.from(seen)
    .filter((key) => !inTemplate.has(key))
    .map((key) => `<link rel="modulepreload" href="/${manifest[key].file}" />`)
    .join("\n    ");
}

/** Browser cache for a built client file, by its path inside dist/public; undefined keeps the default. */
export function staticCacheControl(relativePath: string): string | undefined {
  const file = relativePath.replace(/\\/g, "/");
  // Vite fingerprints these names, so a given URL's bytes never change.
  if (file.startsWith("assets/")) return "public, max-age=31536000, immutable";
  // Replaced under a new name (-v2), but not fingerprinted, so never immutable.
  if (file.endsWith(".webp")) return "public, max-age=86400, stale-while-revalidate=604800";
  return undefined;
}

/** Inject route-specific SEO into the SPA template before it reaches a crawler or link preview. */
export function injectSeoHead(template: string, pathname: string, landingPreloads = ""): string {
  if (!template.includes(SEO_HEAD_MARKER)) {
    throw new Error("The client HTML is missing the Xpot SEO head marker");
  }
  const route = parsePublicSeoPath(pathname);
  const htmlLang = route ? publicSeoMetadata(route.page, route.lang).htmlLang : "en";
  return template
    .replace(SEO_HEAD_MARKER, [renderSeoHead(pathname), route?.page === "home" ? landingPreloads : ""].filter(Boolean).join("\n    "))
    .replace(/<html lang="[^"]*"/, `<html lang="${htmlLang}"`);
}
