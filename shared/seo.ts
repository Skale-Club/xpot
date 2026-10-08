export const SEO_ORIGIN = "https://xpot.place";
export const SEO_OG_IMAGE = `${SEO_ORIGIN}/og-image.png`;

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
      title: "Xpot — Field sales, visits and QR/NFC",
      description:
        "Field sales software for GPS-confirmed visits, AI voice notes, sales, consignment stock and QR/NFC pieces that connect customers to your business.",
    },
    privacy: {
      title: "Privacy Policy · Xpot",
      description: "Learn how Xpot collects, uses, protects and deletes account, visit, sales, location and QR/NFC scan data.",
    },
    terms: {
      title: "Terms of Service · Xpot",
      description: "Read the terms that govern access to and use of the Xpot field sales and QR/NFC platform.",
    },
  },
  pt: {
    home: {
      title: "Xpot — Vendas externas, visitas e QR/NFC",
      description:
        "Software de vendas externas com visitas confirmadas por GPS, áudios resumidos por IA, vendas, consignação e peças QR/NFC para seus clientes.",
    },
    privacy: {
      title: "Política de Privacidade · Xpot",
      description: "Saiba como o Xpot coleta, usa, protege e exclui dados de contas, visitas, vendas, localização e leituras de QR/NFC.",
    },
    terms: {
      title: "Termos de Uso · Xpot",
      description: "Leia os termos que regem o acesso e o uso da plataforma Xpot de vendas externas e QR/NFC.",
    },
  },
  es: {
    home: {
      title: "Xpot — Ventas de campo, visitas y QR/NFC",
      description:
        "Software de ventas de campo con visitas confirmadas por GPS, notas de voz resumidas por IA, ventas, consignación y piezas QR/NFC.",
    },
    privacy: {
      title: "Política de Privacidad · Xpot",
      description: "Conoce cómo Xpot recopila, usa, protege y elimina datos de cuentas, visitas, ventas, ubicación y lecturas QR/NFC.",
    },
    terms: {
      title: "Términos del Servicio · Xpot",
      description: "Lee los términos que rigen el acceso y el uso de la plataforma Xpot de ventas de campo y QR/NFC.",
    },
  },
};

const FEATURES: Record<SeoLang, string[]> = {
  en: [
    "GPS-confirmed field visits",
    "AI-assisted voice notes and follow-ups",
    "Sales and consignment stock",
    "QR and NFC customer pieces",
  ],
  pt: [
    "Visitas externas confirmadas por GPS",
    "Áudios e retornos assistidos por IA",
    "Vendas e estoque em consignação",
    "Peças de cliente com QR e NFC",
  ],
  es: [
    "Visitas de campo confirmadas por GPS",
    "Notas de voz y seguimientos asistidos por IA",
    "Ventas y stock en consignación",
    "Piezas para clientes con QR y NFC",
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
    meta("og:image:alt", "Xpot field sales platform", true),
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
