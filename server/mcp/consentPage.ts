// Server-rendered pages for GET /oauth/authorize. Plain HTML, not an SPA
// route: the host lands here mid-flow and the page must render with no bundle
// and no chance of the client router eating the query string.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export type ConsentLang = "en" | "pt" | "es";

const CONSENT_LANGS: readonly ConsentLang[] = ["en", "pt", "es"];
const HTML_LANG: Record<ConsentLang, string> = { en: "en", pt: "pt-BR", es: "es" };

/**
 * The page's language from the browser's Accept-Language header: the
 * best-weighted tag whose base is a language the app speaks, else English.
 * The app keeps its language choice on the device, so the header is the only
 * signal the server has.
 */
export function consentLang(acceptLanguage: string | undefined | null): ConsentLang {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.base && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const hit = ranked.find((entry) => (CONSENT_LANGS as readonly string[]).includes(entry.base));
  return (hit?.base as ConsentLang | undefined) ?? "en";
}

const SCOPE_LABELS: Record<string, Record<ConsentLang, { title: string; detail: string }>> = {
  "xpot:journey": {
    en: {
      title: "Read and record the Tags production log",
      detail: "Timeline, plans, batches and pieces: read them, record entries and create plans. Entries it marks as proposed wait for an admin. Also the print catalog and queue: models, recipe versions and print orders.",
    },
    pt: {
      title: "Ler e registrar o diário de produção das Tags",
      detail: "Linha do tempo, planos, lotes e peças: ler, registrar entradas e criar planos. As entradas que ele marcar como propostas esperam um admin. Também o catálogo e a fila de impressão: modelos, versões das receitas e ordens de impressão.",
    },
    es: {
      title: "Leer y registrar el diario de producción de Tags",
      detail: "Línea de tiempo, planes, lotes y piezas: leerlos, registrar entradas y crear planes. Las entradas que marque como propuestas esperan a un admin. También el catálogo y la cola de impresión: modelos, versiones de las recetas y órdenes de impresión.",
    },
  },
  "xpot:prospecting": {
    en: {
      title: "Create and follow your Xpot prospecting searches",
      detail: "Start cold-prospecting discovery jobs and read their progress and ranked candidates for your own Xpot representative profile.",
    },
    pt: {
      title: "Criar e acompanhar suas buscas de prospecção no Xpot",
      detail: "Iniciar buscas de prospecção e ler o andamento e os candidatos ordenados, no seu próprio perfil de vendedor do Xpot.",
    },
    es: {
      title: "Crear y seguir tus búsquedas de prospección en Xpot",
      detail: "Iniciar búsquedas de prospección y leer su avance y los candidatos ordenados, en tu propio perfil de vendedor de Xpot.",
    },
  },
  "xpot:tasks": {
    en: {
      title: "Manage your Xpot tasks",
      detail: "List, create, edit, assign, start, complete, reopen, and cancel tasks within the Organizations you can access.",
    },
    pt: {
      title: "Gerenciar suas tarefas do Xpot",
      detail: "Listar, criar, editar, atribuir, iniciar, concluir, reabrir e cancelar tarefas nas Organizações a que você tem acesso.",
    },
    es: {
      title: "Gestionar tus tareas de Xpot",
      detail: "Listar, crear, editar, asignar, iniciar, completar, reabrir y cancelar tareas en las Organizaciones a las que tienes acceso.",
    },
  },
};

const CONSENT_COPY: Record<ConsentLang, {
  pageTitle: string;
  heading: string;
  sub: string;
  dest: string;
  who: string;
  deny: string;
  allow: string;
  anApp: string;
  yourAccount: string;
}> = {
  en: {
    pageTitle: "Connect an AI app - Xpot",
    heading: "{client} wants to connect to Xpot",
    sub: "It will act through the MCP tools with only the permissions shown below.",
    dest: "Access goes to {host}. Only continue if you started this connection there.",
    who: "Connecting as {user}. Revoke it any time in Integrations › AI assistants.",
    deny: "Deny",
    allow: "Allow",
    anApp: "An MCP app",
    yourAccount: "your account",
  },
  pt: {
    pageTitle: "Conectar um app de IA - Xpot",
    heading: "{client} quer se conectar ao Xpot",
    sub: "Ele vai agir pelas ferramentas MCP, só com as permissões abaixo.",
    dest: "O acesso vai para {host}. Só continue se você começou esta conexão lá.",
    who: "Conectando como {user}. Revogue quando quiser em Integrações › Assistentes de IA.",
    deny: "Negar",
    allow: "Permitir",
    anApp: "Um app MCP",
    yourAccount: "sua conta",
  },
  es: {
    pageTitle: "Conectar una app de IA - Xpot",
    heading: "{client} quiere conectarse a Xpot",
    sub: "Actuará mediante las herramientas MCP, solo con los permisos de abajo.",
    dest: "El acceso va a {host}. Continúa solo si iniciaste esta conexión allí.",
    who: "Conectando como {user}. Revócalo cuando quieras en Integraciones › Asistentes de IA.",
    deny: "Denegar",
    allow: "Permitir",
    anApp: "Una app MCP",
    yourAccount: "tu cuenta",
  },
};

