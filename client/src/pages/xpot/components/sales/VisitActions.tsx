// "Actions detected" — the review step between the voice note and the record.
//
// The rep sees what the model understood in plain language, with the sentence
// it came from, and applies with one tap. Nothing here touches stock or money
// until they do: Whisper hearing "thirteen" for "thirty" would otherwise become
// a wrong bill a month later.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Sparkles, Trash2, X, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "@/components/ui/loader";
import { useToast } from "@/hooks/use-toast";
import type { SalesVisitAction } from "#shared/schema.js";
import type { VisitAction } from "#shared/visit-actions.js";
import { centsToInput, formatCents, inputToCents } from "../../utils";
import { useProducts } from "../../hooks/useSalesModule";
import { Chip, GhostButton, PrimaryButton, Select, inputCls, inputStyle } from "./ui";
import { useT, type Translate } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

type SalesModuleT = Translate<(typeof salesModuleMessages)["en"]>;

const TYPE_TONE: Record<string, "blue" | "green" | "amber" | "purple"> = {
  deposit: "blue",
  settlement: "green",
  sale: "amber",
  follow_up: "purple",
};

const TYPE_LABEL_KEY = {
  deposit: "type_deposit",
  settlement: "type_settlement",
  sale: "type_sale",
  follow_up: "type_follow_up",
} as const;

/**
 * The action in one line, in the language in use. Mirrors describeAction() in
 * shared/visit-actions.ts, which stays English for the server and its tests.
 */
function describeAction(action: VisitAction, t: SalesModuleT): string {
  switch (action.type) {
    case "deposit": {
      const vars = { quantity: action.quantity, product: action.productName ?? t("productLower") };
      return action.unitPriceCents
        ? t("desc_depositPrice", { ...vars, price: formatCents(action.unitPriceCents) })
        : t("desc_deposit", vars);
    }
    case "settlement": {
      const product = action.productName ?? t("stockFallback");
      const base = action.soldQuantity != null
        ? t("desc_settleSold", { product, count: action.soldQuantity })
        : t("desc_settleLeft", { product, count: action.countedRemaining ?? 0 });
      return action.restockQuantity ? base + t("desc_restock", { count: action.restockQuantity }) : base;
    }
    case "sale": {
      const total = action.items.reduce((sum, i) => sum + (i.unitPriceCents ?? 0) * (i.quantity ?? 1), 0);
      const items = action.items.map((i) => `${i.quantity ?? 1}× ${i.description}`).join(", ");
      return total ? t("desc_saleTotal", { items, total: formatCents(total) }) : t("desc_sale", { items });
    }
    case "follow_up":
      return action.inDays != null ? t("desc_inDays", { title: action.title, days: action.inDays }) : action.title;
  }
}

export function VisitActionsPanel({ visitId, onApplied }: { visitId: number; onApplied?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT(salesModuleMessages);
  const [editingId, setEditingId] = useState<number | null>(null);

  const query = useQuery<SalesVisitAction[]>({
    queryKey: ["/api/xpot/visits", visitId, "actions"],
    queryFn: async () => (await apiRequest("GET", `/api/xpot/visits/${visitId}/actions`)).json(),
  });

  const refresh = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/consignments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
    ]);
    onApplied?.();
  };

  const apply = useMutation({
    mutationFn: async (actionIds?: number[]) =>
      (await apiRequest("POST", `/api/xpot/visits/${visitId}/actions/apply`, { actionIds })).json() as Promise<{
        applied: number; failed: number;
      }>,
    onSuccess: async (data) => {
      if (data.applied > 0) {
        toast({
          title: t("recordedN", { count: data.applied }),
          description: data.failed > 0 ? t("failedN", { count: data.failed }) : undefined,
          variant: data.failed > 0 ? "default" : "success",
        });
      } else if (data.failed > 0) {
        toast({ title: t("nothingApplied"), variant: "destructive" });
      }
      await refresh();
    },
    onError: (err: Error) => toast({ title: t("couldNotApply"), description: err.message, variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; payload?: Record<string, unknown>; status?: "proposed" | "dismissed" }) =>
      (await apiRequest("PATCH", `/api/xpot/visits/${visitId}/actions/${id}`, body)).json(),
    onSuccess: () => query.refetch(),
    onError: (err: Error) => toast({ title: t("couldNotUpdate"), description: err.message, variant: "destructive" }),
  });

  const actions = query.data ?? [];
  const proposed = actions.filter((a) => a.status === "proposed");
  const settled = actions.filter((a) => a.status === "applied" || a.status === "failed");

  if (!actions.length) return null;

  return (
    <div className="space-y-2.5 rounded-2xl p-3.5"
      style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.22)" }}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">
          {t("detectedInNote")}
        </span>
      </div>

      {proposed.length > 0 && (
        <p className="text-[11px] text-white/40">{t("checkBeforeRecorded")}</p>
      )}

      <div className="space-y-2">
        {actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            editing={editingId === action.id}
            onEdit={() => setEditingId(action.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={async (payload) => { await patch.mutateAsync({ id: action.id, payload }); setEditingId(null); }}
            onDismiss={() => patch.mutate({ id: action.id, status: "dismissed" })}
            onApplyOne={() => apply.mutate([action.id])}
            busy={patch.isPending || apply.isPending}
          />
        ))}
      </div>

      {proposed.length > 0 && (
        <PrimaryButton onClick={() => apply.mutate(undefined)} loading={apply.isPending}>
          <Check className="h-4 w-4" />
          {t.plural("recordActions", proposed.length)}
        </PrimaryButton>
      )}

      {proposed.length === 0 && settled.length > 0 && (
        <p className="text-[11px] text-white/30">{t("nothingLeft")}</p>
      )}
    </div>
  );
}

