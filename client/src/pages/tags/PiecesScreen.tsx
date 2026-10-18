import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Nfc, Package, ScanLine, Shapes } from "lucide-react";
import { matchesPieceFilters, parsePieceFilters, type PieceSaleFilter, type PieceStatusFilter } from "@shared/tagApp";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToken } from "@/components/xpot/filters";
import { currentSearch, useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, usePagedList } from "@/components/xpot/pagination";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ACCENT_SELECTED, GLASS_SUBTLE_CLASS, TABLE_HEAD } from "@/components/xpot/surface";
import TagScreen from "./TagScreen";
import type { TagListItem } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { APP_BASE, errorText, shortUrl, tagPath, tagsGet } from "./lib";
import { CARD, ChipMark, PieceStatusPills, ScanCounts, TopBar } from "./ui";
import { WholesaleCard } from "./WholesaleCard";

// Two separate axes: where the piece is in its life, and whether a sale was recorded.
const STATUS_CHIPS: ReadonlyArray<{ id: PieceStatusFilter; key: "filterAll" | "filterSetup" | "filterActive" | "filterOff" }> = [
  { id: "all", key: "filterAll" },
  { id: "setup", key: "filterSetup" },
  { id: "active", key: "filterActive" },
  { id: "off", key: "filterOff" },
];
const SALE_CHIPS: ReadonlyArray<{ id: PieceSaleFilter; key: "filterAll" | "filterSold" | "filterUnsold" }> = [
  { id: "all", key: "filterAll" },
  { id: "sold", key: "filterSold" },
  { id: "unsold", key: "filterUnsold" },
];

type ScanFilter = "all" | "with" | "without";

const CHIP_ROW_LABEL = "w-14 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-white/35 lg:w-auto";

/** The list endpoint's ceiling: everything a reseller holds fits under it. */
const LIST_LIMIT = 2000;