/** Every page the authorize endpoint can refuse with. */
export type ConsentErrorKey = "invalidRequest" | "appUnknown" | "appMismatch" | "accessDenied" | "sessionExpired" | "requestExpired";

const ERROR_COPY: Record<ConsentLang, Record<ConsentErrorKey, { title: string; detail: string; hint?: string }>> = {
  en: {
    invalidRequest: { title: "Invalid request", detail: "The authorization request is missing client_id or redirect_uri." },
    appUnknown: {
      title: "App not recognised",
      detail: "That client_id does not exist, or the redirect URL is not registered for it.",
      hint: "Remove the Xpot connector in the AI app and add it again.",
    },
    appMismatch: { title: "App not recognised", detail: "The redirect URL does not match the registered app." },
    accessDenied: { title: "Access not allowed", detail: "" },
    sessionExpired: { title: "Session expired", detail: "Sign in to Xpot again and restart the connection." },
    requestExpired: { title: "Request expired", detail: "This authorization form is no longer valid. Restart the connection." },
  },
  pt: {
    invalidRequest: { title: "Pedido inválido", detail: "O pedido de autorização não traz client_id ou redirect_uri." },
    appUnknown: {
      title: "App não reconhecido",
      detail: "Esse client_id não existe, ou o endereço de retorno não está registrado para ele.",
      hint: "Remova o conector do Xpot no app de IA e adicione de novo.",
    },
    appMismatch: { title: "App não reconhecido", detail: "O endereço de retorno não corresponde ao app registrado." },
    accessDenied: { title: "Acesso não permitido", detail: "" },
    sessionExpired: { title: "Sessão expirada", detail: "Entre no Xpot de novo e recomece a conexão." },
    requestExpired: { title: "Pedido expirado", detail: "Este formulário de autorização não vale mais. Recomece a conexão." },
  },
  es: {
    invalidRequest: { title: "Solicitud no válida", detail: "A la solicitud de autorización le falta client_id o redirect_uri." },
    appUnknown: {
      title: "App no reconocida",
      detail: "Ese client_id no existe, o la URL de retorno no está registrada para él.",
      hint: "Quita el conector de Xpot en la app de IA y agrégalo de nuevo.",
    },
    appMismatch: { title: "App no reconocida", detail: "La URL de retorno no coincide con la app registrada." },
    accessDenied: { title: "Acceso no permitido", detail: "" },
    sessionExpired: { title: "Sesión vencida", detail: "Vuelve a iniciar sesión en Xpot y reinicia la conexión." },
    requestExpired: { title: "Solicitud vencida", detail: "Este formulario de autorización ya no es válido. Reinicia la conexión." },
  },
};

/** Why an account cannot approve or keep a connection (journeyAdminRefusal in oauth.ts). */
export type JourneyRefusal = "accountGone" | "noProfile" | "blocked" | "pending" | "notAdmin" | "signedOut";

const REFUSAL_COPY: Record<ConsentLang, Record<JourneyRefusal, string>> = {
  en: {
    accountGone: "The account that approved this connection no longer exists.",
    noProfile: "This account has no Xpot profile.",
    blocked: "Your Xpot access is turned off. Contact Skale Club.",
    pending: "Your sign-up is being reviewed. Skale Club will turn on your access.",
    notAdmin: "Only Xpot admins can connect AI apps to the journey.",
    signedOut: "Sign in again.",
  },
  pt: {
    accountGone: "A conta que aprovou esta conexão não existe mais.",
    noProfile: "Esta conta não tem perfil no Xpot.",
    blocked: "Seu acesso ao Xpot está desligado. Fale com a Skale Club.",
    pending: "Seu cadastro está em análise. A Skale Club vai liberar seu acesso.",
    notAdmin: "Só admins do Xpot podem conectar apps de IA ao diário de produção.",
    signedOut: "Entre de novo.",
  },
  es: {
    accountGone: "La cuenta que aprobó esta conexión ya no existe.",
    noProfile: "Esta cuenta no tiene perfil en Xpot.",
    blocked: "Tu acceso a Xpot está desactivado. Contacta a Skale Club.",
    pending: "Tu registro está en revisión. Skale Club activará tu acceso.",
    notAdmin: "Solo los admins de Xpot pueden conectar apps de IA al diario de producción.",
    signedOut: "Vuelve a iniciar sesión.",
  },
};