function ActionRow({
  action, editing, onEdit, onCancelEdit, onSave, onDismiss, onApplyOne, busy,
}: {
  action: SalesVisitAction;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onDismiss: () => void;
  onApplyOne: () => void;
  busy: boolean;
}) {
  const t = useT(salesModuleMessages);
  const payload = action.payload as unknown as VisitAction;
  const typeKey = TYPE_LABEL_KEY[action.type as keyof typeof TYPE_LABEL_KEY];
  const isProposed = action.status === "proposed";
  const isApplied = action.status === "applied";
  const isFailed = action.status === "failed";
  const lowConfidence = action.confidence != null && action.confidence < 60;
  // "Vendi um site" with no amount: the row asks for it before Record, rather
  // than failing on apply.
  const needsPrice = isProposed && payload.type === "sale"
    && payload.items.some((i) => i.unitPriceCents == null && !i.productId);
  const needsProduct = isProposed && payload.type === "deposit" && !payload.productId;

  return (
    <div className="rounded-xl px-3 py-2.5"
      style={{
        background: isFailed ? "rgba(239,68,68,0.08)" : "rgba(0,0,0,0.22)",
        border: `1px solid ${isFailed ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.07)"}`,
        opacity: action.status === "dismissed" ? 0.4 : 1,
      }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={TYPE_TONE[action.type] ?? "neutral"}>{typeKey ? t(typeKey) : action.type}</Chip>
            {isApplied && <Chip tone="green">{t("chipRecorded")}</Chip>}
            {action.status === "dismissed" && <Chip tone="neutral">{t("chipDiscarded")}</Chip>}
            {isProposed && lowConfidence && <Chip tone="amber">{t("chipCheckThis")}</Chip>}
            {needsPrice && <Chip tone="red">{t("chipNeedsPrice")}</Chip>}
            {needsProduct && <Chip tone="red">{t("chipPickProduct")}</Chip>}
          </div>
          <div className={`mt-1 text-sm ${action.status === "dismissed" ? "text-white/40 line-through" : "text-white/90"}`}>
            {describeAction(payload, t)}
          </div>
          {action.evidence ? (
            <div className="mt-1 text-[11px] italic text-white/35">“{action.evidence}”</div>
          ) : null}
          {isFailed && action.error ? (
            <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{action.error}</span>
            </div>
          ) : null}
        </div>

        {(isProposed || isFailed) && !editing && (
          <div className="flex shrink-0 gap-0.5">
            <button type="button" onClick={onEdit} disabled={busy} title={t("edit")} aria-label={t("edit")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white/70 disabled:opacity-40">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={onDismiss} disabled={busy} title={t("discard")} aria-label={t("discard")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {editing && (
        <ActionEditor payload={payload} onCancel={onCancelEdit} onSave={onSave} onApplyOne={onApplyOne} busy={busy} />
      )}
    </div>
  );
}

/** Edits the few numbers that matter per action type — quantity and money. */
function ActionEditor({
  payload, onCancel, onSave, onApplyOne, busy,
}: {
  payload: VisitAction;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onApplyOne: () => void;
  busy: boolean;
}) {
  const t = useT(salesModuleMessages);
  const tc = useT(commonMessages);
  const [draft, setDraft] = useState<Record<string, string>>((): Record<string, string> => {
    switch (payload.type) {
      case "deposit":
        return { quantity: String(payload.quantity), unitPrice: centsToInput(payload.unitPriceCents ?? undefined) };
      case "settlement":
        return {
          soldQuantity: payload.soldQuantity != null ? String(payload.soldQuantity) : "",
          countedRemaining: payload.countedRemaining != null ? String(payload.countedRemaining) : "",
          restockQuantity: payload.restockQuantity != null ? String(payload.restockQuantity) : "",
        };
      case "sale":
        return {
          quantity: String(payload.items[0]?.quantity ?? 1),
          unitPrice: centsToInput(payload.items[0]?.unitPriceCents ?? undefined),
        };
      case "follow_up":
        return { title: payload.title, inDays: payload.inDays != null ? String(payload.inDays) : "" };
    }
  });

  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v) || 0)));
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // The model may have matched "site" to the wrong product, or none. The
  // catalog is the rep's to correct.
  const products = useProducts({ enabled: payload.type === "deposit" || payload.type === "sale" }).data ?? [];
  const [productId, setProductId] = useState<string>(() =>
    payload.type === "deposit" ? String(payload.productId ?? "")
    : payload.type === "sale" ? String(payload.items[0]?.productId ?? "")
    : "");
  const productOptions = products
    .filter((p) => payload.type !== "deposit" || p.consignable)
    .map((p) => ({ value: String(p.id), label: p.name }));

  function build(): Record<string, unknown> {
    const pickedId = productId ? Number(productId) : null;
    const picked = products.find((p) => p.id === pickedId);
    switch (payload.type) {
      case "deposit":
        return {
          productId: pickedId,
          productName: picked?.name ?? payload.productName,
          quantity: num(draft.quantity) ?? payload.quantity,
          unitPriceCents: draft.unitPrice ? inputToCents(draft.unitPrice) : null,
        };
      case "settlement":
        return {
          soldQuantity: num(draft.soldQuantity),
          countedRemaining: num(draft.countedRemaining),
          restockQuantity: num(draft.restockQuantity),
        };
      case "sale":
        return {
          items: payload.items.map((item, i) => i === 0
            ? {
                ...item,
                productId: pickedId,
                description: picked?.name ?? item.description,
                quantity: num(draft.quantity) ?? 1,
                unitPriceCents: draft.unitPrice ? inputToCents(draft.unitPrice) : (picked ? null : item.unitPriceCents ?? null),
              }
            : item),
        };
      case "follow_up":
        return { title: draft.title.trim() || payload.title, inDays: num(draft.inDays) };
    }
  }

  const fields: { key: string; label: string; money?: boolean; text?: boolean }[] =
    payload.type === "deposit" ? [{ key: "quantity", label: t("qty") }, { key: "unitPrice", label: t("unitPrice"), money: true }]
    : payload.type === "settlement" ? [{ key: "soldQuantity", label: t("statSold") }, { key: "countedRemaining", label: t("statLeft") }, { key: "restockQuantity", label: t("actionRestock") }]
    : payload.type === "sale" ? [{ key: "quantity", label: t("qty") }, { key: "unitPrice", label: t("fieldPrice"), money: true }]
    : [{ key: "title", label: t("fieldTask"), text: true }, { key: "inDays", label: t("fieldInDays") }];

  return (
    <div className="mt-2.5 space-y-2 border-t border-white/[0.08] pt-2.5">
      {(payload.type === "deposit" || payload.type === "sale") && (
        <label className="block space-y-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-white/35">{t("product")}</span>
          <Select
            value={productId}
            onChange={setProductId}
            placeholder={payload.type === "sale" ? t("customItemKeep") : t("pickProduct")}
            options={productOptions}
          />
        </label>
      )}
      <div className={`grid gap-2 ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-white/35">{f.label}</span>
            <input
              value={draft[f.key] ?? ""}
              inputMode={f.text ? "text" : f.money ? "decimal" : "numeric"}
              onChange={(e) => set(f.key, e.target.value)}
              className={`${inputCls} !h-9 ${f.text ? "" : "tabular-nums"}`}
              style={inputStyle}
            />
          </label>
        ))}
      </div>
      {payload.type === "settlement" && (
        <p className="text-[10px] text-white/30">{t("settlementFillHint")}</p>
      )}
      <div className="flex gap-1.5">
        <GhostButton onClick={onCancel} className="flex-1"><X className="h-3 w-3" /> {tc("cancel")}</GhostButton>
        <GhostButton onClick={() => onSave(build())} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} {tc("save")}
        </GhostButton>
        <GhostButton onClick={async () => { await onSave(build()); onApplyOne(); }} disabled={busy} className="flex-1">
          {t("saveAndRecord")}
        </GhostButton>
      </div>
    </div>
  );
}
