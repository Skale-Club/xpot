import { useCallback, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, DollarSign, MousePointerClick, Package, RotateCcw, ScanLine, Search, Shapes, X, type LucideIcon } from "lucide-react";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import TagScreen from "./TagScreen";
import TagSaleDialog from "./TagSaleDialog";
import type { TagListItem } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { APP_BASE, errorText, shortUrl, tagPath, tagsGet } from "./lib";
import { CARD, INPUT, Pill, STATUS_TONE, Spinner, TopBar } from "./ui";

const FILTERS = [
  { id: "all", status: null, key: "filterAll" },
  { id: "stock", status: null, key: "filterStock" },
  { id: "sold", status: null, key: "filterSold" },
  { id: "active", status: "active", key: "filterActive" },
  { id: "off", status: "disabled", key: "filterOff" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type ScanFilter = "all" | "with" | "without";

function FilterSelect({
  value,
  onChange,
  label,
  icon: Icon,
  options,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  icon: LucideIcon;
  options: Array<{ value: string; label: string }>;
  testId: string;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[40px] w-full appearance-none truncate rounded-xl border border-white/10 bg-white/[0.035] py-2 pl-9 pr-9 text-sm font-medium text-white/70 [color-scheme:dark] outline-none transition-colors hover:border-white/20 hover:bg-white/[0.055] focus:border-blue-400/60"
        data-testid={testId}
      >
        <option value="" className="bg-[#0d1424]">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0d1424]">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
    </label>
  );
}

/** The reseller's own pieces: kit stock, live and switched off. */
export default function PiecesScreen({ selectedCode = null }: { selectedCode?: string | null }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [, navigate] = useLocation();
  const isDesktop = useIsDesktop();
  // Moving between pieces and closing replace history; only the first open pushes.
  const openPiece = (code: string) =>
    isDesktop
      ? navigate(`${APP_BASE}/pieces/${encodeURIComponent(code)}${window.location.search}`, { replace: selectedCode != null })
      : navigate(tagPath(code));
  const closePiece = useCallback(() => navigate(`${APP_BASE}/pieces${window.location.search}`, { replace: true }), [navigate]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [faceFilter, setFaceFilter] = useState("");
  const [scanFilter, setScanFilter] = useState<ScanFilter>("all");
  const [saleOpen, setSaleOpen] = useState(false);
  const status = FILTERS.find((f) => f.id === filter)?.status ?? null;
  // ?lead=<id>&name=<name>: one customer's pieces, opened from a customer card.
  const [leadFilter, setLeadFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("lead"));
    return Number.isInteger(id) && id > 0 ? { id, name: params.get("name") ?? "" } : null;
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["tags", "list", status, leadFilter?.id ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (leadFilter) params.set("leadId", String(leadFilter.id));
      const qs = params.toString();
      return tagsGet<TagListItem[]>(`/api/xpot/tags${qs ? `?${qs}` : ""}`);
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
      if (filter === "stock" && tag.saleId) return false;
      if (filter === "sold" && !tag.saleId) return false;
      if (query && ![tag.publicCode, tag.leadName, tag.label].some((v) => v?.toLocaleLowerCase().includes(query))) return false;
      if (companyFilter && String(tag.leadId) !== companyFilter) return false;
      if (faceFilter && tag.face !== faceFilter) return false;
      const scans = tag.qrInteractions + tag.nfcInteractions;
      if (scanFilter === "with" && scans === 0) return false;
      if (scanFilter === "without" && scans > 0) return false;
      return true;
    });
  }, [companyFilter, data, faceFilter, filter, query, scanFilter]);
  const hasListFilters = Boolean(filter !== "all" || search.trim() || companyFilter || faceFilter || scanFilter !== "all");

  const listLoading = (
    <div className="flex justify-center py-16 text-white/40">
      <Spinner className="h-7 w-7" />
    </div>
  );
  const listError = <div className={`${CARD} px-6 py-8 text-center text-sm text-red-200`}>{errorText(error, tc("requestFailed"))}</div>;
  const listEmpty = (
    <div className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}>
      <Package className="h-8 w-8 text-white/25" />
      <p className="mt-2 text-sm text-white/45">{(data ?? []).length === 0 && filter === "all" ? t("piecesEmpty") : t("piecesNoMatch")}</p>
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        <TopBar title={t("piecesTitle")} eyebrow={data ? t.plural("pieces", data.length) : undefined} />
      </div>

      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setSaleOpen(true)}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(16,185,129,0.2)] active:scale-[0.98]"
          data-testid="button-sell-pieces">
          <DollarSign className="h-4 w-4" /> {t("sellPiecesAction")}
        </button>
      </div>

      {leadFilter && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/10 py-2 pl-4 pr-2" data-testid="lead-filter">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{t("piecesOf", { name: leadFilter.name || `#${leadFilter.id}` })}</span>
          <button
            type="button"
            onClick={() => {
              setLeadFilter(null);
              window.history.replaceState(null, "", window.location.pathname);
            }}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-white/60 active:bg-white/10"
          >
            <X className="h-4 w-4" />
            {t("clearFilter")}
          </button>
        </div>
      )}

      <div className="lg:flex lg:items-center lg:gap-4">
        <div className="relative lg:flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPieces")}
            className={`${INPUT} pl-10`}
            data-testid="input-pieces-search"
            data-shortcut="search"
          />
        </div>

        <div role="tablist" className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:mt-0 lg:pb-0">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-current={filter === f.id ? "true" : undefined}
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
      </div>

      <div className="mt-2.5 flex flex-col gap-2 sm:grid sm:grid-cols-3 lg:flex lg:flex-row lg:items-center">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-2 lg:flex lg:flex-1">
          <div className="min-w-0 lg:w-56">
            <FilterSelect
              value={companyFilter}
              onChange={setCompanyFilter}
              label={t("filterAllCompanies")}
              icon={Building2}
              options={companyOptions}
              testId="filter-company"
            />
          </div>
          <div className="min-w-0 lg:w-52">
            <FilterSelect
              value={faceFilter}
              onChange={setFaceFilter}
              label={t("filterAllChannels")}
              icon={Shapes}
              options={faceOptions}
              testId="filter-face"
            />
          </div>
        </div>
        <div className="min-w-0 lg:w-52">
          <FilterSelect
            value={scanFilter === "all" ? "" : scanFilter}
            onChange={(value) => setScanFilter((value || "all") as ScanFilter)}
            label={t("filterAnyActivity")}
            icon={ScanLine}
            options={[
              { value: "with", label: t("filterWithScans") },
              { value: "without", label: t("filterWithoutScans") },
            ]}
            testId="filter-scan-activity"
          />
        </div>
        {hasListFilters && (
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setSearch("");
              setCompanyFilter("");
              setFaceFilter("");
              setScanFilter("all");
            }}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80 sm:justify-start"
            data-testid="clear-piece-filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("clearListFilters")}
          </button>
        )}
      </div>

      <div className="mt-4">
        {isDesktop ? (
          // The pane stays mounted whatever the list shows (loading, empty, error).
          <MasterDetail
            closeLabel={t("closePane")}
            onClose={closePiece}
            list={isLoading ? listLoading : error ? listError : items.length === 0 ? listEmpty : (
              <PiecesTable items={items} selectedCode={selectedCode} onSelect={openPiece} />
            )}
            detail={selectedCode ? (
              <div className={`${CARD} p-5`}>
                <TagScreen key={selectedCode} code={selectedCode} onClose={closePiece} />
              </div>
            ) : null}
            placeholder={
              <div className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}>
                <MousePointerClick className="h-8 w-8 text-indigo-300/60" />
                <p className="mt-2 text-sm font-semibold text-white/60">{t("pickPiece")}</p>
                <p className="mt-1 text-xs text-white/35">{t("pickPieceHint")}</p>
              </div>
            }
          />
        ) : isLoading ? (
          listLoading
        ) : error ? (
          listError
        ) : items.length === 0 ? (
          listEmpty
        ) : (
          <ul className={`${CARD} divide-y divide-white/[0.06] overflow-hidden`} data-testid="pieces-list">
            {items.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => openPiece(tag.publicCode)}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/10"
                >
                  <TagFaceIcon face={tag.face} size="md" title={t(`face_${tag.face ?? "none"}` as "face_none")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-base font-semibold tracking-[0.12em] text-white">{tag.publicCode}</span>
                      <Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>
                      {tag.saleId && <Pill tone="green">{t("soldBadge")}</Pill>}
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
      <TagSaleDialog open={saleOpen} onOpenChange={setSaleOpen} pieces={data ?? []} />
    </>
  );
}

