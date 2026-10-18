import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Building2, Layers, Package, Trophy, Users, Warehouse } from "lucide-react";
import type { TagRepReportRow, TagTeamReport } from "@shared/tagsApi";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { KpiTile, SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterSelect } from "@/components/xpot/filters";
import { Stat } from "@/components/xpot/Stat";
import { Pill, ROLE_TONE, toneOf } from "@/components/xpot/StatusPill";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { ADMIN_TAGS_KEY, formatDate, getJson, STALE_MS, withQuery } from "./api";
import { Loading, LoadError, useBatchOptions, useLeads, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { AnalyticsPanel, RangePicker, rangeParams, type AnalyticsRange } from "./pieces-analytics";

type Go = (path: string) => void;

function RoleBadge({ row }: { row: TagRepReportRow }) {
  const t = useT(manageTagsMessages);
  if (row.role === "admin" || row.role === "manager") {
    return <Pill tone={toneOf(ROLE_TONE, row.role)} className="ml-1.5">{t(row.role === "admin" ? "role_admin" : "role_manager")}</Pill>;
  }
  if (!row.isActive) return <Pill tone="muted" className="ml-1.5">{t("teamRepOff")}</Pill>;
  return null;
}

function PersonCell({ row }: { row: TagRepReportRow }) {
  const t = useT(manageTagsMessages);
  if (row.repId === null) return <span className="italic text-white/50">{t("teamNoReseller")}</span>;
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center font-medium text-white">
        <span className="truncate">{row.name ?? t("teamResellerN", { id: row.repId })}</span>
        <RoleBadge row={row} />
      </p>
      {row.email && row.email !== row.name ? <p className="truncate text-xs text-white/40">{row.email}</p> : null}
    </div>
  );
}

