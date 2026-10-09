import { useEffect } from "react";
import { useI18n } from "@/i18n";
import {
  SEO_LANGS,
  SEO_OG_IMAGE,
  publicPagePath,
  publicSeoMetadata,
  type PublicSeoPage,
  type SeoLang,
} from "@shared/seo";

function upsertMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    element.dataset.xpotSeo = "";
    document.head.appendChild(element);
  }
  element.content = content;
}

function applyPublicSeo(page: PublicSeoPage, lang: SeoLang) {
  const seo = publicSeoMetadata(page, lang);
  document.title = seo.title;
  document.documentElement.lang = seo.htmlLang;

  upsertMeta('meta[name="description"]', "name", "description", seo.description);
  upsertMeta('meta[name="robots"]', "name", "robots", "index, follow, max-image-preview:large");

  const social: Array<["name" | "property", string, string]> = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Xpot"],
    ["property", "og:title", seo.title],
    ["property", "og:description", seo.description],
    ["property", "og:url", seo.canonical],
    ["property", "og:image", SEO_OG_IMAGE],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", "Xpot field sales platform"],
    ["property", "og:locale", seo.locale],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", seo.title],
    ["name", "twitter:description", seo.description],
    ["name", "twitter:image", SEO_OG_IMAGE],
  ];
  for (const [attribute, key, content] of social) {
    upsertMeta(`meta[${attribute}="${key}"]`, attribute, key, content);
  }

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.dataset.xpotSeo = "";
    document.head.appendChild(canonical);
  }
  canonical.href = seo.canonical;

  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((element) => element.remove());
  for (const alternate of seo.alternates) {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = alternate.lang;
    link.href = alternate.href;
    link.dataset.xpotSeo = "";
    document.head.appendChild(link);
  }

  document.head.querySelectorAll('meta[property="og:locale:alternate"]').forEach((element) => element.remove());
  for (const alternateLang of SEO_LANGS.filter((candidate) => candidate !== lang)) {
    const alternateSeo = publicSeoMetadata(page, alternateLang);
    upsertMeta(
      `meta[property="og:locale:alternate"][content="${alternateSeo.locale}"]`,
      "property",
      "og:locale:alternate",
      alternateSeo.locale,
    );
  }

  document.head.querySelectorAll('script[type="application/ld+json"][data-xpot-seo]').forEach((element) => element.remove());
  if (seo.jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.xpotSeo = "";
    script.textContent = JSON.stringify(seo.jsonLd);
    document.head.appendChild(script);
  }
}

/** Keeps the visible language, localized URL and metadata in step on public pages. */
export function usePublicSeo(page: PublicSeoPage): void {
  const { lang } = useI18n();

  useEffect(() => {
    const targetPath = publicPagePath(page, lang);
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, "", `${targetPath}${window.location.search}${window.location.hash}`);
    }
    applyPublicSeo(page, lang);
  }, [lang, page]);
}
