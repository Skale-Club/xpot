// Tiny self-contained HTML pages for tags that are not live. No SPA, no
// JavaScript and no external assets: these must render instantly on any phone
// and never expose customer data. Copy follows the scanner's Accept-Language.

export type TagPageKind = "inventory" | "assigned" | "unavailable" | "not_found";
export type TagPageLang = "en" | "pt" | "es";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type PageCopy = {
  eyebrow: string;
  title: string;
  body: string;
  state: string;
  detail: string;
  owner: string;
};

type LanguageCopy = Record<TagPageKind, PageCopy> & {
  piece: string;
  configure: string;
  discover: string;
  promise: string;
};

const COPY: Record<TagPageLang, LanguageCopy> = {
  en: {
    inventory: {
      eyebrow: "Authentic Xpot piece",
      title: "This Xpot is ready to come alive.",
      body: "The piece is verified and connected. Its owner only needs to choose where each tap should take you.",
      state: "Destination pending",
      detail: "QR + NFC are ready",
      owner: "Own this piece? Sign in to Xpot, then scan it again to activate it.",
    },
    assigned: {
      eyebrow: "Authentic Xpot piece",
      title: "This experience is almost ready.",
      body: "This piece already has an owner and is getting its final setup. Soon, this same tap will take you straight to the right place.",
      state: "Setup in progress",
      detail: "The physical link is verified",
      owner: "Are you setting it up? Sign in to Xpot to continue.",
    },
    unavailable: {
      eyebrow: "Xpot link",
      title: "This experience is unavailable.",
      body: "The destination connected to this piece is not available right now.",
      state: "Temporarily offline",
      detail: "The piece itself is still recognized",
      owner: "If you manage this piece, open Xpot to review its status.",
    },
    not_found: {
      eyebrow: "Unrecognized code",
      title: "We could not find this Xpot.",
      body: "This code does not match a registered Xpot piece. Check the printed code or ask the person who provided it.",
      state: "Code not found",
      detail: "Nothing was connected or shared",
      owner: "Need help with a physical piece? Contact the team that supplied it.",
    },
    piece: "Piece",
    configure: "Activate this piece",
    discover: "Discover Xpot",
    promise: "One physical link. Always the right destination.",
  },
  pt: {
    inventory: {
      eyebrow: "Peça Xpot autêntica",
      title: "Este Xpot está pronto para ganhar vida.",
      body: "A peça é verificada e já está conectada. Falta apenas o proprietário escolher para onde cada toque deve levar.",
      state: "Destino pendente",
      detail: "QR + NFC estão prontos",
      owner: "Esta peça é sua? Entre no Xpot e escaneie novamente para ativá-la.",
    },
    assigned: {
      eyebrow: "Peça Xpot autêntica",
      title: "Esta experiência está quase pronta.",
      body: "A peça já tem um proprietário e está recebendo os últimos ajustes. Em breve, este mesmo toque levará você ao lugar certo.",
      state: "Configuração em andamento",
      detail: "O link físico foi verificado",
      owner: "Você está configurando esta peça? Entre no Xpot para continuar.",
    },
    unavailable: {
      eyebrow: "Link Xpot",
      title: "Esta experiência está indisponível.",
      body: "O destino conectado a esta peça não está disponível no momento.",
      state: "Temporariamente offline",
      detail: "A peça continua reconhecida",
      owner: "Se você administra esta peça, abra o Xpot para revisar o status.",
    },
    not_found: {
      eyebrow: "Código não reconhecido",
      title: "Não encontramos este Xpot.",
      body: "O código não corresponde a uma peça Xpot cadastrada. Confira o código impresso ou fale com quem forneceu a peça.",
      state: "Código não encontrado",
      detail: "Nenhum destino foi aberto ou compartilhado",
      owner: "Precisa de ajuda com uma peça física? Fale com a equipe que a forneceu.",
    },
    piece: "Peça",
    configure: "Ativar esta peça",
    discover: "Conhecer o Xpot",
    promise: "Um link físico. Sempre o destino certo.",
  },
  es: {
    inventory: {
      eyebrow: "Pieza Xpot auténtica",
      title: "Este Xpot está listo para cobrar vida.",
      body: "La pieza está verificada y conectada. Solo falta que su propietario elija adónde debe llevar cada toque.",
      state: "Destino pendiente",
      detail: "QR + NFC están listos",
      owner: "¿Esta pieza es tuya? Entra en Xpot y escanéala de nuevo para activarla.",
    },
    assigned: {
      eyebrow: "Pieza Xpot auténtica",
      title: "Esta experiencia está casi lista.",
      body: "La pieza ya tiene propietario y está recibiendo los últimos ajustes. Pronto, este mismo toque te llevará al lugar correcto.",
      state: "Configuración en curso",
      detail: "El enlace físico está verificado",
      owner: "¿Estás configurando esta pieza? Entra en Xpot para continuar.",
    },
    unavailable: {
      eyebrow: "Enlace Xpot",
      title: "Esta experiencia no está disponible.",
      body: "El destino conectado a esta pieza no está disponible en este momento.",
      state: "Temporalmente sin conexión",
      detail: "La pieza sigue reconocida",
      owner: "Si administras esta pieza, abre Xpot para revisar su estado.",
    },
    not_found: {
      eyebrow: "Código no reconocido",
      title: "No encontramos este Xpot.",
      body: "El código no coincide con una pieza Xpot registrada. Revisa el código impreso o habla con quien te dio la pieza.",
      state: "Código no encontrado",
      detail: "No se abrió ni compartió ningún destino",
      owner: "¿Necesitas ayuda con una pieza física? Habla con el equipo que te la entregó.",
    },
    piece: "Pieza",
    configure: "Activar esta pieza",
    discover: "Conocer Xpot",
    promise: "Un enlace físico. Siempre el destino correcto.",
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
  .brand { position: absolute; top: max(1.25rem, env(safe-area-inset-top)); left: 1.25rem; display: flex; align-items: center; gap: .65rem; font-size: 1rem; font-weight: 800; letter-spacing: -.03em; }
  .brand-mark { width: 1.9rem; height: 1.9rem; display: block; object-fit: cover; border-radius: .65rem; box-shadow: 0 10px 30px rgba(36,85,255,.18); }
  .card { position: relative; overflow: hidden; margin-top: 4.5rem; padding: 1.5rem; border: 1px solid var(--line); border-radius: 1.7rem; background: linear-gradient(145deg, rgba(20,29,49,.94), rgba(9,15,28,.9)); box-shadow: 0 30px 90px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06); backdrop-filter: blur(18px); }
  .card::before { content: ""; position: absolute; width: 15rem; height: 15rem; right: -8rem; top: -9rem; border-radius: 50%; background: rgba(91,140,255,.18); filter: blur(34px); pointer-events: none; }
  .eyebrow { position: relative; display: inline-flex; align-items: center; gap: .5rem; margin: 0 0 1.15rem; padding: .42rem .7rem; border: 1px solid rgba(111,232,255,.16); border-radius: 999px; color: #b8f3ff; background: rgba(111,232,255,.06); font-size: .69rem; font-weight: 750; letter-spacing: .105em; text-transform: uppercase; }
  .eyebrow::before { content: ""; width: .42rem; height: .42rem; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 0 .25rem rgba(111,232,255,.09), 0 0 1rem rgba(111,232,255,.75); }
  .signal { position: relative; width: 5.4rem; height: 5.4rem; margin: .35rem 0 1.35rem; display: grid; place-items: center; }
  .signal span { position: absolute; border: 1px solid rgba(91,140,255,.28); border-radius: 50%; animation: breathe 3.6s ease-in-out infinite; }
  .signal span:nth-child(1) { width: 100%; height: 100%; opacity: .35; }
  .signal span:nth-child(2) { width: 68%; height: 68%; animation-delay: -.8s; }
  .signal span:nth-child(3) { width: 35%; height: 35%; border-color: rgba(111,232,255,.56); background: radial-gradient(circle at 35% 30%, #c9f8ff, var(--blue) 46%, #2347c8); box-shadow: 0 0 2rem rgba(91,140,255,.58), inset 0 1px 2px rgba(255,255,255,.65); }
  .muted .signal span { animation: none; border-color: rgba(167,176,195,.2); }
  .muted .signal span:nth-child(3) { border-color: rgba(167,176,195,.3); background: radial-gradient(circle at 35% 30%, #d2d7e2, #697286 52%, #303746); box-shadow: 0 0 1.5rem rgba(80,89,108,.28); }
  h1 { position: relative; max-width: 13ch; margin: 0; font-size: clamp(2rem, 9vw, 3rem); line-height: 1.02; letter-spacing: -.055em; font-weight: 800; text-wrap: balance; }
  .body { position: relative; margin: 1rem 0 0; color: var(--muted); font-size: .98rem; line-height: 1.65; text-wrap: pretty; }
  .status { position: relative; margin: 1.5rem 0 0; padding: 1rem; display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: center; border: 1px solid rgba(255,255,255,.075); border-radius: 1rem; background: rgba(255,255,255,.035); }
  .status strong { font-size: .85rem; letter-spacing: -.01em; }
  .status small { grid-column: 1; color: #7f8a9f; font-size: .72rem; }
  .status-dot { grid-column: 2; grid-row: 1 / 3; width: .62rem; height: .62rem; border-radius: 50%; background: #f4b765; box-shadow: 0 0 0 .3rem rgba(244,183,101,.09), 0 0 1.2rem rgba(244,183,101,.4); }
  .muted .status-dot { background: #778195; box-shadow: 0 0 0 .3rem rgba(119,129,149,.08); }
  .piece-code { position: relative; margin-top: .8rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .78rem 1rem; border-radius: .9rem; color: #7f8a9f; background: rgba(0,0,0,.16); font-size: .7rem; text-transform: uppercase; letter-spacing: .09em; }
  .piece-code strong { color: #cbd2df; font-family: "SFMono-Regular", Consolas, monospace; font-size: .78rem; letter-spacing: .08em; }
  .actions { position: relative; display: grid; gap: .65rem; margin-top: 1.35rem; }
  .button { min-height: 3.2rem; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: .95rem; text-decoration: none; font-size: .88rem; font-weight: 750; transition: transform .2s ease, border-color .2s ease, background .2s ease; }
  .button.primary { color: #fff; background: linear-gradient(120deg, #4777f5, #5b8cff 55%, #4d74ee); box-shadow: 0 13px 32px rgba(66,108,239,.27), inset 0 1px 0 rgba(255,255,255,.18); }
  .button.secondary { color: #c8d0df; border-color: rgba(255,255,255,.09); background: rgba(255,255,255,.035); }
  .button:hover { transform: translateY(-1px); }
  .button:focus-visible { outline: 3px solid rgba(111,232,255,.4); outline-offset: 3px; }
  .owner { position: relative; margin: 1.1rem .25rem 0; color: #788398; font-size: .72rem; line-height: 1.55; text-align: center; }
  .promise { margin: 1.3rem 0 0; color: #586377; font-size: .67rem; font-weight: 650; letter-spacing: .065em; text-align: center; text-transform: uppercase; }
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
  const primaryHref = opts.configureUrl ? escapeHtml(opts.configureUrl) : "/";
  const primaryLabel = opts.configureUrl ? copy.configure : copy.discover;
  const secondary = opts.configureUrl
    ? `<a class="button secondary" href="/">${escapeHtml(copy.discover)}</a>`
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
    <div class="brand"><img class="brand-mark" src="/api/branding/favicon" alt="" aria-hidden="true" /><span>Xpot</span></div>
    <section class="card" aria-labelledby="page-title">
      <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
      <div class="signal" aria-hidden="true"><span></span><span></span><span></span></div>
      <h1 id="page-title">${escapeHtml(page.title)}</h1>
      <p class="body">${escapeHtml(page.body)}</p>
      <div class="status"><strong>${escapeHtml(page.state)}</strong><small>${escapeHtml(page.detail)}</small><span class="status-dot" aria-hidden="true"></span></div>
      ${code}
      <div class="actions"><a class="button primary" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>${secondary}</div>
      <p class="owner">${escapeHtml(page.owner)}</p>
    </section>
    <p class="promise">${escapeHtml(copy.promise)}</p>
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
    <div class="brand"><img class="brand-mark" src="/api/branding/favicon" alt="" aria-hidden="true" /><span>Xpot</span></div>
    <section class="card" aria-labelledby="page-title">
      <h1 id="page-title">${escapeHtml(copy.title)}</h1>
      <p class="body">${escapeHtml(opts.display)}</p>
      <div class="actions"><a class="button primary" href="${href}" data-testid="contact-action">${escapeHtml(copy.action)}</a></div>
    </section>
  </main>
</body>
</html>`;
}
