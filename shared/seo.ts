export const SEO_ORIGIN = "https://xpot.place";
export const SEO_OG_IMAGE = `${SEO_ORIGIN}/og-image.png`;
export const TITLE_SEPARATOR = " · ";

/** One title convention for browser tabs, SEO and social metadata. */
export function formatTitle(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(TITLE_SEPARATOR);
}

export const SEO_LANGS = ["en", "pt", "es"] as const;
export type SeoLang = (typeof SEO_LANGS)[number];
export type PublicSeoPage = "home" | "privacy" | "terms";

const LOCALE: Record<SeoLang, string> = {
  en: "en_US",
  pt: "pt_BR",
  es: "es_US",
};

const HTML_LANG: Record<SeoLang, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-US",
};

const COPY: Record<SeoLang, Record<PublicSeoPage, { title: string; description: string }>> = {
  en: {
    home: {
      title: formatTitle("Xpot", "Flexible independent field sales"),
      description:
        "Sell selected products to local businesses on your schedule, whether for a few flexible hours or as a full-time business. Plan routes, confirm visits by GPS and organize sales with Xpot.",
    },
    privacy: {
      title: formatTitle("Privacy Policy", "Xpot"),
      description: "Learn how Xpot collects, uses, protects and deletes account, visit, sales, location and QR/NFC scan data.",
    },
    terms: {
      title: formatTitle("Terms of Service", "Xpot"),
      description: "Read the terms that govern access to and use of the Xpot field sales and QR/NFC platform.",
    },
  },
  pt: {
    home: {
      title: formatTitle("Xpot", "Vendas independentes no seu ritmo"),
      description:
        "Venda produtos selecionados para comércios locais no seu ritmo, por algumas horas ou como atividade principal. Planeje rotas, confirme visitas por GPS e organize vendas no Xpot.",
    },
    privacy: {
      title: formatTitle("Política de Privacidade", "Xpot"),
      description: "Saiba como o Xpot coleta, usa, protege e exclui dados de contas, visitas, vendas, localização e leituras de QR/NFC.",
    },
    terms: {
      title: formatTitle("Termos de Uso", "Xpot"),
      description: "Leia os termos que regem o acesso e o uso da plataforma Xpot de vendas externas e QR/NFC.",
    },
  },
  es: {
    home: {
      title: formatTitle("Xpot", "Ventas independientes a tu ritmo"),
      description:
        "Vende productos seleccionados a comercios locales a tu ritmo, por unas horas o como actividad principal. Planifica rutas, confirma visitas por GPS y organiza ventas con Xpot.",
    },
    privacy: {
      title: formatTitle("Política de Privacidad", "Xpot"),
      description: "Conoce cómo Xpot recopila, usa, protege y elimina datos de cuentas, visitas, ventas, ubicación y lecturas QR/NFC.",
    },
    terms: {
      title: formatTitle("Términos del Servicio", "Xpot"),
      description: "Lee los términos que rigen el acceso y el uso de la plataforma Xpot de ventas de campo y QR/NFC.",
    },
  },
};

const FEATURES: Record<SeoLang, string[]> = {
  en: [
    "Flexible selling routes for independent sellers",
    "GPS-confirmed visits to local businesses",
    "Sales, stock and earnings tracking",
    "QR and NFC products for local businesses",
  ],
  pt: [
    "Rotas flexíveis para vendedores independentes",
    "Visitas a comércios locais confirmadas por GPS",
    "Controle de vendas, estoque e ganhos",
    "Produtos com QR e NFC para comércios locais",
  ],
  es: [
    "Rutas flexibles para vendedores independientes",
    "Visitas a comercios locales confirmadas por GPS",
    "Control de ventas, stock y ganancias",
    "Productos con QR y NFC para comercios locales",
  ],
};

export interface PublicSeoMetadata {
  page: PublicSeoPage;
  lang: SeoLang;
  htmlLang: string;
  locale: string;
  title: string;
  description: string;
  canonical: string;
  alternates: Array<{ lang: SeoLang | "x-default"; href: string }>;
  jsonLd: Record<string, unknown> | null;
}

export function isSeoLang(value: unknown): value is SeoLang {
  return typeof value === "string" && (SEO_LANGS as readonly string[]).includes(value);
}

export function publicPagePath(page: PublicSeoPage, lang: SeoLang): string {
  const prefix = lang === "en" ? "" : `/${lang}`;
  if (page === "home") return prefix || "/";
  return `${prefix}/${page}`;
}

