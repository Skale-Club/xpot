// Server-rendered pages for GET /oauth/authorize. Plain HTML, not an SPA
// route: the host lands here mid-flow and the page must render with no bundle
// and no chance of the client router eating the query string.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const SCOPE_LABELS: Record<string, { title: string; detail: string }> = {
  "xpot:journey": {
    title: "Read and write the Tags Journey",
    detail: "Timeline, plans, batches and pieces: read them, record entries and create plans. Entries it marks as proposed wait for an admin.",
  },
};

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en">
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
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 14px; font-weight: 600; }
  .brand img { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; }
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
<body><main class="card"><div class="brand"><img src="/api/branding/favicon" alt="" />Xpot</div>${body}</main></body>
</html>`;

export function renderConsentPage(input: {
  clientName: string;
  /** Host the code goes to. The client name is self-declared; this is not. */
  redirectHost: string;
  userLabel: string;
  scopes: string[];
  /** Replayed as hidden fields so the POST is self-contained. */
  fields: Record<string, string>;
}): string {
  const scopes = input.scopes
    .map((scope) => {
      const label = SCOPE_LABELS[scope] ?? { title: scope, detail: "" };
      return `<li><div class="scope-title">${escapeHtml(label.title)}</div>${label.detail ? `<div class="scope-detail">${escapeHtml(label.detail)}</div>` : ""}</li>`;
    })
    .join("");
  const hidden = Object.entries(input.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join("");
  return layout(
    "Connect an AI app - Xpot",
    `<h1>${escapeHtml(input.clientName)} wants to connect to Xpot</h1>
    <p class="sub">It will act through the MCP tools with your admin permissions.</p>
    <p class="dest">Access goes to <code>${escapeHtml(input.redirectHost)}</code>. Only continue if you started this connection there.</p>
    <ul>${scopes}</ul>
    <div class="who">Connecting as <strong>${escapeHtml(input.userLabel)}</strong>. Revoke it any time in Admin › Tags › Journey › AI access.</div>
    <form method="post" action="/oauth/authorize">
      ${hidden}
      <div class="actions">
        <button class="deny" type="submit" name="decision" value="deny">Deny</button>
        <button class="allow" type="submit" name="decision" value="allow">Allow</button>
      </div>
    </form>`,
  );
}

export function renderErrorPage(title: string, detail: string, hint?: string): string {
  return layout(
    `${title} - Xpot`,
    `<h1 class="error">${escapeHtml(title)}</h1><p class="sub">${escapeHtml(detail)}</p>${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}`,
  );
}
