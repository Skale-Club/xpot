import { parsePublicSeoPath, publicSeoMetadata, renderSeoHead } from "#shared/seo.js";

export const SEO_HEAD_MARKER = "<!-- xpot:seo -->";

/** Inject route-specific SEO into the SPA template before it reaches a crawler or link preview. */
export function injectSeoHead(template: string, pathname: string): string {
  if (!template.includes(SEO_HEAD_MARKER)) {
    throw new Error("The client HTML is missing the Xpot SEO head marker");
  }
  const route = parsePublicSeoPath(pathname);
  const htmlLang = route ? publicSeoMetadata(route.page, route.lang).htmlLang : "en";
  return template
    .replace(SEO_HEAD_MARKER, renderSeoHead(pathname))
    .replace(/<html lang="[^"]*"/, `<html lang="${htmlLang}"`);
}
