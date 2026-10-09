import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { TAG_MAX_BATCH_QUANTITY, TAG_PRODUCT_TYPES, normalizeTagCode } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagProductThumbnail } from "@/components/xpot/TagProductThumbnail";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { BTN, BTN_GHOST, CARD, Empty, INPUT, SectionTitle, Stat, TD, TH } from "./ui";
import { BatchStatusPill, ErrorLine, Field, Loading, SELECT, useBatches } from "./batches-shared";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

const EMPTY_FORM = {
  name: "",
  batchCode: "",
  productType: TAG_PRODUCT_TYPES[0] as string,
  face: "",
  vendor: "",
  quantity: "100",
  notes: "",
  publicCodes: "",
};

function NewBatchForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsBatchesMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (patch: Partial<typeof EMPTY_FORM>) => setForm((f) => ({ ...f, ...patch }));
  const quantity = Number(form.quantity);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= TAG_MAX_BATCH_QUANTITY;
  const publicCodes = form.publicCodes.trim()
    ? form.publicCodes.split(/[\s,;]+/).filter(Boolean).map((code) => normalizeTagCode(code))
    : undefined;
  const validPublicCodes =
    !publicCodes ||
    (publicCodes.length === quantity && publicCodes.every((code): code is string => code !== null) && new Set(publicCodes).size === publicCodes.length);
  const importing = !!publicCodes;
  const ready = form.name.trim().length > 0 && validQuantity && validPublicCodes;

  const create = useMutation({
    mutationFn: () =>
      sendJson<{ id: string; batchCode: string }>("POST", "/api/xpot/admin/tag-batches", {
        name: form.name,
        batchCode: form.batchCode || undefined,
        productType: form.productType,
        face: form.face || null,
        vendor: form.vendor || null,
        quantity,
        notes: form.notes || null,
        publicCodes: publicCodes || undefined,
      }),
    onSuccess: (batch) => {
      void invalidateAdminTags();
      toast({ title: t("batchCreated", { code: batch.batchCode }), description: t.plural("batchCreatedDesc", quantity) });
      onCreated(batch.id);
    },
    onError: (err) => toast({ title: t("couldNotCreateBatch"), description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !create.isPending) create.mutate();
  };

  return (
    <form onSubmit={submit} className={`${CARD} space-y-4 p-4`} data-testid="admin-tags-new-batch-form">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{t("newBatchTitle")}</p>
          <p className="text-xs text-white/40">{t("newBatchIntro")}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white" aria-label={tc("close")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fieldNameRequired")} className="sm:col-span-2">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder={t("namePlaceholder")} className={INPUT} autoFocus />
        </Field>
        <Field label={t("fieldProduct")}>
          <select value={form.productType} onChange={(e) => set({ productType: e.target.value })} className={SELECT}>
            {labels.productOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("fieldPrintedOnPieces")} hint={t("printedHintNew")} className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <TagFaceIcon face={form.face || (form.productType === "google_review_sign" ? "google_review" : null)} size="md" />
            <select value={form.face} onChange={(e) => set({ face: e.target.value })} className={SELECT}>
              <option value="">{form.productType === "google_review_sign" ? t("faceFromProduct") : t("faceNotSet")}</option>
              {labels.faceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label={t("fieldQuantityRequired")} hint={t("quantityRange", { max: TAG_MAX_BATCH_QUANTITY })}>
          <input
            type="number"
            min={1}
            max={TAG_MAX_BATCH_QUANTITY}
            value={form.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            className={`${INPUT} tabular-nums`}
          />
        </Field>
        <Field label={t("fieldBatchCode")} hint={t("batchCodeHint")}>
          <input
            value={form.batchCode}
            onChange={(e) => set({ batchCode: e.target.value.toUpperCase() })}
            maxLength={40}
            placeholder={t("batchCodeAutomatic")}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label={t("fieldVendor")}>
          <input value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label={t("fieldNotes")} className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} rows={2} className={`${INPUT} resize-y`} />
        </Field>
        <Field
          label={t("fieldLegacyCodes")}
          hint={
            importing
              ? validPublicCodes
                ? t.plural("legacyValid", publicCodes.length)
                : validQuantity
                  ? t.plural("legacyExact", quantity)
                  : t("legacyExactQuantity")
              : t("legacyHint")
          }
          className="sm:col-span-2"
        >
          <textarea
            value={form.publicCodes}
            onChange={(e) => set({ publicCodes: e.target.value })}
            rows={4}
            spellCheck={false}
            placeholder={"Z8MEZP0X\n7414WRMT"}
            className={`${INPUT} resize-y font-mono uppercase`}
            data-testid="admin-tags-legacy-public-codes"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN_GHOST}>
          {tc("cancel")}
        </button>
        <button type="submit" disabled={!ready || create.isPending} className={BTN} data-testid="admin-tags-new-batch-submit">
          {create.isPending
            ? t(importing ? "importing" : "generating")
            : validQuantity
              ? t.plural(importing ? "importPieces" : "generatePieces", quantity)
              : t(importing ? "importPiecesNoCount" : "generatePiecesNoCount")}
        </button>
      </div>
    </form>
  );
}

