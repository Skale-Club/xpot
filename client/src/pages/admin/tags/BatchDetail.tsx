import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Download, Factory, Layers, LockKeyhole, PackagePlus, Pencil, RotateCcw, ScanLine } from "lucide-react";
import { FilterBar, FilterChips } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagListItem } from "@shared/tagsApi";
import { resolveTagFace } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { CODE_HEADING, TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Stat } from "@/components/xpot/Stat";
import { GLASS_CLASS, MODULE_ACCENT } from "@/components/xpot/surface";
import { AdminHttpError, ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, formatShare, getJson, invalidateAdminTags, sendJson } from "./api";
import { countStockMetric, matchesStockMetric, type TagStockMetric } from "@shared/tagMetrics";
import { BatchStagePill, BatchStatusPill, catalogOptions, useTagCatalog } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { PieceTable } from "./piece-table";
import { useTagLabels } from "./labels";
import { GiveKitForm } from "./kits-give-form";
import { JourneyPanel } from "./JourneyPanel";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import QrScanner from "../../tags/QrScanner";

interface BatchDetailData {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
  salesProductId: number | null;
  /** The batch's own face setting (null = the product's default). */
  face: string | null;
  vendor: string | null;
  quantity: number;
  status: string;
  codeSource: string;
  stage: string;
  tagCount: number;
  pendingCount: number;
  receivedCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  tags: TagListItem[];
}

/** Each chip is one shared stock number (shared/tagMetrics.ts), the same the stats above and the Batches list count. */
const FILTERS: ReadonlyArray<{ id: string; label: "filterAll" | "pendingPieces" | "damaged" | "houseStock" | "withResellers" | "sold" | "live"; metric: TagStockMetric | null }> = [
  { id: "all", label: "filterAll", metric: null },
  { id: "pending", label: "pendingPieces", metric: "notReceived" },
  { id: "damaged", label: "damaged", metric: "damaged" },
  { id: "house", label: "houseStock", metric: "house" },
  { id: "resellers", label: "withResellers", metric: "withResellers" },
  { id: "sold", label: "sold", metric: "sold" },
  { id: "live", label: "live", metric: "live" },
];
const passes = (filter: (typeof FILTERS)[number], t: TagListItem) => !filter.metric || matchesStockMetric(t, filter.metric);

