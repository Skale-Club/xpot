import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Factory, Plus, X } from "lucide-react";
import { TAG_MAX_BATCH_QUANTITY, TAG_PRODUCT_TYPES } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagBatchMention, TagModelChips } from "@/components/xpot/TagProductThumbnail";
import { Button } from "@/components/ui/button";
import { CompactDataTable } from "@/components/xpot/CompactDataTable";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { FilterBar, FilterChips } from "@/components/xpot/filters";
import { GLASS_CLASS } from "@/components/xpot/surface";
import type { TagBatchItem } from "@shared/tagsApi";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { BatchStagePill, catalogOptions, useBatches, useTagCatalog } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { BATCH_PIPELINE, groupBatchesByStage, isAwaitingPieces } from "./batches-model";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

const EMPTY_FORM = {
  name: "",
  batchCode: "",
  productType: TAG_PRODUCT_TYPES[0] as string,
  salesProductId: "",
  face: "",
  vendor: "",
  notes: "",
  codes: "issued" as "issued" | "scanned",
  quantity: "4",
};

function NewBatchForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: catalog = [] } = useTagCatalog();
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm((f) => ({ ...f, ...patch }));
  const quantity = Number(form.quantity);
  const issuing = form.codes === "issued";
  const quantityOk = !issuing || (Number.isInteger(quantity) && quantity >= 1 && quantity <= TAG_MAX_BATCH_QUANTITY);
  const ready = form.name.trim().length > 0 && !!form.salesProductId && quantityOk;

  const create = useMutation({
    mutationFn: () =>
      sendJson<{ id: string; batchCode: string; quantity: number; codeSource: string }>("POST", "/api/xpot/admin/tag-batches", {
        name: form.name,
        batchCode: form.batchCode || undefined,
        productType: form.productType,
        salesProductId: Number(form.salesProductId),
        face: form.face || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        ...(issuing ? { quantity } : {}),
      }),
    onSuccess: (batch) => {
      void invalidateAdminTags();
      toast({
        title: t("batchCreated", { code: batch.batchCode }),
        description: batch.codeSource === "issued" ? t.plural("batchIssuedDesc", batch.quantity) : t("batchCreatedDesc"),
      });
      onCreated(batch.id);
    },
    onError: (err) => toast({ title: t("couldNotCreateBatch"), description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !create.isPending) create.mutate();
  };

  return (
    <form onSubmit={submit} className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4`} data-testid="admin-tags-new-batch-form">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{t("newBatchTitle")}</p>
          <p className="text-xs text-white/40">{t("newBatchIntro")}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2" onClick={onClose} aria-label={tc("close")}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" data-testid="admin-tags-new-batch-codes">
        {(["issued", "scanned"] as const).map((mode) => (
          <label
            key={mode}
            className={`cursor-pointer rounded-xl border p-3 transition-colors ${form.codes === mode ? "border-violet-400/40 bg-violet-500/[0.1]" : "border-white/10 hover:bg-white/[0.03]"}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <input type="radio" name="codes" value={mode} checked={form.codes === mode} onChange={() => set({ codes: mode })} className="h-4 w-4 accent-violet-500" />
              {mode === "issued" ? t("codesIssued") : t("codesScanned")}
            </span>
            <span className="mt-1 block text-xs text-white/45">{mode === "issued" ? t("codesIssuedHint") : t("codesScannedHint")}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fieldNameRequired")} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder={t("namePlaceholder")} autoFocus />
        </Field>
        <Field label={t("fieldProduct")}>
          <Select value={form.productType} onChange={(e) => set({ productType: e.target.value })} options={labels.productOptions} />
        </Field>
        <Field label={t("fieldCatalogProduct")} hint={t("catalogProductHint")}>
          <Select value={form.salesProductId} onChange={(e) => set({ salesProductId: e.target.value })} required placeholder={t("chooseCatalogProduct")} options={catalogOptions(catalog)} />
        </Field>
        <Field label={t("fieldPrintedOnPieces")} hint={t("printedHintNew")} className="sm:col-span-2" id="new-batch-face">
          <div className="flex items-center gap-2">
            <TagFaceIcon face={form.face || (form.productType === "google_review_sign" ? "google_review" : null)} size="md" />
            <div className="min-w-0 flex-1">
              <Select
                id="new-batch-face"
                value={form.face}
                onChange={(e) => set({ face: e.target.value })}
                placeholder={form.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")}
                options={labels.faceOptions}
              />
            </div>
          </div>
        </Field>
        <Field label={t("fieldBatchCode")} hint={t("batchCodeHint")}>
          <Input
            value={form.batchCode}
            onChange={(e) => set({ batchCode: e.target.value.toUpperCase() })}
            maxLength={40}
            placeholder={t("batchCodeAutomatic")}
            className="font-mono"
          />
        </Field>
        {issuing && (
          <Field label={t("fieldQuantityRequired")} hint={t("quantityRange", { max: TAG_MAX_BATCH_QUANTITY })}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={TAG_MAX_BATCH_QUANTITY}
              value={form.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
              className="tabular-nums"
              data-testid="admin-tags-new-batch-quantity"
            />
          </Field>
        )}
        <Field label={t("fieldVendor")}>
          <Input value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} maxLength={120} />
        </Field>
        <Field label={t("fieldNotes")} className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" variant="brand" accent="tags" disabled={!ready} loading={create.isPending} data-testid="admin-tags-new-batch-submit">
          {issuing && quantityOk ? t.plural("createIssuedBatch", quantity) : t("createEmptyBatch")}
        </Button>
      </div>
    </form>
  );
}

/** One "Pieces received/total" column: issued codes not received yet show amber. */
function PiecesCell({ batch }: { batch: TagBatchItem }) {
  return (
    <span className={`tabular-nums ${batch.pendingCount ? "text-amber-300" : "text-white/85"}`}>
      {batch.receivedCount}/{batch.tagCount}
    </span>
  );
}

/**
 * Production batches as a pipeline: Codes issued → Print file ready → Printed → Receiving → In stock (then cancelled),
 * each stage its own group. `?stage=` shows one stage; `?pending=1` the batches still waiting for pieces (the
 * Overview's "Needs action" card). The stock split lives in Inventory.
 */
export function BatchesTab({ go }: { go: (path: string) => void }) {
  const { data: batches = [], isLoading, error, refetch } = useBatches();
  const [creating, setCreating] = useState(false);
  const filters = useUrlFilters({ stage: "", pending: "" });
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const labels = useTagLabels();
  const pendingOnly = filters.values.pending === "1";
  const stage = (BATCH_PIPELINE as readonly string[]).includes(filters.values.stage) || filters.values.stage === "cancelled" ? filters.values.stage : "";
  const shown = batches.filter((b) => (!pendingOnly || isAwaitingPieces(b)) && (!stage || b.stage === stage));
  const groups = groupBatchesByStage(shown);
  const countIn = (s: string) => batches.filter((b) => b.stage === s).length;

  const columns = [
    {
      key: "batch",
      label: tm("colBatch"),
      cellClassName: "max-w-[320px]",
      render: (b: TagBatchItem) => (
        <TagBatchMention
          batchCode={b.batchCode}
          productType={b.productType}
          face={b.face}
          details={[b.name, b.vendor].filter(Boolean).join(" · ") || undefined}
          className="max-w-full"
        />
      ),
    },
    {
      key: "product",
      label: t("fieldProduct"),
      render: (b: TagBatchItem) => (
        <>
          {b.face ? <span className="mb-1 block text-sm text-white/85">{labels.face(b.face)}</span> : null}
          <TagModelChips productType={b.productType} face={b.face} batchCode={b.batchCode} fallback={labels.product(b.productType)} />
        </>
      ),
    },
    { key: "pieces", label: tf("colPiecesReceived"), align: "right" as const, render: (b: TagBatchItem) => <PiecesCell batch={b} /> },
    { key: "nfc", label: t("nfcVerified"), align: "right" as const, render: (b: TagBatchItem) => b.nfcVerifiedCount },
    { key: "created", label: t("colCreated"), cellClassName: "whitespace-nowrap text-white/50", render: (b: TagBatchItem) => formatDate(b.createdAt) },
  ];

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-batches">
      {creating ? <NewBatchForm onClose={() => setCreating(false)} onCreated={(id) => go(`/batches/${id}`)} /> : null}

      <SectionCard
        accent="tags"
        icon={Factory}
        title={ts("manageBatches")}
        actions={
          !creating && (
            <Button type="button" variant="brand" accent="tags" size="sm" className="min-h-10" onClick={() => setCreating(true)} data-testid="admin-tags-new-batch">
              <Plus className="h-4 w-4" />
              {t("newBatch")}
            </Button>
          )
        }
      >
        {/* The pipeline at a glance; a stage opens its batches. */}
        {batches.length > 0 ? (
          <ol className="mb-4 flex min-w-0 flex-wrap items-center gap-1 text-xs" aria-label={tf("pipelineLabel")} data-testid="batches-pipeline">
            {BATCH_PIPELINE.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => filters.set({ stage: stage === s ? "" : s })}
                  aria-pressed={stage === s}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition-colors ${stage === s ? "border-violet-400/40 bg-violet-500/[0.15] text-white" : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"}`}
                >
                  {labels.batchStage(s)}
                  <span className="tabular-nums text-white/45">{countIn(s)}</span>
                </button>
                {i < BATCH_PIPELINE.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-white/25" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        ) : null}
        <FilterBar
          className="mb-3"
          testId="batches-filters"
          secondary={
            <FilterChips
              items={[
                { id: "all", label: t("filterAll"), count: batches.length },
                { id: "pending", label: tf("filterAwaitingPieces"), count: batches.filter(isAwaitingPieces).length },
              ]}
              value={pendingOnly ? "pending" : "all"}
              onChange={(id) => filters.set({ pending: id === "pending" ? "1" : "" })}
              ariaLabel={ts("manageBatches")}
              accent="tags"
            />
          }
          summary={{ shown: shown.length, total: batches.length, active: pendingOnly || !!stage, onClear: () => filters.reset() }}
        />
        {isLoading ? (
          <Loading rows={4} />
        ) : error ? (
          <LoadError what={t("theBatches")} error={error} onRetry={() => void refetch()} />
        ) : batches.length === 0 ? (
          <EmptyState compact tone="tags" icon={Factory} title={t("noBatchesYet")} cardStyle={{}} />
        ) : groups.length === 0 ? (
          <EmptyState compact tone="tags" icon={Factory} title={tf("noBatchesMatch")} cardStyle={{}} />
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.stage} className="min-w-0 space-y-2" data-testid={`batches-stage-${group.stage}`}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85">
                  <BatchStagePill stage={group.stage} />
                  <span className="text-xs font-normal text-white/40">{tf.plural("batchCount", group.batches.length)}</span>
                </h3>
                <CompactDataTable
                  columns={columns}
                  rows={group.batches}
                  getRowKey={(b) => b.id}
                  onRowClick={(b) => go(`/batches/${b.id}`)}
                  getRowAriaLabel={(b) => b.batchCode}
                  getRowTestId={(b) => `admin-tags-batch-${b.batchCode}`}
                />
              </section>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