/** Production batches from the factory: what was made, how much is still in house. */
export function BatchesTab({ go }: { go: (path: string) => void }) {
  const { data: batches = [], isLoading, isError } = useBatches();
  const [creating, setCreating] = useState(false);
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const labels = useTagLabels();

  const totals = batches.reduce(
    (acc, b) => ({ pieces: acc.pieces + b.tagCount, house: acc.house + b.houseCount, out: acc.out + b.withResellersCount, active: acc.active + b.activeCount }),
    { pieces: 0, house: 0, out: 0, active: 0 },
  );

  return (
    <div className="space-y-5">
      {batches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={ts("manageBatches")} value={batches.length} hint={t.plural("piecesMade", totals.pieces)} />
          <Stat label={t("inHouseStock")} value={totals.house} hint={t("inHouseStockHint")} />
          <Stat label={t("withResellers")} value={totals.out} hint={t("withResellersHint")} />
          <Stat label={t("live")} value={totals.active} hint={t("liveHint")} />
        </div>
      )}

      {creating ? (
        <NewBatchForm onClose={() => setCreating(false)} onCreated={(id) => go(`/batches/${id}`)} />
      ) : null}

      <section>
        <SectionTitle
          right={
            !creating && (
              <button type="button" onClick={() => setCreating(true)} className={BTN} data-testid="admin-tags-new-batch">
                <Plus className="h-4 w-4" />
                {t("newBatch")}
              </button>
            )
          }
        >
          {ts("manageBatches")}
        </SectionTitle>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorLine>{tm("couldNotLoad", { what: t("theBatches") })}</ErrorLine>
        ) : batches.length === 0 ? (
          <Empty>{t("noBatchesYet")}</Empty>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={`${TH} w-24 pr-0`}><span className="sr-only">{t("fieldPrintedOnPieces")}</span></th>
                  <th className={TH}>{tm("colBatch")}</th>
                  <th className={TH}>{t("fieldProduct")}</th>
                  <th className={TH}>{tm("colStatus")}</th>
                  <th className={`${TH} text-right`}>{t("colQty")}</th>
                  <th className={`${TH} text-right`}>{tm("house")}</th>
                  <th className={`${TH} text-right`}>{t("withResellers")}</th>
                  <th className={`${TH} text-right`}>{t("live")}</th>
                  <th className={`${TH} text-right`}>{t("nfcVerified")}</th>
                  <th className={TH}>{t("colCreated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => go(`/batches/${b.id}`)}
                    className="cursor-pointer hover:bg-white/[0.03]"
                    data-testid={`admin-tags-batch-${b.batchCode}`}
                  >
                    <td className={`${TD} pr-0`}>
                      <div className="flex items-center gap-2">
                        <TagFaceIcon face={b.face} size="md" />
                        <TagProductThumbnail productType={b.productType} face={b.face} batchCode={b.batchCode} />
                      </div>
                    </td>
                    <td className={TD}>
                      <p className="font-mono font-semibold text-white">{b.batchCode}</p>
                      <p className="max-w-[240px] truncate text-xs text-white/40">
                        {b.name}
                        {b.vendor ? ` · ${b.vendor}` : ""}
                      </p>
                    </td>
                    <td className={TD}>
                      {labels.product(b.productType)}
                      {b.face ? <span className="block text-xs text-white/40">{labels.face(b.face)}</span> : null}
                    </td>
                    <td className={TD}>
                      <BatchStatusPill status={b.status} />
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{b.quantity}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums text-white`}>{b.houseCount}</td>
                    <td className={`${TD} text-right tabular-nums`}>{b.withResellersCount}</td>
                    <td className={`${TD} text-right tabular-nums`}>{b.activeCount}</td>
                    <td className={`${TD} text-right tabular-nums`}>{b.nfcVerifiedCount}</td>
                    <td className={`${TD} whitespace-nowrap text-white/50`}>{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
