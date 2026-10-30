import { useRef, useState } from "react";
import { ChevronRight, Factory, PackageCheck, Plus, Printer, QrCode, Truck } from "lucide-react";
import type { TagBatchItem } from "@shared/tagsApi";
import { Button } from "@/components/ui/button";
import { CompactDataTable } from "@/components/xpot/CompactDataTable";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterBar, FilterChips, FilterSearch, FilterSelect } from "@/components/xpot/filters";
import { TagBatchMention, TagModelChips } from "@/components/xpot/TagProductThumbnail";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { batchWorkspaceMessages } from "@/i18n/messages/batchWorkspace";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { shellMessages } from "@/i18n/messages/shell";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { formatDate } from "./api";
import { BATCH_PIPELINE, filterBatchList, isAwaitingPieces } from "./batches-model";
import { BatchStagePill, useBatches } from "./batches-shared";
import { useTagLabels } from "./labels";
import { ProductionWizard } from "./production-wizard";
import { Loading, LoadError } from "./pieces-shared";

const STAGE_ICONS = { issued: QrCode, built: Factory, printed: Printer, receiving: Truck, received: PackageCheck };
const STAGE_DOTS = { issued: "bg-slate-400", built: "bg-amber-400", printed: "bg-blue-400", receiving: "bg-violet-400", received: "bg-emerald-400" };

