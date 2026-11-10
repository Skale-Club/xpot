import { useMemo, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, Lightbulb } from "lucide-react";
import { isHttpsUrl, parseNotionMarkdown, type NotionBlock } from "@shared/notionMarkdown";
import { parseYouTubeId } from "@shared/academy";
import { GLASS_CLASS } from "@/components/xpot/surface";

// Notion markdown drawn with Xpot's own typography; Notion's colours and fonts are ignored on purpose. Raw HTML is
// never rendered: the known Notion tags are already blocks (parseNotionMarkdown) and react-markdown skips the rest.

const REMARK = [remarkGfm];
const safeHref = (href: string | undefined): href is string => !!href && /^(https?:|mailto:|tel:|\/|#)/i.test(href);

/** react-markdown passes `node`; it never goes to the DOM. */
function strip<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const components: Components = {
  h1: (p) => <h2 className="mb-3 mt-8 text-2xl font-semibold tracking-tight text-white first:mt-0" {...strip(p)} />,
  h2: (p) => <h2 className="mb-3 mt-8 text-xl font-semibold tracking-tight text-white first:mt-0" {...strip(p)} />,
  h3: (p) => <h3 className="mb-2 mt-6 text-lg font-semibold text-white first:mt-0" {...strip(p)} />,
  h4: (p) => <h4 className="mb-2 mt-5 text-base font-semibold text-white first:mt-0" {...strip(p)} />,
  p: (p) => <p className="my-3 leading-7 text-white/80" {...strip(p)} />,
  ul: (p) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-white/40" {...strip(p)} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-white/40" {...strip(p)} />,
  li: (p) => <li className="leading-7 text-white/80" {...strip(p)} />,
  strong: (p) => <strong className="font-semibold text-white" {...strip(p)} />,
  hr: () => <hr className="my-8 border-white/10" />,
  blockquote: (p) => <blockquote className="my-4 border-l-2 border-blue-400/60 pl-4 text-white/60" {...strip(p)} />,
  code: ({ className, children }) => <code className={`rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] ${className ?? ""}`}>{children}</code>,
  pre: (p) => <pre className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0" {...strip(p)} />,
  a: ({ href, children }) =>
    safeHref(href) ? (
      <a href={href} target={href.startsWith("/") || href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer" className="font-medium text-blue-300 underline-offset-4 hover:underline">{children}</a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) =>
    isHttpsUrl(typeof src === "string" ? src : null) ? (
      <img src={src} alt={alt ?? ""} loading="lazy" className="my-5 h-auto max-w-full rounded-xl border border-white/10" />
    ) : null,
  table: (p) => <div className="my-5 overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-sm" {...strip(p)} /></div>,
  thead: (p) => <thead className="bg-white/[0.05]" {...strip(p)} />,
  th: (p) => <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white" {...strip(p)} />,
  td: (p) => <td className="border-b border-white/[0.06] px-3 py-2 align-top text-white/80 last:border-0" {...strip(p)} />,
};

function Markdown({ text, inline = false }: { text: string; inline?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK}
      skipHtml
      components={inline ? { ...components, p: ({ children }: ComponentProps<"p">) => <>{children}</> } : components}
    >
      {text}
    </ReactMarkdown>
  );
}

function Blocks({ blocks }: { blocks: NotionBlock[] }): ReactNode {
  return <>{blocks.map((block, i) => <BlockView key={i} block={block} />)}</>;
}

function BlockView({ block }: { block: NotionBlock }): ReactNode {
  switch (block.type) {
    case "markdown":
      return <Markdown text={block.text} />;

    case "callout":
      return (
        <div className="my-5 flex gap-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.08] p-4" role="note">
          {block.icon && block.icon.length <= 8 ? (
            <span aria-hidden="true" className="text-base leading-6">{block.icon}</span>
          ) : (
            <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
          )}
          <div className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"><Blocks blocks={block.children} /></div>
        </div>
      );

    case "toggle":
      return (
        <details className={`group my-4 rounded-xl ${GLASS_CLASS} px-4 py-1 open:pb-3`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-medium text-white [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-white/45 transition-transform group-open:rotate-90" />
            <span className="min-w-0"><Markdown text={block.summary} inline /></span>
          </summary>
          <div className="pl-6"><Blocks blocks={block.children} /></div>
        </details>
      );

    case "table": {
      const head = block.headerRow ? block.rows[0] ?? null : null;
      const body = block.headerRow ? block.rows.slice(1) : block.rows;
      return (
        <div className="my-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            {head && (
              <thead className="bg-white/[0.05]">
                <tr>{head.map((cell, c) => <th key={c} className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white"><Markdown text={cell} inline /></th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className={`border-b border-white/[0.06] px-3 py-2 align-top text-white/80 last:border-b-0 ${block.headerColumn && c === 0 ? "font-semibold text-white" : ""}`}>
                      <Markdown text={cell} inline />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "video":
    case "embed": {
      if (!isHttpsUrl(block.src)) return null;
      const youtube = parseYouTubeId(block.src);
      if (youtube) {
        return (
          <figure className="my-5">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtube}?rel=0&playsinline=1`}
                title={block.caption || "Video"}
                className="absolute inset-0 h-full w-full"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            {block.caption && <figcaption className="mt-2 text-sm text-white/50">{block.caption}</figcaption>}
          </figure>
        );
      }
      if (block.type === "embed") {
        return <p className="my-3"><a href={block.src} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-blue-300 underline-offset-4 hover:underline">{block.caption || block.src}</a></p>;
      }
      return (
        <figure className="my-5">
          <video src={block.src} controls playsInline preload="metadata" className="h-auto max-w-full rounded-xl border border-white/10" />
          {block.caption && <figcaption className="mt-2 text-sm text-white/50">{block.caption}</figcaption>}
        </figure>
      );
    }
  }
}

export function LessonBody({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseNotionMarkdown(markdown), [markdown]);
  if (!blocks.length) return null;
  return <div data-academy-body className="text-base"><Blocks blocks={blocks} /></div>;
}
