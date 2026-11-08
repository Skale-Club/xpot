// Notion's enhanced markdown (GET /v1/pages/:id/markdown) split into blocks the app draws with its own components.
// Plain markdown stays markdown (react-markdown + remark-gfm render it, raw HTML is never passed through); the
// Notion tags become typed blocks: callout, toggle (<details> or a toggle heading), table, video, embed, columns
// (flattened). <unknown>, <file>, <audio> and <pdf> are dropped. Children are indented with a tab.

export type NotionBlock =
  | { type: "markdown"; text: string }
  | { type: "callout"; icon: string | null; children: NotionBlock[] }
  | { type: "toggle"; summary: string; children: NotionBlock[] }
  | { type: "table"; headerRow: boolean; headerColumn: boolean; rows: string[][] }
  | { type: "video"; src: string; caption: string }
  | { type: "embed"; src: string; caption: string };

const CONTAINERS = new Set(["callout", "details", "toggle", "columns", "column"]);
const LEAVES = new Set(["video", "embed"]);
const DROPPED = new Set(["unknown", "file", "audio", "pdf"]);
const OPEN = /^\s*<(callout|details|toggle|columns|column|table|video|embed|unknown|file|audio|pdf)\b([^>]*?)(\/)?>(.*)$/;
const TOGGLE_HEADING = /^(#{1,4})\s+(.*?)\s*\{[^}]*\btoggle="true"[^}]*\}\s*$/;

/** Value of an attribute of a tag's attribute text. */
export function tagAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? (m[1] ?? m[2] ?? "") : null;
}

/** Removes one level of tab (or four spaces) indentation. */
function dedent(line: string): string {
  return line.replace(/^(\t| {1,4})/, "");
}

/** Notion-only decoration inside text: block colours, <span color>, <br>. */
export function cleanInline(text: string): string {
  return text
    .replace(/[ \t]*\{(?:[a-z-]+="[^"]*"\s*)+\}[ \t]*$/gm, "")
    .replace(/<\/?span\b[^>]*>/g, "")
    .replace(/<br\s*\/?>/g, "  \n");
}

function findClose(lines: string[], from: number, tag: string): number {
  const open = new RegExp(`<${tag}\\b[^>]*?(?<!/)>`, "g");
  const close = new RegExp(`</${tag}\\s*>`, "g");
  let depth = 0;
  for (let i = from; i < lines.length; i++) {
    const text = lines[i];
    depth += (text.match(open) ?? []).length;
    depth -= (text.match(close) ?? []).length;
    if (depth <= 0) return i;
  }
  return -1;
}

function parseTable(attrs: string, inner: string): NotionBlock {
  const rows: string[][] = [];
  const trs = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let tr: RegExpExecArray | null;
  while ((tr = trs.exec(inner))) {
    const cells: string[] = [];
    const tds = /<td\b[^>]*>([\s\S]*?)<\/td>/g;
    let td: RegExpExecArray | null;
    while ((td = tds.exec(tr[1]))) cells.push(cleanInline(td[1]).replace(/\s*\n\s*/g, " ").trim());
    rows.push(cells);
  }
  return { type: "table", headerRow: tagAttr(attrs, "header-row") === "true", headerColumn: tagAttr(attrs, "header-column") === "true", rows };
}

function flush(out: NotionBlock[], buf: string[]) {
  const text = cleanInline(buf.join("\n")).replace(/^\n+|\n+$/g, "");
  if (text.trim()) out.push({ type: "markdown", text });
  buf.length = 0;
}

/** Splits Notion markdown into blocks. Never throws: what it cannot read stays markdown text. */
export function parseNotionMarkdown(source: string): NotionBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: NotionBlock[] = [];
  const buf: string[] = [];
  let fence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      buf.push(line);
      continue;
    }
    if (fence) {
      buf.push(line);
      continue;
    }

    const toggleHeading = TOGGLE_HEADING.exec(line);
    if (toggleHeading) {
      const children: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1].startsWith("\t") || lines[i + 1].trim() === "")) children.push(dedent(lines[++i]));
      flush(out, buf);
      out.push({ type: "toggle", summary: cleanInline(toggleHeading[2]), children: parseNotionMarkdown(children.join("\n")) });
      continue;
    }

    const open = OPEN.exec(line);
    if (!open) {
      buf.push(line);
      continue;
    }
    const [, tag, attrs, selfClosing, rest] = open;

    if (DROPPED.has(tag) || (LEAVES.has(tag) && selfClosing)) {
      flush(out, buf);
      if (!DROPPED.has(tag)) pushLeaf(out, tag, attrs, "");
      // A dropped block may span lines when it has a closing tag.
      if (!selfClosing) {
        const end = findClose(lines, i, tag);
        if (end > i) i = end;
      }
      continue;
    }

    const end = selfClosing ? i : findClose(lines, i, tag);
    if (end < 0) {
      // Unclosed: keep reading as text rather than swallowing the page.
      buf.push(line);
      continue;
    }
    const inline = end === i;
    let inner: string[];
    if (inline) {
      const m = new RegExp(`^\\s*<${tag}\\b[^>]*>(.*)</${tag}\\s*>\\s*$`).exec(line);
      inner = m ? [m[1]] : [rest];
    } else {
      const closeLine = lines[end];
      const before = closeLine.slice(0, closeLine.search(new RegExp(`</${tag}\\s*>`)));
      inner = [...(rest.trim() ? [rest] : []), ...lines.slice(i + 1, end), ...(before.trim() ? [before] : [])];
    }
    flush(out, buf);

    if (tag === "table") {
      out.push(parseTable(attrs, inner.join("\n")));
    } else if (LEAVES.has(tag)) {
      pushLeaf(out, tag, attrs, inner.join(" "));
    } else if (tag === "callout") {
      out.push({ type: "callout", icon: tagAttr(attrs, "icon"), children: parseNotionMarkdown(inner.map(dedent).join("\n")) });
    } else if (tag === "details" || tag === "toggle") {
      const text = inner.join("\n");
      const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text);
      const body = text.replace(/<summary>[\s\S]*?<\/summary>/, "");
      const title = summary ? summary[1] : tagAttr(attrs, "title") ?? "";
      out.push({ type: "toggle", summary: cleanInline(title).trim(), children: parseNotionMarkdown(body.split("\n").map(dedent).join("\n")) });
    } else if (CONTAINERS.has(tag)) {
      // columns / column: read one after the other.
      out.push(...parseNotionMarkdown(inner.map(dedent).join("\n")));
    }
    i = end;
  }
  flush(out, buf);
  return out;
}

function pushLeaf(out: NotionBlock[], tag: string, attrs: string, caption: string) {
  const src = tagAttr(attrs, "src") ?? tagAttr(attrs, "source") ?? tagAttr(attrs, "url");
  if (!src) return;
  out.push({ type: tag === "video" ? "video" : "embed", src, caption: cleanInline(caption).trim() });
}

/** Whether a URL may be put in an <img>, <video> or <iframe>: https only. */
export function isHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