function PiecesCell({ batch }: { batch: TagBatchItem }) {
  const t = useT(manageTagsBatchesMessages);
  const percent = batch.tagCount > 0 ? Math.min(100, batch.receivedCount / batch.tagCount * 100) : 0;
  return (
    <div className="ml-auto w-24" aria-label={t("receivedCount", { received: batch.receivedCount, total: batch.tagCount })}>
      <div className={`mb-1.5 flex items-baseline justify-end gap-1 tabular-nums ${batch.pendingCount ? "text-white/90" : "text-emerald-300"}`}>
        <span className="font-semibold">{batch.receivedCount}</span><span className="text-xs text-white/40">/ {batch.tagCount}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
        <div className={`h-full rounded-full ${batch.pendingCount ? "bg-violet-400" : "bg-emerald-400"}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Find and follow batches in one list; creation stays in a focused dialog. */
export function BatchesTab({ go, embedded = false, onCreate }: { go: (path: string) => void; embedded?: boolean; onCreate?: () => void }) {
  const { data: batches = [], isLoading, error, refetch } = useBatches();
  const [creating, setCreating] = useState(false);
  const newBatchButton = useRef<HTMLButtonElement>(null);
  const filters = useUrlFilters({ stage: "", pending: "", q: "", product: "", sort: "newest" });
  const t = useT(manageTagsBatchesMessages);
  const tw = useT(batchWorkspaceMessages);
  const tf = useT(adminTagsFlowMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const u = useT(unifiedProductionMessages);
  const start = () => onCreate ? onCreate() : setCreating(true);
  const labels = useTagLabels();
  const pendingOnly = filters.values.pending === "1";
  const stage = [...BATCH_PIPELINE, "cancelled"].includes(filters.values.stage) ? filters.values.stage : "";
  const shown = filterBatchList(batches, { ...filters.values, stage, pendingOnly }, (b) => `${labels.product(b.productType)} ${b.face ? labels.face(b.face) : ""}`);
  const counts = new Map<string, number>();
  for (const batch of batches) counts.set(batch.stage, (counts.get(batch.stage) ?? 0) + 1);
  const pendingCount = batches.filter(isAwaitingPieces).length;
  const active = pendingOnly || !!stage || !!filters.values.q || !!filters.values.product;
  const productOptions = Array.from(new Set(batches.map((b) => b.productType)))
    .map((value) => ({ value, label: labels.product(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, t.locale));
  const openBatch = (batch: TagBatchItem) => go(batch.printJobId ? `/production/jobs/${batch.printJobId}` : `/batches/${batch.id}?tab=${batch.codeSource === "scanned" || ["printed", "receiving", "received"].includes(batch.stage) ? "receive" : "print"}`);
  const columns = [
    { key: "batch", label: tm("colBatch"), cellClassName: "max-w-[300px]",
      render: (b: TagBatchItem) => <TagBatchMention batchCode={b.batchCode} productType={b.productType} face={b.face} details={b.name} className="max-w-full" /> },
    { key: "product", label: tw("physicalModel"), headerClassName: "hidden lg:table-cell", cellClassName: "hidden lg:table-cell",
      render: (b: TagBatchItem) => <div className="space-y-1.5"><span className="flex items-center gap-2 text-xs text-white/65">{b.face ? <TagFaceIcon face={b.face} size="xs" /> : null}{b.face ? labels.face(b.face) : labels.product(b.productType)}</span><TagModelChips productType={b.productType} face={b.face} batchCode={b.batchCode} fallback={labels.product(b.productType)} /></div> },
    { key: "stage", label: tw("stage"), render: (b: TagBatchItem) => <BatchStagePill stage={b.stage} /> },
    { key: "pieces", label: tf("colPiecesReceived"), align: "right" as const, render: (b: TagBatchItem) => <PiecesCell batch={b} /> },
    { key: "nfc", label: t("nfcVerified"), align: "right" as const, headerClassName: "hidden xl:table-cell", cellClassName: "hidden xl:table-cell text-white/60", render: (b: TagBatchItem) => <span>{b.nfcVerifiedCount}<span className="text-white/30"> / {b.tagCount}</span></span> },
    { key: "created", label: t("colCreated"), headerClassName: "hidden xl:table-cell", cellClassName: "hidden xl:table-cell whitespace-nowrap text-xs text-white/45", render: (b: TagBatchItem) => formatDate(b.createdAt) },
    { key: "open", label: <span className="sr-only">{tw("openBatch")}</span>, width: 32, render: () => <ChevronRight className="h-4 w-4 text-white/30" aria-hidden="true" /> },
  ];

  return (
    <div className="min-w-0 space-y-5" data-testid="admin-tags-batches">
      {!embedded ? <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight text-white">{ts("manageBatches")}</h1><p className="mt-1 text-sm text-white/50">{tw("intro")}</p></div>
        <Button ref={newBatchButton} type="button" variant="brand" accent="tags" onClick={start} data-testid="admin-tags-new-batch"><Plus className="h-4 w-4" aria-hidden="true" />{u("newProduction")}</Button>
      </header> : null}
      {!isLoading && !error && batches.length > 0 ? (
        <ol className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0" aria-label={tf("pipelineLabel")} data-testid="batches-pipeline">
          {BATCH_PIPELINE.map((s) => {
            const Icon = STAGE_ICONS[s];
            return <li key={s} className="min-w-[132px] flex-1 sm:min-w-0">
              <button type="button" onClick={() => filters.set({ stage: stage === s ? "" : s, pending: "" })} aria-pressed={stage === s}
                className={`flex h-full min-h-24 w-full flex-col justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${stage === s ? "border-violet-400/50 bg-violet-500/[0.12]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"}`}>
                <span className="flex w-full items-center justify-between gap-2"><Icon className={`h-4 w-4 ${stage === s ? "text-violet-300" : "text-white/40"}`} aria-hidden="true" /><span className="text-xl font-semibold tabular-nums text-white/90">{counts.get(s) ?? 0}</span></span>
                <span className="flex items-center gap-2 text-xs font-medium text-white/65"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STAGE_DOTS[s]}`} aria-hidden="true" />{labels.batchStage(s)}</span>
              </button>
            </li>;
          })}
        </ol>
      ) : null}
      <div className="space-y-3">
        <FilterBar testId="batches-filters"
          search={<FilterSearch value={filters.values.q} onChange={(q) => filters.set({ q })} debounceMs={200} placeholder={tw("searchPlaceholder")} testId="batches-search" />}
          controls={<>
            <FilterSelect value={filters.values.product} onChange={(product) => filters.set({ product })} placeholder={tw("allModels")} options={productOptions} testId="batches-product-filter" />
            <FilterSelect value={filters.values.sort} onChange={(sort) => filters.set({ sort: sort || "newest" })} placeholder={tw("sortBy")} options={[{ value: "newest", label: tw("newest") }, { value: "oldest", label: tw("oldest") }, { value: "pending", label: tw("mostPending") }]} testId="batches-sort" />
          </>}
          secondary={<FilterChips items={[
            { id: "all", label: t("allBatches"), count: batches.length },
            { id: "pending", label: tf("filterAwaitingPieces"), count: pendingCount },
            ...(counts.get("cancelled") ? [{ id: "cancelled", label: labels.batchStage("cancelled"), count: counts.get("cancelled") }] : []),
          ]} value={stage === "cancelled" ? "cancelled" : pendingOnly ? "pending" : stage ? "" : "all"}
            onChange={(id) => filters.set({ pending: id === "pending" ? "1" : "", stage: id === "cancelled" ? "cancelled" : "" })} ariaLabel={ts("manageBatches")} accent="tags" />}
          summary={{ shown: shown.length, total: batches.length, active, onClear: () => filters.reset(["sort"]) }}
        />
        {isLoading ? <Loading rows={4} /> : error ? <LoadError what={t("theBatches")} error={error} onRetry={() => void refetch()} /> : batches.length === 0 ? (
          <EmptyState compact tone="tags" icon={Factory} title={tw("emptyTitle")} hint={tw("emptyDescription")} action={<Button variant="brand" accent="tags" onClick={start}><Plus className="h-4 w-4" />{u("newProduction")}</Button>} cardStyle={{}} />
        ) : shown.length === 0 ? <EmptyState compact tone="tags" icon={Factory} title={tf("noBatchesMatch")} cardStyle={{}} /> : <>
          <div className="px-1 text-xs text-white/45" aria-live="polite" aria-atomic="true">{tf.plural("batchCount", shown.length)}</div>
          <CompactDataTable className="hidden sm:block" columns={columns} rows={shown} getRowKey={(b) => b.id} onRowClick={openBatch} getRowAriaLabel={(b) => `${tw("openBatch")} ${b.batchCode}`} getRowTestId={(b) => `admin-tags-batch-${b.batchCode}`} testId="batches-table" />
          <div className="space-y-2 sm:hidden" data-testid="batches-mobile-list">
            {shown.map((batch) => <button key={batch.id} type="button" onClick={() => openBatch(batch)} className="block w-full space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.04]" aria-label={`${tw("openBatch")} ${batch.batchCode}`}>
              <TagBatchMention batchCode={batch.batchCode} productType={batch.productType} face={batch.face} details={batch.name} className="w-full" />
              <span className="flex flex-wrap items-center gap-2 text-xs text-white/65">{batch.face ? <><TagFaceIcon face={batch.face} size="xs" />{labels.face(batch.face)}</> : null}<TagModelChips productType={batch.productType} face={batch.face} batchCode={batch.batchCode} /></span>
              <div className="flex items-end justify-between gap-3"><div className="space-y-2"><BatchStagePill stage={batch.stage} /><span className="block text-xs text-white/40">{formatDate(batch.createdAt)}</span></div><div><span className="mb-2 block text-right text-xs text-white/45">{tf("colPiecesReceived")}</span><PiecesCell batch={batch} /></div></div>
            </button>)}
          </div>
        </>}
      </div>
      {creating ? <ProductionWizard onClose={() => setCreating(false)} onCreated={(id) => go(`/production/batches/${id}?tab=receive`)} onOrdered={(request) => go(request.plates.length === 1 ? `/production/jobs/${request.plates[0].id}` : "/production/queue")} onCloseAutoFocus={(event) => { event.preventDefault(); newBatchButton.current?.focus(); }} /> : null}
    </div>
  );
}