/** The language encoded in a public URL, if this is one of those URLs. */
export function langFromPublicPath(pathname: string): SeoLang | null {
  const parsed = parsePublicSeoPath(pathname);
  // English is the unprefixed default, not an explicit language choice. Let a
  // returning visitor's saved/device language move / to /pt or /es; prefixed
  // URLs always win over that preference.
  return parsed && parsed.lang !== "en" ? parsed.lang : null;
}

export function parsePublicSeoPath(pathname: string): { page: PublicSeoPage; lang: SeoLang } | null {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  let lang: SeoLang = "en";

  if (parts[0] === "pt" || parts[0] === "es") {
    lang = parts.shift() as SeoLang;
  }

  if (parts.length === 0) return { page: "home", lang };
  if (parts.length === 1 && (parts[0] === "privacy" || parts[0] === "terms")) {
    return { page: parts[0], lang };
  }
  return null;
}

export function publicSeoMetadata(page: PublicSeoPage, lang: SeoLang): PublicSeoMetadata {
  const copy = COPY[lang][page];
  const canonical = `${SEO_ORIGIN}${publicPagePath(page, lang)}`;
  const alternates: PublicSeoMetadata["alternates"] = [
    { lang: "en", href: `${SEO_ORIGIN}${publicPagePath(page, "en")}` },
    { lang: "pt", href: `${SEO_ORIGIN}${publicPagePath(page, "pt")}` },
    { lang: "es", href: `${SEO_ORIGIN}${publicPagePath(page, "es")}` },
    { lang: "x-default", href: `${SEO_ORIGIN}${publicPagePath(page, "en")}` },
  ];

  const jsonLd =
    page === "home"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SEO_ORIGIN}/#organization`,
              name: "Xpot",
              url: `${SEO_ORIGIN}/`,
              logo: `${SEO_ORIGIN}/api/branding/icon-512.png`,
            },
            {
              "@type": "SoftwareApplication",
              "@id": `${canonical}#software`,
              name: "Xpot",
              url: canonical,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android, iOS",
              inLanguage: HTML_LANG[lang],
              description: copy.description,
              publisher: { "@id": `${SEO_ORIGIN}/#organization` },
              featureList: FEATURES[lang],
            },
          ],
        }
      : null;

  return {
    page,
    lang,
    htmlLang: HTML_LANG[lang],
    locale: LOCALE[lang],
    title: copy.title,
    description: copy.description,
    canonical,
    alternates,
    jsonLd,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function meta(name: string, content: string, property = false): string {
  return `<meta ${property ? "property" : "name"}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
}

/** Complete, server-renderable head block. Non-public routes deliberately stay out of search. */
export function renderSeoHead(pathname: string): string {
  const route = parsePublicSeoPath(pathname);
  if (!route) {
    return [
      "<title>Xpot</title>",
      meta("description", "Xpot field sales workspace."),
      meta("robots", "noindex, nofollow, noarchive"),
    ].join("\n    ");
  }

  const seo = publicSeoMetadata(route.page, route.lang);
  const alternateLocales = SEO_LANGS.filter((lang) => lang !== seo.lang).map((lang) => meta("og:locale:alternate", LOCALE[lang], true));
  const jsonLd = seo.jsonLd
    ? `<script type="application/ld+json" data-xpot-seo>${JSON.stringify(seo.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  return [
    `<title>${escapeHtml(seo.title)}</title>`,
    meta("description", seo.description),
    meta("robots", "index, follow, max-image-preview:large"),
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`,
    ...seo.alternates.map(({ lang, href }) => `<link rel="alternate" hreflang="${lang}" href="${escapeHtml(href)}" />`),
    meta("og:type", "website", true),
    meta("og:site_name", "Xpot", true),
    meta("og:title", seo.title, true),
    meta("og:description", seo.description, true),
    meta("og:url", seo.canonical, true),
    meta("og:image", SEO_OG_IMAGE, true),
    meta("og:image:width", "1200", true),
    meta("og:image:height", "630", true),
    meta("og:image:alt", "Xpot for independent sellers building income on their terms", true),
    meta("og:locale", seo.locale, true),
    ...alternateLocales,
    meta("twitter:card", "summary_large_image"),
    meta("twitter:title", seo.title),
    meta("twitter:description", seo.description),
    meta("twitter:image", SEO_OG_IMAGE),
    jsonLd,
  ]
    .filter(Boolean)
    .join("\n    ");
}