function EditBatch({ batch, onClose }: { batch: BatchDetailData; onClose: () => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: catalog = [] } = useTagCatalog();
  const initial = () => ({ name: batch.name, face: batch.face ?? "", vendor: batch.vendor ?? "", notes: batch.notes ?? "", salesProductId: batch.salesProductId ? String(batch.salesProductId) : "" });
  const [form, setForm] = useState(initial);
  useEffect(() => {
    setForm(initial());
  },[batch.name, batch.face, batch.vendor, batch.notes, batch.salesProductId]);

  const save = useMutation({
    mutationFn: () =>
      sendJson("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, {
        name: form.name,
        face: form.face || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        // Only a real change: the server re-maps the pieces that followed the old product (never sold ones).
        ...(Number(form.salesProductId) !== batch.salesProductId ? { salesProductId: Number(form.salesProductId) } : {}),
      }),
    onSuccess: () => {
      void invalidateAdminTags();
      toast({ title: t("batchUpdated") });
      onClose();
    },
    onError: (err) => toast({ title: t("couldNotUpdateBatch"), description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim() && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/5 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fieldName")} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
        </Field>
        <Field label={t("fieldCatalogProduct")} hint={t("catalogProductHint")}>
          <Select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} required placeholder={t("chooseCatalogProduct")} options={catalogOptions(catalog)} />
        </Field>
        <Field label={t("fieldPrintedOnPieces")} hint={t("printedHintEdit")} id={`batch-face-${batch.id}`}>
          <div className="flex items-center gap-2">
            <TagFaceIcon face={resolveTagFace({ batchFace: form.face || null, productType: batch.productType })} size="sm" />
            <div className="min-w-0 flex-1">
              <Select
                id={`batch-face-${batch.id}`}
                value={form.face}
                onChange={(e) => setForm({ ...form, face: e.target.value })}
                placeholder={batch.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")}
                options={labels.faceOptions}
              />
            </div>
          </div>
        </Field>
        <Field label={t("fieldVendor")}>
          <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} maxLength={120} />
        </Field>
        <Field label={t("fieldNotes")} className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={2} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" variant="brand" accent="tags" disabled={!form.name.trim() || !form.salesProductId} loading={save.isPending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

function BatchIntakePanel({ batch }: { batch: BatchDetailData }) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);

  const add = useMutation({
    mutationFn: (scanValue: string) => sendJson<{ tag: { publicCode: string }; batchCount: number; receivedCount: number; alreadyRegistered: boolean }>(
      "POST",
      `/api/xpot/admin/tag-batches/${batch.id}/scan`,
      { value: scanValue, idempotencyKey: crypto.randomUUID() },
    ),
    onSuccess: (result) => {
      setValue("");
      void invalidateAdminTags();
      toast({
        title: result.alreadyRegistered ? t("pieceAlreadyAdded") : t("pieceAdded", { code: result.tag.publicCode }),
        description: batch.codeSource === "issued"
          ? t("receivedCount", { received: result.receivedCount, total: result.batchCount })
          : t("registeredCount", { count: result.batchCount }),
      });
    },
    onError: (err) => toast({ title: t("couldNotAddPiece"), description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const scanValue = value.trim();
    if (scanValue && !add.isPending) add.mutate(scanValue);
  };

  if (batch.status !== "open") return null;
  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-4" data-testid="admin-tags-batch-intake">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><ScanLine className={`h-4 w-4 ${MODULE_ACCENT.tags.text}`} />{t("addPiecesTitle")}</p>
          <p className="mt-1 text-xs text-white/45">{batch.codeSource === "issued" ? t("receiveIntro") : t("addPiecesIntro")}</p>
        </div>
        <span className="rounded-full bg-violet-400/10 px-3 py-1 text-sm font-semibold tabular-nums text-violet-200">
          {batch.codeSource === "issued"
            ? t("receivedCount", { received: batch.receivedCount, total: batch.tagCount })
            : t("registeredCount", { count: batch.quantity })}
        </span>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("scanPlaceholder")}
          aria-label={t("scanPlaceholder")}
          className="min-w-0 flex-1 font-mono"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          data-testid="admin-tags-batch-scan-input"
        />
        <Button type="submit" variant="brand" accent="tags" disabled={!value.trim()} loading={add.isPending}>
          <ScanLine className="h-4 w-4" />
          {t("addPiece")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setCameraOpen(true)} disabled={add.isPending}>
          <Camera className="h-4 w-4" />
          {t("scanWithCamera")}
        </Button>
      </form>
      {cameraOpen && (
        <QrScanner
          onClose={() => setCameraOpen(false)}
          onResult={(text) => {
            setCameraOpen(false);
            if (!add.isPending) add.mutate(text);
          }}
        />
      )}
    </div>
  );
}

/** One production batch: info, factory downloads, its pieces, and kits from it. */
export function BatchDetail({ id, go }: { id: string; go: (path: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [giving, setGiving] = useState(false);
  const [stateDialog, setStateDialog] = useState(false);
  const [changingState, setChangingState] = useState(false);
  // ?pieces=sold — survives opening a piece and coming back.
  const pieceFilter = useUrlFilters({ pieces: "all" });
  const filter = FILTERS.some((f) => f.id === pieceFilter.values.pieces) ? pieceFilter.values.pieces : "all";
  const t = useT(manageTagsBatchesMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  const { data: batch, isLoading, error, refetch } = useQuery<BatchDetailData>({
    queryKey: [ADMIN_TAGS_KEY, "batch", id],
    queryFn: () => getJson(`/api/xpot/admin/tag-batches/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
  });

  const back = <BackLink onBack={() => go("/batches")}>{t("allBatches")}</BackLink>;

  if (isLoading) return <Loading rows={5} />;
  if (error || !batch) {
    const notFound = error instanceof AdminHttpError && error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        {notFound || !error ? (
          <EmptyState tone="tags" icon={Layers} title={t("batchNotFound")} />
        ) : (
          <LoadError what={t("theBatches")} error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const pieces = batch.tags;
  const total = pieces.length;
  const house = countStockMetric(pieces, "house");
  const handOut = countStockMetric(pieces, "handOut");
  const withResellers = countStockMetric(pieces, "withResellers");
  const sold = countStockMetric(pieces, "sold");
  const damaged = countStockMetric(pieces, "damaged");
  const live = countStockMetric(pieces, "live");
  const chipsVerified = pieces.filter((p) => p.nfcStatus === "verified" || p.nfcStatus === "locked").length;
  const exportBase = `/api/xpot/admin/tag-batches/${encodeURIComponent(batch.id)}`;
  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = pieces.filter((p) => passes(activeFilter, p));
  const face = resolveTagFace({ batchFace: batch.face, productType: batch.productType });

  const closing = batch.status === "open";
  const changeState = async (reopenReason: string) => {
    if (!closing && !reopenReason.trim()) return;
    setChangingState(true);
    try {
      if (closing) {
        await sendJson("POST", `/api/xpot/admin/tag-batches/${batch.id}/close`, {});
        toast({ title: t("batchClosed") });
      } else {
        await sendJson("POST", `/api/xpot/admin/tag-batches/${batch.id}/reopen`, { reason: reopenReason.trim() });
        toast({ title: t("batchReopened") });
      }
      setStateDialog(false);
      await invalidateAdminTags();
    } catch (err) {
      toast({ title: closing ? t("couldNotCloseBatch") : t("couldNotReopenBatch"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setChangingState(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      {back}

      <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TagPieceVisual productType={batch.productType} face={face} size="md" />
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={CODE_HEADING}>{batch.batchCode}</h2>
              <BatchStagePill stage={batch.stage} />
              <BatchStatusPill status={batch.status} />
              <TagModelChips productType={batch.productType} face={face} batchCode={batch.batchCode} />
            </div>
            <p className="mt-0.5 text-sm text-white/70">{batch.name}</p>
            <p className="text-xs text-white/40">
              {labels.product(batch.productType)} · {labels.face(face)} · {batch.vendor || t("noVendor")} · {t("registeredCount", { count: batch.quantity })} ·{" "}
              {t("createdOn", { date: formatDate(batch.createdAt) })}
            </p>
            {batch.notes && !editing && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{batch.notes}</p>}
          </div>
          </div>
          {!editing && <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setStateDialog(true)} data-testid="admin-batch-state">
              {batch.status === "open" ? <LockKeyhole className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {batch.status === "open" ? t("closeBatch") : t("reopenBatch")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("edit")}
            </Button>
          </div>}
        </div>
        {editing && <EditBatch batch={batch} onClose={() => setEditing(false)} />}
      </div>

      <ConfirmDialog
        open={stateDialog}
        onOpenChange={setStateDialog}
        title={closing ? t("closeBatchTitle") : t("reopenBatchTitle")}
        description={closing ? t("closeBatchDescription") : undefined}
        reason={closing ? undefined : "required"}
        reasonLabel={closing ? undefined : t("reopenReasonPrompt")}
        confirmLabel={closing ? t("closeBatch") : t("reopenBatch")}
        busy={changingState}
        testId="admin-batch-state-confirm"
        onConfirm={(reason) => void changeState(reason)}
      >
        {closing && batch.pendingCount > 0 ? <InlineAlert tone="warning">{t.plural("closeBatchPending", batch.pendingCount)}</InlineAlert> : null}
      </ConfirmDialog>

      <BatchIntakePanel batch={batch} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat card label={t("houseStock")} value={house} detail={t.plural("houseShare", total, { percent: formatShare(house, total) })} />
        <Stat card label={t("withResellers")} value={withResellers} detail={t("withResellersKitHint")} />
        <Stat card label={t("sold")} value={sold} detail={t.plural("liveCount", live)} />
        <Stat card label={t("damaged")} value={damaged} detail={t("qualityControlSample")} />
        <Stat card label={t("nfcVerified")} value={chipsVerified} detail={t("chipsShare", { percent: formatShare(chipsVerified, total) })} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard accent="tags" icon={Factory} title={t("manufacturingPackage")}>
          <p className="mb-3 text-xs text-white/40">{t("manufacturingIntro")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href={`${exportBase}/export.csv`} download>
                <Download className="h-4 w-4" />
                CSV
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`${exportBase}/qr-assets.zip`} download>
                <Download className="h-4 w-4" />
                QR ZIP (SVG)
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`${exportBase}/qr-assets.zip?png=1`} download>
                <Download className="h-4 w-4" />
                QR ZIP (SVG + PNG)
              </a>
            </Button>
          </div>
        </SectionCard>

        <SectionCard accent="tags" icon={PackagePlus} title={t("givePiecesTitle")}>
          {handOut === 0 ? (
            <p className="text-xs text-white/40">{t("noHouseLeft")}</p>
          ) : giving ? (
            <GiveKitForm fixedBatch={{ id: batch.id, batchCode: batch.batchCode, handOutCount: handOut }} onDone={() => setGiving(false)} />
          ) : (
            <>
              <p className="mb-3 text-xs text-white/40">{t.plural("giveKitIntro", handOut)}</p>
              <Button type="button" variant="brand" accent="tags" onClick={() => setGiving(true)}>
                <PackagePlus className="h-4 w-4" />
                {t("giveAKit")}
              </Button>
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard accent="tags" icon={Layers} title={t("piecesHeading", { count: shown.length })}>
        <FilterBar
          className="mb-3"
          testId="batch-pieces-filters"
          secondary={
            <FilterChips
              items={FILTERS.map((f) => ({ id: f.id, label: t(f.label), count: pieces.filter((p) => passes(f, p)).length }))}
              value={filter}
              onChange={(pieces) => pieceFilter.set({ pieces })}
              ariaLabel={t("piecesHeading", { count: total })}
            />
          }
          summary={{ shown: shown.length, total, active: filter !== "all", onClear: () => pieceFilter.reset() }}
        />
        <PieceTable
          pieces={shown}
          onOpen={(pieceId) => go(`/pieces/${pieceId}`)}
          columns={["customer", "reseller", "scans", "sold"]}
          pageSize={25}
          empty={t("noPiecesMatch")}
          testId="admin-batch-pieces"
        />
      </SectionCard>

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ batchId: batch.id }} filters={{}} title={t("batchJourney")} />
    </div>
  );
}
