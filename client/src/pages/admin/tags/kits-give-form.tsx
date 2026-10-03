import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import type { TagKitItem } from "@shared/tagsApi";
import { TAG_MAX_BATCH_QUANTITY, normalizeTagCode } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { BTN, INPUT } from "./ui";
import { Field, ResellerSelect, SELECT, hasTagsModule, productLabel, useBatches, useResellers } from "./batches-shared";

/**
 * Codes typed or pasted by the admin: one per line or comma/semicolon
 * separated. A chunk that is not a code as a whole is split on spaces.
 */
export function parseCodes(text: string): { codes: string[]; invalid: string[] } {
  const codes: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const add = (code: string) => {
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  };
  for (const chunk of text.split(/[\n\r,;]+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const whole = normalizeTagCode(trimmed);
    if (whole) {
      add(whole);
      continue;
    }
    for (const part of trimmed.split(/\s+/)) {
      const code = normalizeTagCode(part);
      if (code) add(code);
      else invalid.push(part);
    }
  }
  return { codes, invalid };
}

type Mode = "batch" | "codes";

/**
 * "Give a kit": pieces from house stock to a reseller, either the next N of a
 * batch or exact printed codes. With `fixedBatch` it only offers that batch.
 */
export function GiveKitForm({
  fixedBatch,
  onDone,
}: {
  fixedBatch?: { id: string; batchCode: string; houseCount: number };
  onDone?: (kit: TagKitItem) => void;
}) {
  const { toast } = useToast();
  const { data: reps = [] } = useResellers();
  const { data: batches = [] } = useBatches();
  const [repId, setRepId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("batch");
  const [batchId, setBatchId] = useState<string>("");
  const [quantity, setQuantity] = useState("10");
  const [codesText, setCodesText] = useState("");
  const [note, setNote] = useState("");

  const effectiveMode: Mode = fixedBatch ? "batch" : mode;
  const rep = reps.find((r) => r.id === repId) ?? null;
  const batchOptions = batches.filter((b) => b.houseCount > 0);
  const chosenBatch = fixedBatch ?? batchOptions.find((b) => b.id === batchId) ?? null;
  const available = chosenBatch?.houseCount ?? 0;
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty >= 1 && qty <= Math.min(available, TAG_MAX_BATCH_QUANTITY);
  const parsed = useMemo(() => parseCodes(codesText), [codesText]);
  const validCodes = parsed.codes.length > 0 && parsed.invalid.length === 0 && parsed.codes.length <= TAG_MAX_BATCH_QUANTITY;

  const ready = !!repId && (effectiveMode === "batch" ? !!chosenBatch && validQty : validCodes);
  const pieceCount = effectiveMode === "batch" ? (validQty ? qty : 0) : parsed.codes.length;

  const give = useMutation({
    mutationFn: () =>
      sendJson<TagKitItem>("POST", "/api/xpot/admin/tag-kits", {
        repId,
        ...(effectiveMode === "batch" ? { batchId: chosenBatch!.id, quantity: qty } : { codes: parsed.codes }),
        note: note.trim() || null,
      }),
    onSuccess: (kit) => {
      void invalidateAdminTags();
      toast({
        title: "Kit recorded",
        description: `${kit.pieceCount} piece${kit.pieceCount === 1 ? "" : "s"} now with ${kit.repName ?? rep?.displayName ?? "the reseller"}.`,
      });
      setCodesText("");
      setNote("");
      onDone?.(kit);
    },
    onError: (err) => toast({ title: "Could not give the kit", description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !give.isPending) give.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="admin-tags-give-kit">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Reseller"
          hint={
            rep && !hasTagsModule(rep) ? (
              <span className="text-amber-300/80">Tags module is off for {rep.displayName}: they won't see these pieces in the app until you turn it on in Reps.</span>
            ) : undefined
          }
        >
          <ResellerSelect value={repId} onChange={setRepId} />
        </Field>
        <Field label="Note (optional)" hint="Where it was agreed, e.g. “WhatsApp order #12”.">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="WhatsApp order #12" className={INPUT} />
        </Field>
      </div>

      {!fixedBatch && (
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1" role="tablist">
          {(
            [
              { id: "batch", label: "From a batch" },
              { id: "codes", label: "Exact codes" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                mode === m.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {effectiveMode === "batch" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          {fixedBatch ? (
            <Field label="Batch">
              <p className="py-2 text-sm text-white/80">
                <span className="font-mono">{fixedBatch.batchCode}</span>
                <span className="text-white/40"> · {fixedBatch.houseCount} in house stock</span>
              </p>
            </Field>
          ) : (
            <Field label="Batch" hint={batchOptions.length === 0 ? "No batch has pieces left in house stock." : "The next unsold house pieces, by serial number."}>
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={SELECT}>
                <option value="">Choose a batch…</option>
                {batchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchCode} · {productLabel(b.productType)} · {b.houseCount} in house
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Pieces" hint={chosenBatch ? `Up to ${available}` : undefined}>
            <input
              type="number"
              min={1}
              max={available || undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`${INPUT} tabular-nums`}
            />
          </Field>
        </div>
      ) : (
        <Field
          label="Codes"
          hint={
            parsed.invalid.length > 0 ? (
              <span className="text-red-300">Not a code: {parsed.invalid.slice(0, 8).join(", ")}{parsed.invalid.length > 8 ? "…" : ""}</span>
            ) : parsed.codes.length > TAG_MAX_BATCH_QUANTITY ? (
              <span className="text-red-300">At most {TAG_MAX_BATCH_QUANTITY} codes per kit.</span>
            ) : (
              `${parsed.codes.length} code${parsed.codes.length === 1 ? "" : "s"} · one per line or comma separated, as printed on the pieces.`
            )
          }
        >
          <textarea
            value={codesText}
            onChange={(e) => setCodesText(e.target.value)}
            rows={5}
            placeholder={"A7K3P9X2\nB8M4Q1Z3, C9N5R2Y4"}
            className={`${INPUT} resize-y font-mono`}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={!ready || give.isPending} className={BTN} data-testid="admin-tags-give-kit-submit">
          <PackagePlus className="h-4 w-4" />
          {give.isPending
            ? "Saving…"
            : `Give ${pieceCount || ""} piece${pieceCount === 1 ? "" : "s"}${rep ? ` to ${rep.displayName}` : ""}`}
        </button>
      </div>
    </form>
  );
}
