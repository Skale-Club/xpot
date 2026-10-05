import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Factory, PackagePlus, Pencil } from "lucide-react";
import type { TagListItem } from "@shared/tagsApi";
import { TAG_BATCH_STATUSES } from "@shared/tags";
import { resolveTagFace, tagFaceLabel } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, formatDate, getJson, invalidateAdminTags, percent, sendJson } from "./api";
import { BTN, BTN_GHOST, CARD, INPUT, SectionTitle, Stat } from "./ui";
import {
  BatchStatusPill,
  ErrorLine,
  FACE_OPTIONS,
  Field,
  Loading,
  PieceTable,
  SELECT,
  capitalize,
  isHouseStock,
  isUnsoldWithReseller,
  productLabel,
} from "./batches-shared";
import { GiveKitForm } from "./kits-give-form";
import { JourneyPanel } from "./JourneyPanel";

interface BatchDetailData {
  id: string;
  batchCode: string;
  name: string;
  productType: string;
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
  { id: "all", label: "All", test: () => true },
  { id: "house", label: "House stock", test: isHouseStock },
  { id: "resellers", label: "With resellers", test: (t: TagListItem) => t.repId !== null },
  { id: "sold", label: "Sold", test: (t: TagListItem) => t.status !== "inventory" },
  { id: "live", label: "Live", test: (t: TagListItem) => t.status === "active" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function EditBatch({ batch, onClose }: { batch: BatchDetailData; onClose: () => void }) {
  const { toast } = useToast();
  const initial = () => ({ name: batch.name, face: batch.face ?? "", vendor: batch.vendor ?? "", notes: batch.notes ?? "", status: batch.status });
  const [form, setForm] = useState(initial);
  useEffect(() => {
    setForm(initial());
  },[batch.name, batch.face, batch.vendor, batch.notes, batch.status]);

  const save = useMutation({
    mutationFn: () =>
      sendJson("PATCH", `/api/xpot/admin/tag-batches/${batch.id}`, {
        name: form.name,
        face: form.face || null,
        vendor: form.vendor || null,
        notes: form.notes || null,
        status: form.status,
      }),
    onSuccess: () => {
      void invalidateAdminTags();
      toast({ title: "Batch updated" });
      onClose();
    },
    onError: (err) => toast({ title: "Could not update batch", description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim() && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/5 pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" className="sm:col-span-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={SELECT}>
            {TAG_BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Printed on the pieces" hint="Pieces with their own setting keep it.">
          <div className="flex items-center gap-2">
            <TagFaceIcon face={resolveTagFace({ batchFace: form.face || null, productType: batch.productType })} size="sm" />
            <select value={form.face} onChange={(e) => setForm({ ...form, face: e.target.value })} className={SELECT}>
              <option value="">{batch.productType === "google_review_sign" ? "From the product (Google review)" : "Not set"}</option>
              {FACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Vendor">
          <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={2} className={`${INPUT} resize-y`} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN_GHOST}>
          Cancel
        </button>
        <button type="submit" disabled={!form.name.trim() || save.isPending} className={BTN}>
          {save.isPending ? "Saving…" : "Save"}
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
  const { data: batch, isLoading, isError } = useQuery<BatchDetailData>({
    queryKey: [ADMIN_TAGS_KEY, "batch", id],
    queryFn: () => getJson(`/api/xpot/admin/tag-batches/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
  });

  const back = (
    <button type="button" onClick={() => go("/batches")} className={BTN_GHOST}>
      <ArrowLeft className="h-4 w-4" />
      All batches
    </button>
  );

  if (isLoading) return <Loading />;
  if (isError || !batch) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorLine>Batch not found.</ErrorLine>
      </div>
    );
  }

  const pieces = batch.tags;
  const total = pieces.length;
  const house = pieces.filter(isHouseStock).length;
  const withResellers = pieces.filter((t) => t.repId !== null).length;
  const unsoldInKits = pieces.filter(isUnsoldWithReseller).length;
  const sold = pieces.filter((t) => t.status !== "inventory").length;
  const live = pieces.filter((t) => t.status === "active").length;
  const chipsVerified = pieces.filter((t) => t.nfcStatus === "verified" || t.nfcStatus === "locked").length;
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
          <TagFaceIcon face={face} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-bold text-white">{batch.batchCode}</h2>
              <BatchStatusPill status={batch.status} />
            </div>
            <p className="mt-0.5 text-sm text-white/70">{batch.name}</p>
            <p className="text-xs text-white/40">
              {productLabel(batch.productType)} · {face ? tagFaceLabel(face) : "Print not recorded"} · {batch.vendor || "No vendor"} · {batch.quantity} ordered · created {formatDate(batch.createdAt)}
            </p>
            {batch.notes && !editing && <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">{batch.notes}</p>}
          </div>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className={BTN_GHOST}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
        {editing && <EditBatch batch={batch} onClose={() => setEditing(false)} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="House stock" value={house} hint={`${percent(house, total)} of ${total} pieces`} />
        <Stat label="With resellers" value={withResellers} hint={`${unsoldInKits} unsold in kits`} />
        <Stat label="Sold" value={sold} hint={`${live} live`} />
        <Stat label="NFC verified" value={chipsVerified} hint={`${percent(chipsVerified, total)} of chips`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Factory className="h-4 w-4 text-white/50" />
            Manufacturing package
          </p>
          <p className="mb-3 text-xs text-white/40">
            The CSV maps serial → code → QR/NFC link → QR file. The ZIP holds the CSV plus one SVG (optionally a 1200px PNG) per piece. Program
            each NFC chip with its row's nfc_url and lock it only after its QR and NFC both pass a phone test.
          </p>
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
            Give pieces to a reseller
          </p>
          {house === 0 ? (
            <p className="text-xs text-white/40">No pieces of this batch are left in house stock.</p>
          ) : giving ? (
            <div className="pt-2">
              <GiveKitForm
                fixedBatch={{ id: batch.id, batchCode: batch.batchCode, houseCount: house }}
                onDone={() => setGiving(false)}
              />
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-white/40">
                Hand the next unsold house pieces of this batch to a reseller as a kit ({house} available).
              </p>
              <button type="button" onClick={() => setGiving(true)} className={BTN}>
                <PackagePlus className="h-4 w-4" />
                Give a kit
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
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          Pieces ({shown.length})
        </SectionTitle>
        <div className={`${CARD} overflow-hidden`}>
          <PieceTable pieces={shown} go={go} showBatch={false} empty="No pieces match this filter." />
        </div>
      </section>

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ batchId: batch.id }} filters={{}} title="Batch journey" />
    </div>
  );
}
