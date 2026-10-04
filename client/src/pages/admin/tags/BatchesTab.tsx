import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { TAG_MAX_BATCH_QUANTITY, TAG_PRODUCT_TYPES, normalizeTagCode } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, formatDate, invalidateAdminTags, sendJson } from "./api";
import { BTN, BTN_GHOST, CARD, Empty, INPUT, SectionTitle, Stat, TD, TH } from "./ui";
import { BatchStatusPill, ErrorLine, Field, Loading, PRODUCT_OPTIONS, SELECT, productLabel, useBatches } from "./batches-shared";

const EMPTY_FORM = {
  name: "",
  batchCode: "",
  productType: TAG_PRODUCT_TYPES[0] as string,
  vendor: "",
  quantity: "100",
  notes: "",
  publicCodes: "",
};

function NewBatchForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
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
        vendor: form.vendor || null,
        quantity,
        notes: form.notes || null,
        publicCodes: publicCodes || undefined,
      }),
    onSuccess: (batch) => {
      void invalidateAdminTags();
      toast({ title: `Batch ${batch.batchCode} created`, description: `${quantity} pieces are in house stock.` });
      onCreated(batch.id);
    },
    onError: (err) => toast({ title: "Could not create batch", description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !create.isPending) create.mutate();
  };

  return (
    <form onSubmit={submit} className={`${CARD} space-y-4 p-4`} data-testid="admin-tags-new-batch-form">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">New production batch</p>
          <p className="text-xs text-white/40">
            Generate new permanent codes, or import the exact codes from pieces that were already printed. Then download the CSV
            and QR artwork for the factory.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Google Review signs — first run" className={INPUT} autoFocus />
        </Field>
        <Field label="Product">
          <select value={form.productType} onChange={(e) => set({ productType: e.target.value })} className={SELECT}>
            {PRODUCT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity *" hint={`1 to ${TAG_MAX_BATCH_QUANTITY}`}>
          <input
            type="number"
            min={1}
            max={TAG_MAX_BATCH_QUANTITY}
            value={form.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            className={`${INPUT} tabular-nums`}
          />
        </Field>
        <Field label="Batch code" hint="Leave empty for automatic, e.g. REV-2026-001.">
          <input
            value={form.batchCode}
            onChange={(e) => set({ batchCode: e.target.value.toUpperCase() })}
            maxLength={40}
            placeholder="Automatic"
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Vendor">
          <input value={form.vendor} onChange={(e) => set({ vendor: e.target.value })} maxLength={120} className={INPUT} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} rows={2} className={`${INPUT} resize-y`} />
        </Field>
        <Field
          label="Already-printed codes (optional)"
          hint={
            importing
              ? validPublicCodes
                ? `${publicCodes.length} valid unique codes — these will be preserved exactly.`
                : `Enter exactly ${validQuantity ? quantity : "the quantity"} valid unique codes.`
              : "Migration only. One code per line; leave empty to generate new codes."
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
          Cancel
        </button>
        <button type="submit" disabled={!ready || create.isPending} className={BTN} data-testid="admin-tags-new-batch-submit">
          {create.isPending ? (importing ? "Importing…" : "Generating…") : `${importing ? "Import" : "Generate"} ${validQuantity ? quantity : ""} pieces`}
        </button>
      </div>
    </form>
  );
}

/** Production batches from the factory: what was made, how much is still in house. */
export function BatchesTab({ go }: { go: (path: string) => void }) {
  const { data: batches = [], isLoading, isError } = useBatches();
  const [creating, setCreating] = useState(false);

  const totals = batches.reduce(
    (acc, b) => ({ pieces: acc.pieces + b.tagCount, house: acc.house + b.houseCount, out: acc.out + b.withResellersCount, active: acc.active + b.activeCount }),
    { pieces: 0, house: 0, out: 0, active: 0 },
  );

  return (
    <div className="space-y-5">
      {batches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Batches" value={batches.length} hint={`${totals.pieces} pieces made`} />
          <Stat label="In house stock" value={totals.house} hint="Unsold, not in a kit" />
          <Stat label="With resellers" value={totals.out} hint="Handed out, sold or not" />
          <Stat label="Live" value={totals.active} hint="Active pieces" />
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
                New batch
              </button>
            )
          }
        >
          Batches
        </SectionTitle>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <ErrorLine>Could not load batches.</ErrorLine>
        ) : batches.length === 0 ? (
          <Empty>No batches yet. Create one to generate codes and the printable QR artwork.</Empty>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-white/10">
                <tr>
                  <th className={TH}>Batch</th>
                  <th className={TH}>Product</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Qty</th>
                  <th className={`${TH} text-right`}>House</th>
                  <th className={`${TH} text-right`}>With resellers</th>
                  <th className={`${TH} text-right`}>Live</th>
                  <th className={`${TH} text-right`}>NFC verified</th>
                  <th className={TH}>Created</th>
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
                    <td className={TD}>
                      <p className="font-mono font-semibold text-white">{b.batchCode}</p>
                      <p className="max-w-[240px] truncate text-xs text-white/40">
                        {b.name}
                        {b.vendor ? ` · ${b.vendor}` : ""}
                      </p>
                    </td>
                    <td className={TD}>{productLabel(b.productType)}</td>
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
