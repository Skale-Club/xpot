import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { filtersMessages } from "@/i18n/messages/filters";

// The one way lists grow in the app. Long lists render a page at a time and
// add the next page when you scroll near the end (or press the button), so the
// open row, J/K and the filters keep working as they did. Two sources:
//   - usePagedList: everything is already loaded (leads, visits); only the
//     rendering is paged, so a 2,000-row table doesn't freeze the phone.
//   - useOffsetPages: the server pages (?limit=&offset=); the next page is
//     fetched on demand.
// Both feed <ListPager>, which looks the same everywhere.

export const PAGE_SIZE = 50;

/**
 * Renders `items` a page at a time. The page goes back to the first when
 * `resetKey` changes (a new filter); `keepIndex` (the open row) is always
 * inside the rendered part, so a deep link never opens a row you can't see.
 */
export function usePagedList<T>(
  items: readonly T[],
  { pageSize = PAGE_SIZE, resetKey = "", keepIndex = -1 }: { pageSize?: number; resetKey?: string; keepIndex?: number } = {},
) {
  const [state, setState] = useState({ key: resetKey, count: pageSize });
  const base = state.key === resetKey ? state.count : pageSize;
  const count = Math.max(base, keepIndex + 1);
  const visible: T[] = items.slice(0, count);
  return {
    visible,
    shown: visible.length,
    total: items.length,
    hasMore: items.length > visible.length,
    showMore: () => setState({ key: resetKey, count: count + pageSize }),
  };
}

/**
 * A server list read `pageSize` rows at a time. `url(offset, limit)` builds
 * each request. The last page is the one shorter than `pageSize`.
 */
export function useOffsetPages<T>({
  queryKey,
  url,
  pageSize = PAGE_SIZE,
  enabled = true,
  staleTime,
  fetchPage = async (pageUrl) => (await apiRequest("GET", pageUrl)).json() as Promise<T[]>,
}: {
  queryKey: QueryKey;
  url: (offset: number, limit: number) => string;
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
  /** How a page is read; the Tags admin passes its own getJson (keeps its 403 errors). */
  fetchPage?: (url: string) => Promise<T[]>;
}) {
  const query = useInfiniteQuery({
    // "pages" keeps the cache entry apart from a plain query on the same URL.
    queryKey: [...queryKey, "pages", pageSize],
    queryFn: ({ pageParam }) => fetchPage(url(pageParam, pageSize)),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length < pageSize ? undefined : pages.reduce((sum, page) => sum + page.length, 0)),
    enabled,
    staleTime,
    // Keep the rows on screen while a new filter loads.
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages;
  const items = useMemo(() => pages?.flat() ?? [], [pages]);
  return {
    items,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    hasMore: Boolean(query.hasNextPage),
    loadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

/**
 * Footer of a paged list: "Showing 50 of 340" and a button for the next page.
 * The next page also comes on its own when the footer scrolls into view.
 * Renders nothing when everything fits in one page.
 */
export function ListPager({
  shown,
  total,
  hasMore,
  onMore,
  loading = false,
  pageSize = PAGE_SIZE,
  auto = true,
  className = "",
}: {
  shown: number;
  /** Known for in-memory lists; unknown for server pages. */
  total?: number;
  hasMore: boolean;
  onMore: () => void;
  loading?: boolean;
  pageSize?: number;
  /** Load the next page when the footer comes near the screen. */
  auto?: boolean;
  className?: string;
}) {
  const t = useT(filtersMessages);
  const sentinel = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    const node = sentinel.current;
    if (!auto || !hasMore || loading || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMoreRef.current();
    }, { rootMargin: "400px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [auto, hasMore, loading, shown]);

  if (!hasMore && shown <= pageSize) return null;

  const remaining = total != null ? Math.min(pageSize, total - shown) : null;
  return (
    <div ref={sentinel} className={`flex flex-col items-center gap-2 py-3 sm:flex-row sm:justify-between ${className}`} data-testid="list-pager">
      <span className="text-xs tabular-nums text-white/40" aria-live="polite">
        {total != null
          ? hasMore
            ? t("pagerShowing", { shown, total })
            : t("pagerAll", { total })
          : t.plural("pagerLoaded", shown)}
      </span>
      {hasMore ? (
        <button
          type="button"
          onClick={onMore}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/20 px-3.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/[0.15] hover:bg-white/[0.04] hover:text-white disabled:opacity-60"
          data-testid="list-pager-more"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {loading ? t("pagerLoading") : remaining != null && remaining > 0 ? t("pagerMore", { count: remaining }) : t("pagerLoadMore")}
        </button>
      ) : null}
    </div>
  );
}
