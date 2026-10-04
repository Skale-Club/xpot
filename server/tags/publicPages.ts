// Tiny self-contained HTML pages for tags that are not live. No SPA, no
// JavaScript, no external assets: these must render instantly on any phone
// and never show customer data. Copy follows the scanner's Accept-Language
// (English, Portuguese or Spanish), since the people scanning are the
// customers' own customers.

export type TagPageKind = "inactive" | "unavailable" | "not_found";
export type TagPageLang = "en" | "pt" | "es";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const COPY: Record<TagPageLang, Record<TagPageKind, { title: string; body: string }> & { tag: string; configure: string }> = {
  en: {
    inactive: {
      title: "This tag has not been activated yet.",
      body: "It will start working as soon as it is set up. Please check back later.",
    },
    unavailable: { title: "This tag is not available.", body: "The link on this tag is currently inactive." },
    not_found: { title: "Tag not found.", body: "This code does not match any Xpot tag." },
    tag: "Tag",
    configure: "Set up this tag",
  },
  pt: {
    inactive: {
      title: "Esta tag ainda não foi ativada.",
      body: "Ela vai funcionar assim que for configurada. Tente de novo mais tarde.",
    },
    unavailable: { title: "Esta tag não está disponível.", body: "O link desta tag está desativado no momento." },
    not_found: { title: "Tag não encontrada.", body: "Este código não corresponde a nenhuma tag Xpot." },
    tag: "Tag",
    configure: "Configurar esta tag",
  },
  es: {
    inactive: {
      title: "Esta etiqueta aún no ha sido activada.",
      body: "Funcionará en cuanto esté configurada. Vuelve a intentarlo más tarde.",
    },
    unavailable: { title: "Esta etiqueta no está disponible.", body: "El enlace de esta etiqueta está desactivado en este momento." },
    not_found: { title: "Etiqueta no encontrada.", body: "Este código no corresponde a ninguna etiqueta Xpot." },
    tag: "Etiqueta",
    configure: "Configurar esta etiqueta",
  },
};

/** First supported language in an Accept-Language header; English otherwise. */
export function pickTagPageLang(acceptLanguage: string | null | undefined): TagPageLang {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) {
    if (lang === "en" || lang === "pt" || lang === "es") return lang;
  }
  return "en";
}

export function renderTagPage(
  kind: TagPageKind,
  opts: { code?: string; configureUrl?: string; lang?: TagPageLang } = {},
): string {
  const lang = opts.lang ?? "en";
  const copy = COPY[lang];
  const { title, body } = copy[kind];
  const code = opts.code ? `<p class="code">${escapeHtml(copy.tag)} ${escapeHtml(opts.code)}</p>` : "";
  const configure = opts.configureUrl
    ? `<a class="btn" href="${escapeHtml(opts.configureUrl)}">${escapeHtml(copy.configure)}</a>`
    : "";
  return `<!doctype html>
<html lang="${lang === "pt" ? "pt-BR" : lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} | Xpot</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #060912; color: #f5f6f8; }
  main { max-width: 22rem; padding: 2rem 1.5rem; text-align: center; }
  .brand { font-weight: 700; letter-spacing: .02em; color: #9aa3b2; font-size: .85rem; text-transform: uppercase; }
  h1 { font-size: 1.35rem; line-height: 1.3; margin: 1rem 0 .5rem; }
  p { color: #c3c8d2; line-height: 1.5; margin: 0; }
  .code { margin-top: 1rem; font-family: ui-monospace, monospace; color: #9aa3b2; font-size: .85rem; }
  .btn { display: inline-block; margin-top: 1.5rem; padding: .75rem 1.25rem; border-radius: .6rem; background: #3b82f6; color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<main>
  <div class="brand">Xpot</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  ${code}
  ${configure}
</main>
</body>
</html>`;
}