/** The reseller's own pieces: kit stock, live and switched off. */
export default function PiecesScreen({ selectedCode = null }: { selectedCode?: string | null }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const isDesktop = useIsDesktop();
  // Moving between pieces and closing replace history; only the first open pushes.
  const openPiece = (code: string) =>
    isDesktop
      ? navigate(`${APP_BASE}/pieces/${encodeURIComponent(code)}${currentSearch()}`, { replace: selectedCode != null })
      : navigate(tagPath(code));
  const closePiece = useCallback(() => navigate(`${APP_BASE}/pieces${currentSearch()}`, { replace: true }), [navigate]);
  // Every filter lives in the URL. ?lead=<id>&name=<name> is one customer's
  // pieces, opened from a customer card.
  // ?chip=missing is the dashboard's "chip not written" alert.
  const filters = useUrlFilters({ status: "all", sale: "all", chip: "", q: "", company: "", face: "", scan: "all", lead: "", name: "" });
  const pieceFilters = parsePieceFilters(filters.values);
  const search = filters.values.q;
  const companyFilter = filters.values.company;
  const faceFilter = filters.values.face;
  const scanFilter: ScanFilter = filters.values.scan === "with" || filters.values.scan === "without" ? filters.values.scan : "all";
  const leadId = Number(filters.values.lead);
  const leadFilter = Number.isInteger(leadId) && leadId > 0 ? { id: leadId, name: filters.values.name } : null;

  const { data, isLoading, error, refetch } = useQuery({
    // Every status at once (filtered here): "Not set up" spans two of them.
    queryKey: ["tags", "list", null, leadFilter?.id ?? null],
    queryFn: () => {
      // "My pieces": the viewer's own, even for an admin who can reach every piece.
      const params = new URLSearchParams({ mine: "1", limit: String(LIST_LIMIT) });
      if (leadFilter) params.set("leadId", String(leadFilter.id));
      return tagsGet<TagListItem[]>(`/api/xpot/tags?${params}`);
    },
    staleTime: 15_000,
    // Keep the table while a new filter loads, so the open piece stays put.
    placeholderData: (previous) => previous,
  });

  const query = search.trim().toLocaleLowerCase();
  const companyOptions = useMemo(() => {
    const companies = new Map<number, string>();
    for (const tag of data ?? []) {
      if (tag.leadId && tag.leadName) companies.set(tag.leadId, tag.leadName);
    }
    return Array.from(companies, ([value, label]) => ({ value: String(value), label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);
  const faceOptions = useMemo(() => {
    const faces = Array.from(new Set((data ?? []).map((tag) => tag.face).filter((face): face is string => Boolean(face))));
    return faces
      .map((face) => ({ value: face, label: t(`face_${face}` as "face_none") }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, t]);
  const items = useMemo(() => {
    const list = data ?? [];
    return list.filter((tag) => {
      if (!matchesPieceFilters(tag, pieceFilters)) return false;
      if (query && ![tag.publicCode, tag.leadName, tag.label].some((v) => v?.toLocaleLowerCase().includes(query))) return false;
      if (companyFilter && String(tag.leadId) !== companyFilter) return false;
      if (faceFilter && tag.face !== faceFilter) return false;
      const scans = tag.qrInteractions + tag.nfcInteractions;
      if (scanFilter === "with" && scans === 0) return false;
      if (scanFilter === "without" && scans > 0) return false;
      return true;
    });
  }, [companyFilter, data, faceFilter, pieceFilters.status, pieceFilters.sale, pieceFilters.chip, query, scanFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasListFilters = filters.activeCount(["status", "sale", "chip", "q", "company", "face", "scan", "lead"]) > 0;
  // Render 50 rows at a time; the open piece always stays on the page.
  const paged = usePagedList(items, {
    resetKey: JSON.stringify(filters.values),
    keepIndex: selectedCode ? items.findIndex((tag) => tag.publicCode.toUpperCase() === selectedCode.toUpperCase()) : -1,
  });
  const pager = <ListPager shown={paged.shown} total={paged.total} hasMore={paged.hasMore} onMore={paged.showMore} />;

  const listLoading = <ListSkeleton rows={6} rowClassName="h-[88px] rounded-2xl" />;
  const listError = <ErrorState message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />;
  const listEmpty = (
    <EmptyState tone="tags" icon={Package} title={(data ?? []).length === 0 && !hasListFilters ? t("piecesEmpty") : t("piecesNoMatch")} />
  );

  return (
    <>
      <div className="lg:hidden">
        <TopBar title={t("piecesTitle")} eyebrow={data ? t.plural("pieces", data.length) : undefined} />
      </div>

      <FilterBar
        testId="pieces-filters"
        search={<FilterSearch value={search} onChange={(q) => filters.set({ q })} placeholder={t("searchPieces")} testId="input-pieces-search" />}
        controls={
          <>
            <FilterSelect
              value={companyFilter}
              onChange={(company) => filters.set({ company })}
              placeholder={t("filterAllCompanies")}
              icon={Building2}
              options={companyOptions}
              testId="filter-company"
            />
            <FilterSelect
              value={faceFilter}
              onChange={(face) => filters.set({ face })}
              placeholder={t("filterAllChannels")}
              icon={Shapes}
              options={faceOptions}
              testId="filter-face"
            />
            <FilterSelect
              value={scanFilter === "all" ? "" : scanFilter}
              onChange={(scan) => filters.set({ scan })}
              placeholder={t("filterAnyActivity")}
              icon={ScanLine}
              options={[
                { value: "with", label: t("filterWithScans") },
                { value: "without", label: t("filterWithoutScans") },
              ]}
              testId="filter-scan-activity"
            />
            <FilterSelect
              value={pieceFilters.chip === "missing" ? "missing" : ""}
              onChange={(chip) => filters.set({ chip })}
              placeholder={t("filterAnyChip")}
              icon={Nfc}
              options={[{ value: "missing", label: t("filterChipMissing") }]}
              testId="filter-chip"
            />
          </>
        }
        secondary={
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            {leadFilter ? (
              <FilterToken
                label={t("piecesOf", { name: leadFilter.name || `#${leadFilter.id}` })}
                onRemove={() => filters.set({ lead: null, name: null })}
                testId="lead-filter"
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className={CHIP_ROW_LABEL} aria-hidden="true">{t("filterStatusGroup")}</span>
                <div className="min-w-0 flex-1">
                  <FilterChips
                    items={STATUS_CHIPS.map((f) => ({ id: f.id, label: t(f.key), testId: `filter-${f.id}` }))}
                    value={pieceFilters.status}
                    onChange={(status) => filters.set({ status })}
                    ariaLabel={t("filterStatusGroup")}
                  />
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <span className={CHIP_ROW_LABEL} aria-hidden="true">{t("filterSaleGroup")}</span>
                <div className="min-w-0 flex-1">
                  <FilterChips
                    items={SALE_CHIPS.map((f) => ({ id: f.id, label: t(f.key), testId: `filter-sale-${f.id}` }))}
                    value={pieceFilters.sale}
                    onChange={(sale) => filters.set({ sale })}
                    ariaLabel={t("filterSaleGroup")}
                  />
                </div>
              </div>
            </div>
          </div>
        }
        summary={{
          shown: items.length,
          total: data?.length,
          active: hasListFilters,
          onClear: () => filters.reset(),
        }}
      />

      {(data?.length ?? 0) >= LIST_LIMIT ? <p className="mt-2 px-1 text-xs text-white/40">{t("piecesListCapped", { limit: LIST_LIMIT })}</p> : null}

      <div className="mt-4">
        {isDesktop ? (
          // The pane stays mounted whatever the list shows (loading, empty, error).
          <MasterDetail
            popup
            closeLabel={t("closePane")}
            onClose={closePiece}
            list={isLoading ? listLoading : error ? listError : items.length === 0 ? listEmpty : (
              <>
                <PiecesTable items={paged.visible} selectedCode={selectedCode} onSelect={openPiece} onCustomer={(id) => navigate(`${APP_BASE}/customers/${id}`)} />
                {pager}
              </>
            )}
            detail={selectedCode ? <TagScreen key={selectedCode} code={selectedCode} onClose={closePiece} /> : null}
          />
        ) : isLoading ? (
          listLoading
        ) : error ? (
          listError
        ) : items.length === 0 ? (
          listEmpty
        ) : (
          <>
          <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`} data-testid="pieces-list">
            {paged.visible.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => openPiece(tag.publicCode)}
                  className="flex min-h-[88px] w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10"
                >
                  <span className="min-w-0 flex-1">
                    <TagPieceMention
                      publicCode={tag.publicCode}
                      productType={tag.productType}
                      face={tag.face}
                      batchCode={tag.batchCode}
                      customer={tag.leadName}
                      className="w-full"
                    />
                    {(tag.label || tag.destinationUrl) && (
                      <span className="mt-1 block truncate pl-12 text-xs text-white/35">
                        {[tag.label, tag.destinationUrl && shortUrl(tag.destinationUrl)].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex flex-wrap justify-end gap-1">
                      <PieceStatusPills tag={tag} />
                      <ChipMark tag={tag} />
                    </span>
                    {/* All-time scans, live or not: a switched-off piece keeps what it had. The same counts as the desktop table. */}
                    {tag.qrInteractions + tag.nfcInteractions > 0 && <ScanCounts qr={tag.qrInteractions} nfc={tag.nfcInteractions} />}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                </button>
              </li>
            ))}
          </ul>
          {pager}
          </>
        )}
      </div>

      <div className="mt-6">
        <WholesaleCard />
      </div>
    </>
  );
}

/** Desktop list of pieces: what it is and whose on the left, its state on the right. */
function PiecesTable({ items, selectedCode, onSelect, onCustomer }: {
  items: TagListItem[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  /** Opens the customer's page. */
  onCustomer: (leadId: number) => void;
}) {
  const t = useT(tagsMessages);
  return (
    <div className={`overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
      <table className="w-full table-fixed text-left text-sm" data-testid="pieces-table">
        <colgroup>
          <col className="w-56" />
          <col />
          <col />
          <col className="w-28" />
          <col className="w-28" />
        </colgroup>
        <thead className={`border-b border-white/[0.07] ${TABLE_HEAD}`}>
          <tr>
            <th className="whitespace-nowrap py-3 pl-4 pr-3 font-semibold">{t("colCode")}</th>
            <th className="px-3 py-3 font-semibold">{t("colCustomer")}</th>
            <th className="px-3 py-3 font-semibold">{t("colLink")}</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">{t("colStatus")}</th>
            <th className="whitespace-nowrap py-3 pl-3 pr-4 text-right font-semibold">{t("colScans")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {items.map((tag) => {
            const selected = selectedCode?.toUpperCase() === tag.publicCode.toUpperCase();
            return (
              <tr
                key={tag.id}
                tabIndex={0}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(tag.publicCode)}
                onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(tag.publicCode); } }}
                className={`cursor-pointer transition-colors focus-visible:bg-white/[0.05] focus-visible:!-outline-offset-2 ${selected ? ACCENT_SELECTED.tags.row : "hover:bg-white/[0.03]"}`}
                data-testid={`piece-row-${tag.publicCode}`}
              >
                <td className="py-2.5 pl-4 pr-3">
                  <TagPieceMention publicCode={tag.publicCode} productType={tag.productType} face={tag.face} batchCode={tag.batchCode} className="max-w-full" />
                </td>
                <td className="px-3 py-2.5">
                  {tag.leadId && tag.leadName ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCustomer(tag.leadId!); }}
                      title={t("openCustomer", { name: tag.leadName })}
                      className="group inline-flex max-w-full items-center gap-1.5 rounded-md text-left font-medium text-white/90 hover:text-violet-300"
                      data-testid={`piece-customer-${tag.publicCode}`}
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-white/30 group-hover:text-violet-300" />
                      <span className="truncate group-hover:underline">{tag.leadName}</span>
                    </button>
                  ) : (
                    <span className="text-white/35">{t("noCustomer")}</span>
                  )}
                  {tag.label && <div className="mt-0.5 truncate text-xs text-white/35">{tag.label}</div>}
                </td>
                <td className="truncate px-3 py-2.5 text-xs text-white/45">{tag.destinationUrl ? shortUrl(tag.destinationUrl) : "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <PieceStatusPills tag={tag} />
                    <ChipMark tag={tag} />
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right">
                  <ScanCounts qr={tag.qrInteractions} nfc={tag.nfcInteractions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