/** Per-reseller numbers for the window: sales, activations, stock and the scans their pieces got. */
function TeamReport({ range, go }: { range: AnalyticsRange; go: Go }) {
  const t = useT(manageTagsMessages);
  const url = withQuery("/api/xpot/admin/tags/report", rangeParams(range));
  const { data, isLoading, error, refetch } = useQuery<TagTeamReport>({
    queryKey: [ADMIN_TAGS_KEY, "team-report", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <LoadError what={t("whatTeamReport")} error={error} onRetry={() => void refetch()} />;

  const u = data.unassigned;
  const showUnassigned = !!(u.activeTags || u.qr || u.nfc || u.soldInRange || u.activationsInRange || u.inStock || u.totalSold);
  const rows = [...data.reps, ...(showUnassigned ? [u] : [])];
  const total = (pick: (r: TagRepReportRow) => number) => rows.reduce((sum, r) => sum + pick(r), 0);
  const withResellers = data.reps.reduce((sum, r) => sum + r.inStock, 0);
  const openRep = (r: TagRepReportRow) => go(`/pieces?rep=${r.repId ?? "house"}`);
  const num = (key: string, label: string, pick: (r: TagRepReportRow) => number, strong = false): CompactDataColumn<TagRepReportRow> => ({
    key,
    label,
    align: "right",
    cellClassName: strong ? "font-semibold text-white" : "text-white/80",
    render: pick,
  });
  const columns: CompactDataColumn<TagRepReportRow>[] = [
    { key: "rep", label: t("colReseller"), cellClassName: "max-w-[240px]", render: (r) => <PersonCell row={r} /> },
    num("sold", t("teamColSold"), (r) => r.soldInRange, true),
    num("activated", t("teamColActivated"), (r) => r.activationsInRange),
    num("stock", t("teamColInStock"), (r) => r.inStock),
    num("live", t("teamColLive"), (r) => r.activeTags),
    num("soldAll", t("teamColSoldAll"), (r) => r.totalSold),
    num("customers", t("teamColCustomers"), (r) => r.customers),
    num("qr", "QR", (r) => r.qr),
    num("nfc", "NFC", (r) => r.nfc),
    { key: "lastSale", label: t("teamColLastSale"), align: "right", cellClassName: "whitespace-nowrap text-xs text-white/50", render: (r) => formatDate(r.lastSaleAt) },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat card label={t("teamPiecesSold")} value={total((r) => r.soldInRange)} detail={t("teamPiecesSoldHint")} />
        <Stat card label={t("teamActivations")} value={total((r) => r.activationsInRange)} detail={t("teamActivationsHint")} />
        <Stat card label={t("teamLivePieces")} value={total((r) => r.activeTags)} detail={t("teamLivePiecesHint")} />
        <Stat card label={t("teamScansTaps")} value={total((r) => r.qr + r.nfc)} detail={`${total((r) => r.qr)} QR · ${total((r) => r.nfc)} NFC`} />
      </div>

      <SectionCard accent="tags" icon={Users} title={t("teamByReseller")}>
        {rows.length === 0 ? (
          <EmptyState compact dense tone="tags" icon={Users} title={t("teamEmpty")} cardStyle={{}} />
        ) : (
          <CompactDataTable
            testId="admin-tags-team-table"
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.repId ?? "house"}
            onRowClick={openRep}
            getRowAriaLabel={(r) => `${r.name ?? t("teamNoReseller")} · ${t("teamOpenRep")}`}
          />
        )}
        <p className="mt-3 text-xs text-white/40">{t("teamFootnote")}</p>
      </SectionCard>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard accent="tags" icon={Trophy} title={t("teamMostScanned")} className="min-w-0" bodyClassName="px-4 py-2">
          {data.topTags.length === 0 ? (
            <EmptyState compact dense tone="tags" icon={Trophy} title={t("teamNoScansPeriod")} cardStyle={{}} />
          ) : (
            <ol className="divide-y divide-white/5">
              {data.topTags.map((p, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => go(`/pieces/${p.id}`)} className="flex w-full min-w-0 items-center gap-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.03]">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/30">{i + 1}</span>
                    <TagPieceMention
                      publicCode={p.publicCode}
                      productType={p.productType}
                      face={p.face}
                      batchCode={p.batchCode}
                      customer={p.leadName}
                      details={[p.label, p.repName ? t("teamSoldBy", { name: p.repName }) : t("teamHouse")].filter(Boolean).join(" · ")}
                      className="min-w-0 flex-1"
                    />
                    <span className="shrink-0 text-right text-xs tabular-nums text-white/50">
                      <span className="block font-semibold text-white">{p.qr + p.nfc}</span>
                      <span className="block whitespace-nowrap text-[11px]">{p.qr} QR · {p.nfc} NFC</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard accent="tags" icon={Package} title={t("teamUnsoldStock")} className="min-w-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="grid" data-testid="admin-team-house-stock">
              <KpiTile accent="violet" icon={Warehouse} label={t("teamInHouseNoReseller")} value={u.inStock} detail={t("teamReadyForKit")} onClick={() => go("/pieces?stock=house")} />
            </div>
            <KpiTile accent="violet" icon={Users} label={t("ovWithResellers")} value={withResellers} detail={t("teamUnsoldInKits")} onClick={() => go("/pieces?stock=reps")} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/** Fleet analytics (the old Analytics tab), scoped by product, reseller, customer or batch; the scope lives in the URL. */
function FleetAnalytics({ range, go }: { range: AnalyticsRange; go: Go }) {
  const t = useT(manageTagsMessages);
  const labels = useTagLabels();
  // ?product=…&rep=…&lead=…&batch=… (same names as the Pieces filters).
  const filters = useUrlFilters({ product: "", rep: "", lead: "", batch: "" });
  const { product, rep, lead, batch } = filters.values;
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();
  const scope = { productType: product || undefined, repId: rep || undefined, leadId: lead || undefined, batchId: batch || undefined };

  return (
    <div className="min-w-0 space-y-4">
      <FilterBar
        testId="admin-team-analytics-filters"
        controls={
          <>
            <FilterSelect value={product} onChange={(next) => filters.set({ product: next })} placeholder={t("allProducts")} options={labels.productOptions} icon={Package} />
            <FilterSelect value={rep} onChange={(next) => filters.set({ rep: next })} placeholder={t("allResellers")} options={reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))} icon={Users} />
            <FilterSelect value={lead} onChange={(next) => filters.set({ lead: next })} placeholder={t("allCustomers")} options={leads.map((l) => ({ value: String(l.id), label: l.name }))} icon={Building2} />
            <FilterSelect value={batch} onChange={(next) => filters.set({ batch: next })} placeholder={t("allBatches")} options={batches.map((b) => ({ value: b.id, label: b.batchCode }))} icon={Layers} />
          </>
        }
        summary={{ active: filters.activeCount() > 0, onClear: () => filters.reset() }}
      />
      <AnalyticsPanel scopeUrl="/api/xpot/admin/tags/analytics" scope={scope} range={range} showTopTags onOpenTag={(id) => go(`/pieces/${id}`)} />
    </div>
  );
}

export function TeamTab({ go }: { go: Go }) {
  const t = useT(manageTagsMessages);
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  return (
    <div className="min-w-0 space-y-6" data-testid="admin-tags-team">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-white/50">{t("teamIntro")}</p>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <section className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold text-white/90">{t("teamReportTitle")}</h2>
        <TeamReport range={range} go={go} />
      </section>

      <section className="min-w-0 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <BarChart3 className="h-4 w-4 text-violet-300" aria-hidden="true" />
          {t("scansTaps")}
        </h2>
        <FleetAnalytics range={range} go={go} />
      </section>
    </div>
  );
}
