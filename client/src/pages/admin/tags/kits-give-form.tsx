import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Layers, PackagePlus, ScanLine, ShoppingBag, Type } from "lucide-react";
import type { TagKitItem } from "@shared/tagsApi";
import type { DistributionCheck } from "@shared/tagDistribution";
import { receiveBlockers } from "@shared/tagDistribution";
import { TAG_MAX_BATCH_QUANTITY, normalizeTagCode } from "@shared/tags";
import { KIT_COST_CURRENCY, kitCostRequired, kitOwnership, parseKitUnitCost, type KitOwnership } from "@shared/tagKits";
import { useToast } from "@/hooks/use-toast";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Segmented } from "@/components/xpot/Segmented";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_SUBTLE_CLASS, MODULE_ACCENT } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { ResellerSelect, useResellers, type Reseller } from "./batches-shared";
import { useBatchOptions } from "./pieces-shared";
import { PackingListDialog } from "./kits-list";
import { useTagLabels } from "./labels";
import { addCodes, RECEIVE_BLOCKER_KEYS } from "./distribution-model";
import { readCode } from "./batches-model";
import { CodeCheckList, useCodeCheck } from "./code-check-list";
import { CameraButton, CodeEntry, ContinuousCamera, feedback } from "./scan-station";

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

type PieceMode = "scan" | "type" | "batch";
/** A mode's icon over its name on a phone (the three share a narrow row and "Next from a batch" wraps), beside it from sm. */
const MODE_LABEL = "inline-flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5";