/** Desktop list of pieces. */
function PiecesTable({ items, selectedCode, onSelect }: { items: TagListItem[]; selectedCode: string | null; onSelect: (code: string) => void }) {
  const t = useT(tagsMessages);
  return (
    <div className={`${CARD} overflow-hidden`}>
      <table className="w-full table-fixed text-left text-sm" data-testid="pieces-table">
        <colgroup>
          <col className="w-14" />
          <col className="w-36" />
          <col className="w-24" />
          <col />
          <col className="hidden w-40 xl:table-column" />
          <col className="w-20" />
        </colgroup>
        <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-widest text-white/35">
          <tr>
            <th className="py-3 pl-4 pr-2"><span className="sr-only">{t("colFace")}</span></th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">{t("colCode")}</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">{t("colStatus")}</th>
            <th className="px-3 py-3 font-semibold">{t("colCustomer")}</th>
            <th className="hidden px-3 py-3 font-semibold xl:table-cell">{t("colLink")}</th>
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
                className={`cursor-pointer outline-none transition-colors focus-visible:bg-white/[0.05] ${selected ? "bg-blue-500/[0.12]" : "hover:bg-white/[0.03]"}`}
                data-testid={`piece-row-${tag.publicCode}`}
              >
                <td className="py-3 pl-4 pr-2 align-middle"><TagFaceIcon face={tag.face} size="sm" title={t(`face_${tag.face ?? "none"}` as "face_none")} /></td>
                <td className="whitespace-nowrap px-3 py-3 align-middle font-mono font-semibold tracking-[0.12em] text-white">{tag.publicCode}</td>
                <td className="px-3 py-3 align-middle"><div className="flex flex-wrap gap-1"><Pill tone={STATUS_TONE[tag.status] ?? "slate"}>{t(`status_${tag.status}` as "status_active")}</Pill>{tag.saleId && <Pill tone="green">{t("soldBadge")}</Pill>}</div></td>
                <td className="min-w-0 px-3 py-3 align-middle">
                  <div className="truncate leading-5 text-white/85">{tag.leadName ?? t(`product_${tag.productType}` as "product_custom")}</div>
                  {tag.label && <div className="mt-0.5 truncate text-[11px] leading-4 text-white/35">{tag.label}</div>}
                </td>
                <td className="hidden max-w-0 truncate px-3 py-3 align-middle text-xs text-white/45 xl:table-cell">{tag.destinationUrl ? shortUrl(tag.destinationUrl) : "—"}</td>
                <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right align-middle tabular-nums text-white/55">
                  {tag.status === "active" ? tag.qrInteractions + tag.nfcInteractions : <span className="text-white/20">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
