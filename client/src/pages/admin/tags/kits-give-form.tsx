import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import type { TagKitItem } from "@shared/tagsApi";
import { TAG_MAX_BATCH_QUANTITY, normalizeTagCode } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { BTN, INPUT } from "./ui";
import { Field, ResellerSelect, SELECT, hasTagsModule, useBatches, useResellers } from "./batches-shared";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

const MODE_KEYS = { batch: "modeBatch", codes: "modeCodes" } as const;

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
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const labels = useTagLabels();
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
      const name = kit.repName ?? rep?.displayName;
      toast({
        title: t("kitRecorded"),
        description: name ? t.plural("kitRecordedDesc", kit.pieceCount, { name }) : t.plural("kitRecordedDescNoName", kit.pieceCount),
      });
      setCodesText("");
      setNote("");
      onDone?.(kit);
    },
    onError: (err) => toast({ title: t("couldNotGiveKit"), description: errorMessage(err), variant: "destructive" }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !give.isPending) give.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="admin-tags-give-kit">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={tm("colReseller")}
          hint={
            rep && !hasTagsModule(rep) ? (
              <span className="text-amber-300/80">{t("tagsOffFor", { name: rep.displayName, screen: ts("orgPeople") })}</span>
            ) : undefined
          }
        >
          <ResellerSelect value={repId} onChange={setRepId} />
        </Field>
        <Field label={t("fieldNoteOptional")} hint={t("noteHint")}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("notePlaceholder")} className={INPUT} />
        </Field>
      </div>

      {!fixedBatch && (
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1" role="tablist">
          {(Object.keys(MODE_KEYS) as Mode[]).map((id) => ({ id, label: t(MODE_KEYS[id]) })).map((m) => (
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
            <Field label={tm("colBatch")}>
              <p className="py-2 text-sm text-white/80">
                <span className="font-mono">{fixedBatch.batchCode}</span>
                <span className="text-white/40"> · {t("inHouseStockCount", { count: fixedBatch.houseCount })}</span>
              </p>
            </Field>
          ) : (
            <Field label={tm("colBatch")} hint={batchOptions.length === 0 ? t("noBatchWithHouse") : t("nextHousePieces")}>
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={SELECT}>
                <option value="">{t("chooseBatch")}</option>
                {batchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchCode} · {labels.product(b.productType)}{b.face ? ` · ${labels.face(b.face)}` : ""} · {t("inHouseCount", { count: b.houseCount })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t("fieldPieces")} hint={chosenBatch ? t("upTo", { count: available }) : undefined}>
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
          label={t("fieldCodes")}
          hint={
            parsed.invalid.length > 0 ? (
              <span className="text-red-300">{t("notACode", { codes: parsed.invalid.slice(0, 8).join(", ") + (parsed.invalid.length > 8 ? "…" : "") })}</span>
            ) : parsed.codes.length > TAG_MAX_BATCH_QUANTITY ? (
              <span className="text-red-300">{t("atMostCodes", { max: TAG_MAX_BATCH_QUANTITY })}</span>
            ) : (
              t.plural("giveCodesCount", parsed.codes.length)
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
            ? t("saving")
            : pieceCount
              ? rep
                ? t.plural("givePiecesTo", pieceCount, { name: rep.displayName })
                : t.plural("givePieces", pieceCount)
              : rep
                ? t("giveNoCountTo", { name: rep.displayName })
                : t("giveNoCount")}
        </button>
      </div>
    </form>
  );
}
