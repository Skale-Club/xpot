// Tiny self-contained HTML pages for tags that are not live. No SPA, no
// JavaScript and no external assets: these must render instantly on any phone
// and never expose customer data. Copy follows the scanner's Accept-Language.

export type TagPageKind = "inventory" | "assigned" | "unavailable" | "not_found";
export type TagPageLang = "en" | "pt" | "es";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type PageCopy = {
  title: string;
  body: string;
};

type LanguageCopy = Record<TagPageKind, PageCopy> & {
  piece: string;
  /** For someone who may work on the piece: the way in to set it up. */
  configure: string;
  /** A quiet link to the product page, for the curious. */
  about: string;
};

// A scanned piece is read by a customer at a counter, not by whoever sells it: each page says what happened and what
// to do, nothing else. It claims nothing it cannot know (that the piece is verified, that QR and NFC work), and it
// never says why a piece is off (paused and deactivated read the same, on purpose).
const COPY: Record<TagPageLang, LanguageCopy> = {
  en: {
    inventory: { title: "This piece isn't set up yet.", body: "Ask the business where you found it." },
    assigned: { title: "This piece will be ready soon.", body: "Scan it again later, or ask the business." },
    unavailable: { title: "This piece isn't available.", body: "Ask the business where you found it." },
    not_found: { title: "We couldn't find this code.", body: "Check the printed code or ask whoever gave it to you." },
    piece: "Piece",
    configure: "Set up this piece",
    about: "What's Xpot?",
  },
  pt: {
    inventory: { title: "Esta peça ainda não foi configurada.", body: "Pergunte no local onde você a encontrou." },
    assigned: { title: "Esta peça estará pronta em breve.", body: "Escaneie de novo mais tarde ou pergunte no local." },
    unavailable: { title: "Esta peça não está disponível.", body: "Pergunte no local onde você a encontrou." },
    not_found: { title: "Não encontramos este código.", body: "Confira o código impresso ou fale com quem entregou a peça." },
    piece: "Peça",
    configure: "Configurar esta peça",
    about: "O que é o Xpot?",
  },
  es: {
    inventory: { title: "Esta pieza aún no está configurada.", body: "Pregunta en el lugar donde la encontraste." },
    assigned: { title: "Esta pieza estará lista pronto.", body: "Escanéala de nuevo más tarde o pregunta en el lugar." },
    unavailable: { title: "Esta pieza no está disponible.", body: "Pregunta en el lugar donde la encontraste." },
    not_found: { title: "No encontramos este código.", body: "Revisa el código impreso o habla con quien te dio la pieza." },
    piece: "Pieza",
    configure: "Configurar esta pieza",
    about: "¿Qué es Xpot?",
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

const PAGE_STYLE = `<style>
  :root { color-scheme: dark; --blue: #5b8cff; --cyan: #6fe8ff; --ink: #f7f9ff; --muted: #a7b0c3; --line: rgba(255,255,255,.1); }
  * { box-sizing: border-box; }
  html { min-height: 100%; background: #060912; }
  body { margin: 0; min-height: 100vh; min-height: 100svh; overflow-x: hidden; font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at 50% -10%, rgba(55,104,255,.24), transparent 42%), linear-gradient(155deg, #050811 0%, #08101d 52%, #050810 100%); }
  body::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .16; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 32px 32px; mask-image: linear-gradient(to bottom, #000, transparent 72%); }
  .shell { position: relative; width: min(100%, 32rem); min-height: 100vh; min-height: 100svh; margin: 0 auto; padding: max(1.25rem, env(safe-area-inset-top)) 1.25rem max(1.5rem, env(safe-area-inset-bottom)); display: flex; flex-direction: column; justify-content: center; }
  .brand { position: absolute; top: max(1.25rem, env(safe-area-inset-top)); left: 1.25rem; display: flex; align-items: center; }
  .brand-logo { width: auto; height: 1.9rem; display: block; object-fit: contain; filter: drop-shadow(0 10px 20px rgba(36,85,255,.18)); }
  .card { position: relative; overflow: hidden; margin-top: 4.5rem; padding: 1.5rem; border: 1px solid var(--line); border-radius: 1.7rem; background: linear-gradient(145deg, rgba(20,29,49,.94), rgba(9,15,28,.9)); box-shadow: 0 30px 90px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter: blur(18px); }
  .card::before { content: ""; position: absolute; width: 15rem; height: 15rem; right: -8rem; top: -9rem; border-radius: 50%; background: rgba(91,140,255,.18); filter: blur(34px); pointer-events: none; }
  .signal { position: relative; width: 5.4rem; height: 5.4rem; margin: .35rem 0 1.35rem; display: grid; place-items: center; }
  .signal span { position: absolute; border: 1px solid rgba(91,140,255,.28); border-radius: 50%; animation: breathe 3.6s ease-in-out infinite; }
  .signal span:nth-child(1) { width: 100%; height: 100%; opacity: .35; }
  .signal span:nth-child(2) { width: 68%; height: 68%; animation-delay: -.8s; }
  .signal span:nth-child(3) { width: 35%; height: 35%; border-color: rgba(111,232,255,.56); background: radial-gradient(circle at 35% 30%, #c9f8ff, var(--blue) 46%, #2347c8); box-shadow: 0 0 2rem rgba(91,140,255,.58), inset 0 1px 2px rgba(255,255,255,.65); }
  .muted .signal span { animation: none; border-color: rgba(167,176,195,.2); }
  .muted .signal span:nth-child(3) { border-color: rgba(167,176,195,.3); background: radial-gradient(circle at 35% 30%, #d2d7e2, #697286 52%, #303746); box-shadow: 0 0 1.5rem rgba(80,89,108,.28); }
  h1 { position: relative; max-width: 13ch; margin: 0; font-size: clamp(2rem, 9vw, 3rem); line-height: 1.02; letter-spacing: -.02em; font-weight: 800; text-wrap: balance; }
  .body { position: relative; margin: 1rem 0 0; color: var(--muted); font-size: .98rem; line-height: 1.65; text-wrap: pretty; }
  .piece-code { position: relative; margin-top: .8rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .78rem 1rem; border-radius: .9rem; color: #7f8a9f; background: rgba(0,0,0,.16); font-size: .7rem; text-transform: uppercase; letter-spacing: .09em; }
  .piece-code strong { color: #cbd2df; font-family: "SFMono-Regular", Consolas, monospace; font-size: .78rem; letter-spacing: .08em; }
  .actions { position: relative; display: grid; gap: .65rem; margin-top: 1.35rem; }
  .button { min-height: 3.2rem; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: .95rem; text-decoration: none; font-size: .88rem; font-weight: 750; transition: transform .2s ease, border-color .2s ease, background .2s ease; }
  .button.primary { color: #fff; background: linear-gradient(120deg, #4777f5, #5b8cff 55%, #4d74ee); box-shadow: 0 13px 32px rgba(66,108,239,.27), inset 0 1px 0 rgba(255,255,255,.18); }
  .button.secondary { color: #c8d0df; border-color: rgba(255,255,255,.09); background: rgba(255,255,255,.035); }
  .button:hover { transform: translateY(-1px); }
  .button:focus-visible { outline: 3px solid rgba(111,232,255,.4); outline-offset: 3px; }
  .about { position: relative; margin: 1.3rem 0 0; text-align: center; font-size: .78rem; }
  .about a { color: #788398; text-underline-offset: .2em; }
  .about a:hover { color: #a7b0c3; }
  @keyframes breathe { 0%, 100% { transform: scale(.94); opacity: .42; } 50% { transform: scale(1.04); opacity: .88; } }
  @media (min-width: 31rem) { .card { padding: 2rem; } .shell { padding-inline: 1.5rem; } .brand { left: 1.5rem; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; transition: none !important; } }
</style>`;

export function renderTagPage(
  kind: TagPageKind,
  opts: { code?: string; configureUrl?: string; lang?: TagPageLang } = {},
): string {
  const lang = opts.lang ?? "en";
  const copy = COPY[lang];
  const page = copy[kind];
  const code = opts.code
    ? `<div class="piece-code"><span>${escapeHtml(copy.piece)}</span><strong>${escapeHtml(opts.code)}</strong></div>`
    : "";
  // Only someone who may work on the piece gets a way into the app, and it is the one coloured button of the page.
  const configure = opts.configureUrl
    ? `<div class="actions"><a class="button primary" href="${escapeHtml(opts.configureUrl)}">${escapeHtml(copy.configure)}</a></div>`
    : "";
  const tone = kind === "inventory" || kind === "assigned" ? "waiting" : "muted";
  return `<!doctype html>
<html lang="${lang === "pt" ? "pt-BR" : lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#060912">
<title>${escapeHtml(page.title)} | Xpot</title>
${PAGE_STYLE}
</head>
<body class="${tone}">
  <main class="shell">
    <div class="brand"><img class="brand-logo" src="/api/branding/logo" alt="Xpot" /></div>
    <section class="card" aria-labelledby="page-title">
      <div class="signal" aria-hidden="true"><span></span><span></span><span></span></div>
      <h1 id="page-title">${escapeHtml(page.title)}</h1>
      <p class="body">${escapeHtml(page.body)}</p>
      ${code}
      ${configure}
    </section>
    <p class="about"><a href="/">${escapeHtml(copy.about)}</a></p>
  </main>
</body>
</html>`;
}

// ─── Contact pages (a live piece that hands out an email or a phone number) ───

export type ContactPageKind = "email" | "phone";

const CONTACT_COPY: Record<TagPageLang, Record<ContactPageKind, { title: string; action: string }>> = {
  en: { email: { title: "Send an email", action: "Write email" }, phone: { title: "Give us a call", action: "Call now" } },
  pt: { email: { title: "Envie um e-mail", action: "Escrever e-mail" }, phone: { title: "Ligue para nós", action: "Ligar agora" } },
  es: { email: { title: "Envíanos un correo", action: "Escribir correo" }, phone: { title: "Llámanos", action: "Llamar ahora" } },
};

/**
 * A live piece whose content is an email or a phone: browsers often refuse to
 * follow a redirect to mailto:/tel: from a scan, so this page opens it (meta
 * refresh) and keeps a big button for when that is blocked.
 */
export function renderContactPage(kind: ContactPageKind, opts: { href: string; display: string; lang?: TagPageLang }): string {
  const lang = opts.lang ?? "en";
  const copy = CONTACT_COPY[lang][kind];
  const href = escapeHtml(opts.href);
  return `<!doctype html>
<html lang="${lang === "pt" ? "pt-BR" : lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#060912">
<meta http-equiv="refresh" content="0;url=${href}">
<title>${escapeHtml(copy.title)} | Xpot</title>
${PAGE_STYLE}
</head>
<body class="waiting">
  <main class="shell">
    <div class="brand"><img class="brand-logo" src="/api/branding/logo" alt="Xpot" /></div>
    <section class="card" aria-labelledby="page-title">
      <h1 id="page-title">${escapeHtml(copy.title)}</h1>
      <p class="body">${escapeHtml(opts.display)}</p>
      <div class="actions"><a class="button primary" href="${href}" data-testid="contact-action">${escapeHtml(copy.action)}</a></div>
    </section>
  </main>
</body>
</html>`;
}
