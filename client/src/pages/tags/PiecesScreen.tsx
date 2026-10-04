import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Package, Search } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, shortUrl, tagPath, tagsGet } from "./lib";
import { CARD, INPUT, Pill, STATUS_TONE, Spinner, TopBar } from "./ui";

const FILTERS = [
  { id: "all", status: null, key: "filterAll" },
  { id: "stock", status: "inventory", key: "filterStock" },
  { id: "active", status: "active", key: "filterActive" },
  { id: "off", status: "disabled", key: "filterOff" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/** The reseller's own pieces: kit stock, live and switched off. */
export default function PiecesScreen() {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const status = FILTERS.find((f) => f.id === filter)?.status ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["tags", "list", status],
    queryFn: () => tagsGet<TagListItem[]>(`/api/xpot/tags${status ? `?status=${status}` : ""}`),
    staleTime: 15_000,
  });

  const query = search.trim().toLowerCase();
  const items = useMemo(() => {
    const list = data ?? [];
    if (!query) return list;
    return list.filter((tag) => [tag.publicCode, tag.leadName, tag.label].some((v) => v?.toLowerCase().includes(query)));
  }, [data, query]);

  return (
    <>
      <TopBar title={t("piecesTitle")} eyebrow={data ? t.plural("pieces", data.length) : undefined} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPieces")}
          className={`${INPUT} pl-10`}
          data-testid="input-pieces-search"
        />
      </div>

      <div role="tablist" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors ${
              filter === f.id ? "bg-blue-500/25 text-white" : "border border-white/10 text-white/50 active:bg-white/10"
            }`}
            data-testid={`filter-${f.id}`}
          >
            {t(f.key)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex justify-center py-16 text-white/40">
            <Spinner className="h-7 w-7" />
          </div>
        ) : error ? (
          <div className={`${CARD} px-6 py-8 text-center text-sm text-red-200`}>{errorText(error, tc("requestFailed"))}</div>
        ) : items.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}>
            <Package className="h-8 w-8 text-white/25" />
            <p className="mt-2 text-sm text-white/45">{(data ?? []).length === 0 && filter === "all" ? t("piecesEmpty") : t("piecesNoMatch")}</p>
          </div>
        ) : (
          <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`} data-testid="pieces-list">
            {items.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => navigate(tagPath(tag.publicCode))}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/10"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-base font-semibold tracking-[0.12em] text-white">{tag.publicCode}</span>
                      <Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-white/45">
                      {[tag.leadName ?? t(`product_${tag.productType}` as "product_custom"), tag.label, tag.destinationUrl && shortUrl(tag.destinationUrl)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {tag.status === "active" && (
                    <span className="shrink-0 text-right text-xs text-white/40 tabular-nums">{tag.qrInteractions + tag.nfcInteractions}</span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