/** A refusal reason as text; English for the JSON answers MCP clients read. */
export function journeyRefusalMessage(code: JourneyRefusal, lang: ConsentLang = "en"): string {
  return REFUSAL_COPY[lang][code];
}

/** Escapes a template, then fills its {slots} with HTML the caller escaped. */
function fill(template: string, vars: Record<string, string>): string {
  return escapeHtml(template).replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

const layout = (lang: ConsentLang, title: string, body: string) => `<!doctype html>
<html lang="${HTML_LANG[lang]}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px 16px; color: #fff; background: linear-gradient(160deg, #060912 0%, #090f1c 50%, #060c14 100%);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: 100%; max-width: 420px; border-radius: 20px; padding: 28px 24px;
    border: 1px solid rgba(255,255,255,0.10); background: rgba(15,23,42,0.85);
    box-shadow: 0 24px 60px rgba(0,0,0,0.45);
  }
  .brand { display: flex; align-items: center; margin-bottom: 20px; }
  .brand img { display: block; width: auto; height: 34px; object-fit: contain; }
  h1 { margin: 0 0 6px; font-size: 19px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
  .sub { margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.55); }
  .dest { margin: 0 0 16px; font-size: 12px; color: rgba(255,255,255,0.55); }
  .dest code { color: rgba(255,255,255,0.85); overflow-wrap: anywhere; }
  ul { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 10px; }
  li { border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px; background: rgba(255,255,255,0.03); }
  .scope-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .scope-detail { font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.45; }
  .who { font-size: 12px; color: rgba(255,255,255,0.55); margin-bottom: 18px; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 14px; }
  .who strong { color: rgba(255,255,255,0.85); font-weight: 600; }
  .actions { display: flex; gap: 10px; }
  button { flex: 1; border-radius: 14px; padding: 12px 14px; font: inherit; font-size: 14px; font-weight: 600; border: 1px solid transparent; cursor: pointer; }
  .allow { background: linear-gradient(135deg, #3b82f6, #6366f1); color: #fff; }
  .deny { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.10); color: rgba(255,255,255,0.75); }
  .error { color: #fca5a5; }
  .hint { margin: 0; font-size: 12px; line-height: 1.5; border-radius: 12px; padding: 10px 12px; border: 1px solid rgba(245,158,11,0.25); background: rgba(245,158,11,0.08); color: #fcd34d; }
</style>
</head>
<body><main class="card"><div class="brand"><img src="/api/branding/logo" alt="Xpot" /></div>${body}</main></body>
</html>`;

export function renderConsentPage(input: {
  lang: ConsentLang;
  /** Self-declared by the app; empty when it gave none. */
  clientName: string | null;
  /** Host the code goes to. The client name is self-declared; this is not. */
  redirectHost: string;
  userLabel: string | null;
  scopes: string[];
  /** Replayed as hidden fields so the POST is self-contained. */
  fields: Record<string, string>;
}): string {
  const copy = CONSENT_COPY[input.lang];
  const scopes = input.scopes
    .map((scope) => {
      const label = SCOPE_LABELS[scope]?.[input.lang] ?? { title: scope, detail: "" };
      return `<li><div class="scope-title">${escapeHtml(label.title)}</div>${label.detail ? `<div class="scope-detail">${escapeHtml(label.detail)}</div>` : ""}</li>`;
    })
    .join("");
  const hidden = Object.entries(input.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join("");
  return layout(
    input.lang,
    copy.pageTitle,
    `<h1>${fill(copy.heading, { client: escapeHtml(input.clientName || copy.anApp) })}</h1>
    <p class="sub">${escapeHtml(copy.sub)}</p>
    <p class="dest">${fill(copy.dest, { host: `<code>${escapeHtml(input.redirectHost)}</code>` })}</p>
    <ul>${scopes}</ul>
    <div class="who">${fill(copy.who, { user: `<strong>${escapeHtml(input.userLabel || copy.yourAccount)}</strong>` })}</div>
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <div class="actions">
        <button class="deny" type="submit" name="decision" value="deny">${escapeHtml(copy.deny)}</button>
        <button class="allow" type="submit" name="decision" value="allow">${escapeHtml(copy.allow)}</button>
      </div>
    </form>`,
  );
}

/** A refusal page; on the access-denied page `refusal` says why. */
export function renderErrorPage(lang: ConsentLang, key: ConsentErrorKey, refusal?: JourneyRefusal): string {
  const { title, detail, hint } = ERROR_COPY[lang][key];
  const text = refusal ? REFUSAL_COPY[lang][refusal] : detail;
  return layout(
    lang,
    `${title} - Xpot`,
    `<h1 class="error">${escapeHtml(title)}</h1><p class="sub">${escapeHtml(text)}</p>${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}`,
  );
}