/** One numbered step of the flow. */
function Step({ n, title, done, disabled, children, testId }: { n: number; title: string; done?: boolean; disabled?: boolean; children: ReactNode; testId?: string }) {
  return (
    <section className={`rounded-2xl ${GLASS_SUBTLE_CLASS} p-4 ${disabled ? "opacity-50" : ""}`} aria-disabled={disabled} data-testid={testId}>
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-white">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-violet-500/30 text-violet-100" : "bg-white/10 text-white/70"}`}
          aria-hidden="true"
        >
          {n}
        </span>
        {title}
      </h3>
      {disabled ? null : children}
    </section>
  );
}

/** What the chosen reseller's cost rule means, and whether they can receive pieces now. */
function ResellerCard({ rep }: { rep: Reseller }) {
  const t = useT(adminTagsFlowMessages);
  const ts = useT(shellMessages);
  const blockers = receiveBlockers(rep);
  const configured = !!rep.costPolicyConfiguredAt;
  return (
    <div className="mt-3 space-y-2" data-testid="handout-reseller-card">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone="violet">{rep.costPolicy === "zero" ? t("policyZero") : t("policyAcquisition")}</Pill>
        {!configured ? <Pill tone="amber">{t("policyNotSet")}</Pill> : null}
        {blockers.length === 0 ? <Pill tone="slate">{t("canReceive")}</Pill> : null}
      </div>
      <p className="text-xs text-white/50">{rep.costPolicy === "zero" ? t("policyZeroHint") : t("policyAcquisitionHint")}</p>
      {blockers.map((b) => (
        <InlineAlert key={b} tone={b === "tags_off" ? "warning" : "error"}>
          {t(RECEIVE_BLOCKER_KEYS[b], { name: rep.displayName, screen: ts("orgPeople") })}
        </InlineAlert>
      ))}
    </div>
  );
}

/**
 * Distribution › Hand out: pieces from house stock to a reseller, step by step. (1) the reseller, with their cost rule
 * and whether they can receive; (2) consignment or a purchase, defaulting to the rule; (3) the exact pieces, scanned,
 * typed or "next N of a batch", each checked by the server's dry run as the list builds; (4) confirm: the kit is
 * recorded and its packing list opens. `?batch=<id>` (Batch detail › Hand out) starts on that batch.
 */
export function HandOutFlow() {
  const { toast } = useToast();
  const t = useT(adminTagsFlowMessages);
  const tb = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const labels = useTagLabels();
  const { data: reps = [] } = useResellers();
  const { data: batches = [] } = useBatchOptions();
  const url = useUrlFilters({ batch: "" });
  const [repId, setRepId] = useState<number | null>(null);
  const [ownershipChoice, setOwnershipChoice] = useState<KitOwnership | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<PieceMode>(url.values.batch ? "batch" : "scan");
  const [camera, setCamera] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [batchId, setBatchId] = useState(url.values.batch);
  const [quantity, setQuantity] = useState("10");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [packing, setPacking] = useState<TagKitItem | null>(null);

  const rep = reps.find((r) => r.id === repId) ?? null;
  const policy = rep?.costPolicy ?? "acquisition";
  // A new reseller resets the choice to their rule.
  useEffect(() => setOwnershipChoice(null), [repId]);
  const ownership: KitOwnership = ownershipChoice ?? kitOwnership(policy);
  const costRequired = kitCostRequired(policy, ownership);
  const cost = parseKitUnitCost(unitCost, costRequired);
  const blockers = rep ? receiveBlockers(rep).filter((b) => b !== "tags_off") : [];

  const check = useCodeCheck("handOut", codes);
  const okCodes = useMemo(() => codes.filter((code) => check.data?.items.find((i) => i.code === code)?.ok), [codes, check.data]);
  const checked = !check.isFetching && !!check.data && codes.every((code) => check.data!.items.some((i) => i.code === code));

  const batchOptions = batches.filter((b) => b.handOutCount > 0 || b.id === batchId);
  const chosenBatch = batches.find((b) => b.id === batchId) ?? null;
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty >= 1 && qty <= Math.min(chosenBatch?.handOutCount ?? 0, TAG_MAX_BATCH_QUANTITY);

  const addReads = (reads: string[], fromCamera = false) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of reads) {
      const code = readCode(raw, [window.location.hostname]);
      if (code) valid.push(code);
      else invalid.push(raw);
    }
    const result = addCodes(codes, valid);
    if (result.list.length > TAG_MAX_BATCH_QUANTITY) {
      setEntryError(tb("atMostCodes", { max: TAG_MAX_BATCH_QUANTITY }));
      feedback("error");
      return;
    }
    setCodes(result.list);
    setEntryError(invalid.length ? tb("notACode", { codes: invalid.slice(0, 6).join(", ") }) : result.repeated.length ? t("alreadyOnList", { codes: result.repeated.slice(0, 6).join(", ") }) : null);
    if (fromCamera || reads.length === 1) feedback(invalid.length ? "error" : result.added.length ? "ok" : "warn");
  };

  const nextFromBatch = useMutation({
    mutationFn: () => sendJson<DistributionCheck>("POST", "/api/xpot/admin/tag-kits/check", { batchId, quantity: qty }),
    onSuccess: (result) => {
      const merged = addCodes(codes, result.items.map((i) => i.code));
      setCodes(merged.list);
      setEntryError(merged.added.length < qty ? t("batchShort", { count: merged.added.length }) : null);
    },
    onError: (err) => setEntryError(errorMessage(err)),
  });

  const give = useMutation({
    mutationFn: () =>
      sendJson<TagKitItem>("POST", "/api/xpot/admin/tag-kits", {
        repId,
        codes: okCodes,
        ownershipType: ownership,
        note: note.trim() || null,
        ...(cost.ok && cost.cents !== undefined ? { unitCostCents: cost.cents } : {}),
      }),
    onSuccess: (kit) => {
      void invalidateAdminTags();
      toast({
        title: t("kitRecordedCode", { code: kit.kitCode }),
        description: kit.repName ? tb.plural("kitRecordedDesc", kit.handedOutCount, { name: kit.repName }) : tb.plural("kitRecordedDescNoName", kit.handedOutCount),
      });
      setCodes((list) => list.filter((code) => !okCodes.includes(code)));
      setNote("");
      setUnitCost("");
      setPacking(kit);
    },
    onError: (err) => toast({ title: tb("couldNotGiveKit"), description: errorMessage(err), variant: "destructive" }),
  });

  const left = codes.length - okCodes.length;
  const ready = !!rep && blockers.length === 0 && cost.ok && okCodes.length > 0 && checked && !give.isPending;
  const repName = rep?.displayName ?? "";

  return (
    <div className="space-y-3" data-testid="admin-tags-hand-out">
      <Step n={1} title={t("stepReseller")} done={!!rep} testId="handout-step-reseller">
        <Field label={tm("colReseller")}>
          <ResellerSelect value={repId} onChange={setRepId} />
        </Field>
        {rep ? <ResellerCard rep={rep} /> : null}
      </Step>

      <Step n={2} title={t("stepOwnership")} done={!!rep && cost.ok} disabled={!rep} testId="handout-step-ownership">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("stepOwnership")}>
          {(["company", "rep"] as const).map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border p-3 transition-colors ${ownership === value ? "border-violet-400/40 bg-violet-500/[0.1]" : "border-white/10 hover:bg-white/[0.03]"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <input type="radio" name="ownership" value={value} checked={ownership === value} onChange={() => setOwnershipChoice(value)} className="h-4 w-4 accent-violet-500" />
                {value === "company" ? <Building2 className="h-4 w-4 text-white/50" /> : <ShoppingBag className="h-4 w-4 text-white/50" />}
                {value === "company" ? t("ownershipCompany") : t("ownershipRep")}
                {value === kitOwnership(policy) ? <span className="text-xs font-normal text-white/40">{t("ownershipDefault")}</span> : null}
              </span>
              <span className="mt-1 block text-xs text-white/45">{value === "company" ? t("ownershipCompanyHint") : t("ownershipRepHint")}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label={`${tb(costRequired ? "fieldUnitCost" : "fieldUnitCostOptional")} (${KIT_COST_CURRENCY})`}
            hint={!cost.ok && cost.reason === "invalid" ? <span className="text-red-300">{tb("unitCostInvalid")}</span> : t(costRequired ? "costRequiredHint" : "costOptionalHint")}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="0.00"
              required={costRequired}
              className="tabular-nums"
              data-testid="input-kit-unit-cost"
            />
          </Field>
          <Field label={tb("fieldNoteOptional")} hint={tb("noteHint")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={tb("notePlaceholder")} />
          </Field>
        </div>
      </Step>

      <Step n={3} title={t("stepPieces")} done={okCodes.length > 0} disabled={!rep} testId="handout-step-pieces">
        <Segmented<PieceMode>
          items={[
            { id: "scan", label: <span className={MODE_LABEL}><ScanLine className="h-3.5 w-3.5" />{t("modeScan")}</span> },
            { id: "type", label: <span className={MODE_LABEL}><Type className="h-3.5 w-3.5" />{t("modeType")}</span> },
            { id: "batch", label: <span className={MODE_LABEL}><Layers className="h-3.5 w-3.5" />{t("modeBatch")}</span> },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setEntryError(null);
            if (next !== "scan") setCamera(false);
          }}
          accent="tags"
          ariaLabel={t("stepPieces")}
          className="mb-3"
        />
        {mode === "scan" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 basis-64">
                <CodeEntry onReads={(reads) => addReads(reads)} testId="handout-code-entry" autoFocus={false} />
              </div>
              <CameraButton on={camera} onToggle={() => setCamera((v) => !v)} />
            </div>
            {camera ? <ContinuousCamera onRead={(text) => addReads([text], true)} onClose={() => setCamera(false)} /> : null}
          </div>
        ) : mode === "type" ? (
          <div className="space-y-2">
            <Textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={4}
              placeholder={"A7K3P9X2\nB8M4Q1Z3, C9N5R2Y4"}
              aria-label={tb("fieldCodes")}
              className="font-mono"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={!typed.trim()}
                onClick={() => {
                  const parsed = parseCodes(typed);
                  addReads([...parsed.codes, ...parsed.invalid]);
                  setTyped("");
                }}
              >
                {t("addToList")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label={tm("colBatch")} hint={batchOptions.length === 0 ? tb("noBatchWithHouse") : tb("nextHousePieces")}>
              <Select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder={tb("chooseBatch")}
                options={batchOptions.map((b) => ({
                  value: b.id,
                  label: `${b.batchCode} · ${labels.product(b.productType)}${b.face ? ` · ${labels.face(b.face)}` : ""} · ${tb("inHouseCount", { count: b.handOutCount })}`,
                }))}
                data-testid="handout-batch"
              />
            </Field>
            <Field label={tb("fieldPieces")} hint={chosenBatch ? tb("upTo", { count: chosenBatch.handOutCount }) : undefined}>
              <Input type="number" inputMode="numeric" min={1} max={chosenBatch?.handOutCount || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="tabular-nums" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="button" variant="secondary" disabled={!chosenBatch || !validQty} loading={nextFromBatch.isPending} onClick={() => nextFromBatch.mutate()} data-testid="handout-next-from-batch">
                {validQty ? t.plural("addNextN", qty) : t("addNext")}
              </Button>
            </div>
          </div>
        )}
        {entryError ? <p className="mt-2 text-xs text-amber-300" role="status">{entryError}</p> : null}
        <div className="mt-3">
          <CodeCheckList
            kind="handOut"
            codes={codes}
            check={check.data}
            checking={check.isFetching}
            error={check.error}
            onRemove={(code) => setCodes((list) => list.filter((c) => c !== code))}
            onRemoveBlocked={() => setCodes(okCodes)}
            onClear={() => setCodes([])}
            testId="handout-code-list"
          />
        </div>
      </Step>

      <Step n={4} title={t("stepConfirm")} disabled={!rep} testId="handout-step-confirm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-white/70">
            <p className="font-semibold text-white">
              {okCodes.length ? t.plural("confirmSummary", okCodes.length, { name: repName }) : t("confirmNothing")}
            </p>
            <p className="text-xs text-white/45">
              {ownership === "company" ? t("ownershipCompany") : t("ownershipRep")}
              {cost.ok && cost.cents !== undefined ? ` · ${t("costEach", { cost: formatMoney(cost.cents, KIT_COST_CURRENCY) })}` : ""}
              {left > 0 ? <span className={MODULE_ACCENT.tags.text}>{` · ${t.plural("confirmLeftOut", left)}`}</span> : null}
            </p>
          </div>
          <Button type="button" variant="brand" accent="tags" disabled={!ready} loading={give.isPending} onClick={() => give.mutate()} data-testid="admin-tags-give-kit-submit">
            <PackagePlus className="h-4 w-4" />
            {okCodes.length ? t.plural("confirmButton", okCodes.length, { name: repName }) : t("confirmButtonNone")}
          </Button>
        </div>
        {blockers.length > 0 ? <p className="mt-2 text-xs text-red-300">{t("cannotReceive", { name: repName })}</p> : null}
        {!cost.ok && cost.reason === "required" ? <p className="mt-2 text-xs text-amber-300">{t("costMissing")}</p> : null}
      </Step>

      <PackingListDialog kit={packing} onOpenChange={(open) => { if (!open) setPacking(null); }} />
    </div>
  );
}
