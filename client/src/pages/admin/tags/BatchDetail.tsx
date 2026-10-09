import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Factory, PackagePlus, Pencil } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { resolveTagFace } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, getJson, invalidateAdminTags, percent, sendJson } from "./api";
import { BTN, BTN_GHOST, CARD, INPUT, SectionTitle, Stat } from "./ui";
import { BatchStatusPill, ErrorLine, Field, Loading, PieceTable, SELECT, isHouseStock, isUnsoldWithReseller, useTagCatalog } from "./batches-shared";
import { useTagLabels } from "./labels";
import { GiveKitForm } from "./kits-give-form";
import { JourneyPanel } from "./JourneyPanel";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

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
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  tags: TagListItem[];
}

const FILTERS = [
  { id: "all", label: "filterAll", test: () => true },
  { id: "house", label: "houseStock", test: isHouseStock },
  { id: "resellers", label: "withResellers", test: (t: TagListItem) => t.repId !== null },
  { id: "sold", label: "sold", test: (t: TagListItem) => t.status !== "inventory" },
  { id: "live", label: "live", test: (t: TagListItem) => t.status === "active" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function EditBatch({ batch, onClose }: { batch: BatchDetailData; onClose: () => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { data: catalog = [] } = useTagCatalog();
  const initial = () => ({ name: batch.name, face: batch.face ?? "", vendor: batch.vendor ?? "", notes: batch.notes ?? "", status: batch.status, salesProductId: batch.salesProductId ? String(batch.salesProductId) : "" });
  const [form, setForm] = useState(initial);
  useEffect(() => {
    setForm(initial());
  },[batch.name, batch.face, batch.vendor, batch.notes, batch.status, batch.salesProductId]);

  const save = useMutation({
    mutationFn: () =>
      sendJson("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, {
        name: form.name,
        face: form.face || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        status: form.status,
        salesProductId: Number(form.salesProductId),
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("fieldName")} className="sm:col-span-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label={tm("colStatus")}>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={SELECT}>
            {labels.batchStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fieldCatalogProduct")} hint={t("catalogProductHint")}>
          <select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} className={SELECT} required>
            <option value="">{t("chooseCatalogProduct")}</option>
            {catalog.map((product) => (
              <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label={t("fieldPrintedOnPieces")} hint={t("printedHintEdit")}>
          <div className="flex items-center gap-2">
            <TagFaceIcon face={resolveTagFace({ batchFace: form.face || null, productType: batch.productType })} size="sm" />
            <select value={form.face} onChange={(e) => setForm({ ...form, face: e.target.value })} className={SELECT}>
              <option value="">{batch.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")}</option>
              {labels.faceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label={t("fieldVendor")}>
          <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label={t("fieldNotes")} className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={2} className={`${INPUT} resize-y`} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN_GHOST}>
          {tc("cancel")}
        </button>
        <button type="submit" disabled={!form.name.trim() || !form.salesProductId || save.isPending} className={BTN}>
          {save.isPending ? t("saving") : tc("save")}
        </button>
      </div>
    </form>
  );
}

/** One production batch: info, factory downloads, its pieces, and kits from it. */
export function BatchDetail({ id, go }: { id: string; go: (path: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [giving, setGiving] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const t = useT(manageTagsBatchesMessages);
  const labels = useTagLabels();
  const { data: batch, isLoading, isError } = useQuery<BatchDetailData>({
    queryKey: [ADMIN_TAGS_KEY, "batch", id],
    queryFn: () => getJson(`/api/xpot/admin/tag-batches/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
  });

  const back = (
    <button type="button" onClick={() => go("/batches")} className={BTN_GHOST}>
      <ArrowLeft className="h-4 w-4" />
      {t("allBatches")}
    </button>
  );

  if (isLoading) return <Loading />;
  if (isError || !batch) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorLine>{t("batchNotFound")}</ErrorLine>
      </div>
    );
  }

  const pieces = batch.tags;
  const total = pieces.length;
  const house = pieces.filter(isHouseStock).length;
  const withResellers = pieces.filter((p) => p.repId !== null).length;
  const unsoldInKits = pieces.filter(isUnsoldWithReseller).length;
  const sold = pieces.filter((p) => p.status !== "inventory").length;
  const live = pieces.filter((p) => p.status === "active").length;
  const chipsVerified = pieces.filter((p) => p.nfcStatus === "verified" || p.nfcStatus === "locked").length;
  const exportBase = `/api/xpot/admin/tag-batches/${encodeURIComponent(batch.id)}`;
  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = pieces.filter(activeFilter.test);
  const face = resolveTagFace({ batchFace: batch.face, productType: batch.productType });

  return (
    <div className="space-y-5">
      {back}

      <div className={`${CARD} space-y-4 p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TagPieceVisual productType={batch.productType} face={face} size="md" />
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-bold text-white">{batch.batchCode}</h2>
              <BatchStatusPill status={batch.status} />
              <TagModelChips productType={batch.productType} face={face} batchCode={batch.batchCode} />
            </div>
            <p className="mt-0.5 text-sm text-white/70">{batch.name}</p>
            <p className="text-xs text-white/40">
              {labels.product(batch.productType)} · {labels.face(face)} · {batch.vendor || t("noVendor")} · {t.plural("orderedCount", batch.quantity)} ·{" "}
              {t("createdOn", { date: formatDate(batch.createdAt) })}
            </p>
            {batch.notes && !editing && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{batch.notes}</p>}
          </div>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className={BTN_GHOST}>
              <Pencil className="h-4 w-4" />
              {t("edit")}
            </button>
          )}
        </div>
        {editing && <EditBatch batch={batch} onClose={() => setEditing(false)} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("houseStock")} value={house} hint={t.plural("houseShare", total, { percent: percent(house, total) })} />
        <Stat label={t("withResellers")} value={withResellers} hint={t.plural("unsoldInKits", unsoldInKits)} />
        <Stat label={t("sold")} value={sold} hint={t.plural("liveCount", live)} />
        <Stat label={t("nfcVerified")} value={chipsVerified} hint={t("chipsShare", { percent: percent(chipsVerified, total) })} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Factory className="h-4 w-4 text-white/50" />
            {t("manufacturingPackage")}
          </p>
          <p className="mb-3 text-xs text-white/40">{t("manufacturingIntro")}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`${exportBase}/export.csv`} download className={BTN_GHOST}>
              <Download className="h-4 w-4" />
              CSV
            </a>
            <a href={`${exportBase}/qr-assets.zip`} download className={BTN_GHOST}>
              <Download className="h-4 w-4" />
              QR ZIP (SVG)
            </a>
            <a href={`${exportBase}/qr-assets.zip?png=1`} download className={BTN_GHOST}>
              <Download className="h-4 w-4" />
              QR ZIP (SVG + PNG)
            </a>
          </div>
        </div>

        <div className={`${CARD} p-4`}>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <PackagePlus className="h-4 w-4 text-white/50" />
            {t("givePiecesTitle")}
          </p>
          {house === 0 ? (
            <p className="text-xs text-white/40">{t("noHouseLeft")}</p>
          ) : giving ? (
            <div className="pt-2">
              <GiveKitForm
                fixedBatch={{ id: batch.id, batchCode: batch.batchCode, houseCount: house }}
                onDone={() => setGiving(false)}
              />
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-white/40">{t.plural("giveKitIntro", house)}</p>
              <button type="button" onClick={() => setGiving(true)} className={BTN}>
                <PackagePlus className="h-4 w-4" />
                {t("giveAKit")}
              </button>
            </>
          )}
        </div>
      </div>

      <section>
        <SectionTitle
          right={
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === f.id ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
                  }`}
                >
                  {t(f.label)}
                </button>
              ))}
            </div>
          }
        >
          {t("piecesHeading", { count: shown.length })}
        </SectionTitle>
        <div className={`${CARD} overflow-hidden`}>
          <PieceTable pieces={shown} go={go} showBatch={false} empty={t("noPiecesMatch")} />
        </div>
      </section>

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ batchId: batch.id }} filters={{}} title={t("batchJourney")} />
    </div>
  );
}
