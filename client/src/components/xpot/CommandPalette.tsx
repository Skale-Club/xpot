import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, CornerDownLeft, Search, Tag, type LucideIcon } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useXpotModules } from "@/components/ModuleSwitch";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsGet } from "@/pages/tags/lib";
import type { FullSalesLead } from "@/pages/xpot/types";

type Entry = { key: string; group: string; label: string; sub?: string; icon: LucideIcon; href: string };

const LIMIT_PER_GROUP = 8;

/** Ctrl/⌘+K: jump to a page, a company or a piece. Desktop only. */
export function CommandPalette({
  open,
  onOpenChange,
  pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screens to jump to; `group` names the module they belong to (current module first). */
  pages: Array<{ href: string; label: string; icon: LucideIcon; group?: string }>;
}) {
  const t = useT(shellMessages);
  const [, navigate] = useLocation();
  const modules = useXpotModules();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Same keys as the Leads and Pieces screens, so an already loaded list is reused.
  const { data: leads } = useQuery<FullSalesLead[]>({
    queryKey: ["/api/xpot/leads"],
    enabled: open && modules.includes("visits"),
  });
  const { data: pieces } = useQuery({
    queryKey: ["tags", "list", null, null],
    // "My pieces", as on the Pieces screen (same key); every piece is in Tags › Manage.
    queryFn: () => tagsGet<TagListItem[]>("/api/xpot/tags?mine=1"),
    enabled: open && modules.includes("tags"),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const hit = (...values: Array<string | null | undefined>) => !q || values.some((v) => v?.toLowerCase().includes(q));
    const out: Entry[] = [];
    pages
      .filter((p) => hit(p.label))
      .forEach((p) => out.push({ key: `page:${p.href}`, group: p.group ?? t("groupPages"), label: p.label, icon: p.icon, href: p.href }));
    if (q) {
      (leads ?? [])
        .filter((l) => hit(l.name, l.industry, l.phone, l.locations?.[0]?.city))
        .slice(0, LIMIT_PER_GROUP)
        .forEach((l) =>
          out.push({
            key: `lead:${l.id}`,
            group: t("groupCompanies"),
            label: l.name,
            sub: [l.locations?.[0]?.city, l.industry].filter(Boolean).join(" · "),
            icon: Building2,
            href: `/leads/${l.id}`,
          }),
        );
      (pieces ?? [])
        .filter((p) => hit(p.publicCode, p.leadName, p.label))
        .slice(0, LIMIT_PER_GROUP)
        .forEach((p) =>
          out.push({
            key: `piece:${p.id}`,
            group: t("groupPieces"),
            label: p.publicCode,
            sub: [p.leadName, p.label].filter(Boolean).join(" · "),
            icon: Tag,
            href: `/tags/pieces/${encodeURIComponent(p.publicCode)}`,
          }),
        );
    }
    return out;
  }, [query, pages, leads, pieces, t]);

  useEffect(() => setIndex(0), [query]);
  // Results can shrink or grow while lists load; keep the highlight on a real row.
  useEffect(() => setIndex((i) => Math.max(0, Math.min(i, entries.length - 1))), [entries.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onOpenChange(false);
    navigate(entry.href);
  };

  let lastGroup = "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15vh] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl border-white/10 p-0 [&>button]:hidden"
        style={{ background: "#0d1322" }}
      >
        <DialogTitle className="sr-only">{t("searchEverything")}</DialogTitle>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.max(0, Math.min(entries.length - 1, i + 1))); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); go(entries[index]); }
            }}
            placeholder={t("palettePlaceholder")}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={entries[index] ? `command-palette-${index}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/30 focus:outline-none"
            data-testid="command-palette-input"
          />
        </div>
        <div ref={listRef} id="command-palette-list" className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-white/35">{t("paletteEmpty")}</p>
          ) : (
            entries.map((entry, i) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              const Icon = entry.icon;
              return (
                <div key={entry.key}>
                  {header && <div role="presentation" className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    id={`command-palette-${i}`}
                    aria-selected={i === index}
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => go(entry)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === index ? "bg-blue-500/15" : ""}`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${i === index ? "text-blue-300" : "text-white/35"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold text-white ${entry.group === t("groupPieces") ? "font-mono tracking-[0.1em]" : ""}`}>{entry.label}</span>
                      {entry.sub && <span className="block truncate text-xs text-white/40">{entry.sub}</span>}
                    </span>
                    {i === index && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-white/35" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-white/[0.08] px-4 py-2 text-[11px] text-white/30">
          {t("paletteHint")} · {t("shortcutsHint")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
