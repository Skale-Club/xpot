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
import { describeAction, type VisitAction } from "#shared/visit-actions.js";
import { centsToInput, inputToCents } from "../../utils";
import { Chip, GhostButton, PrimaryButton, inputCls, inputStyle } from "./ui";

const TYPE_TONE: Record<string, "blue" | "green" | "amber" | "purple"> = {
  deposit: "blue",
  settlement: "green",
  sale: "amber",
  follow_up: "purple",
};

const TYPE_LABEL: Record<string, string> = {
  deposit: "Leave stock",
  settlement: "Settle",
  sale: "Sale",
  follow_up: "Follow-up",
};

export function VisitActionsPanel({ visitId, onApplied }: { visitId: number; onApplied?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
          title: `${data.applied} recorded`,
          description: data.failed > 0 ? `${data.failed} could not be applied — see the details.` : undefined,
          variant: data.failed > 0 ? "default" : "success",
        });
      } else if (data.failed > 0) {
        toast({ title: "Nothing could be applied", variant: "destructive" });
      }
      await refresh();
    },
    onError: (err: Error) => toast({ title: "Could not apply", description: err.message, variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; payload?: Record<string, unknown>; status?: "proposed" | "dismissed" }) =>
      (await apiRequest("PATCH", `/api/xpot/visits/${visitId}/actions/${id}`, body)).json(),
    onSuccess: () => query.refetch(),
    onError: (err: Error) => toast({ title: "Could not update", description: err.message, variant: "destructive" }),
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
          Detected in your note
        </span>
      </div>

      {proposed.length > 0 && (
        <p className="text-[11px] text-white/40">
          Check these before they are recorded — tap to edit or discard.
        </p>
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
          Record {proposed.length} {proposed.length === 1 ? "action" : "actions"}
        </PrimaryButton>
      )}

      {proposed.length === 0 && settled.length > 0 && (
        <p className="text-[11px] text-white/30">Nothing left to confirm.</p>
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
  const payload = action.payload as unknown as VisitAction;
  const isProposed = action.status === "proposed";
  const isApplied = action.status === "applied";
  const isFailed = action.status === "failed";
  const lowConfidence = action.confidence != null && action.confidence < 60;

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
            <Chip tone={TYPE_TONE[action.type] ?? "neutral"}>{TYPE_LABEL[action.type] ?? action.type}</Chip>
            {isApplied && <Chip tone="green">Recorded</Chip>}
            {action.status === "dismissed" && <Chip tone="neutral">Discarded</Chip>}
            {isProposed && lowConfidence && <Chip tone="amber">Check this</Chip>}
          </div>
          <div className={`mt-1 text-sm ${action.status === "dismissed" ? "text-white/40 line-through" : "text-white/90"}`}>
            {describeAction(payload)}
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
            <button type="button" onClick={onEdit} disabled={busy} title="Edit"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/10 hover:text-white/70 disabled:opacity-40">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={onDismiss} disabled={busy} title="Discard"
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

  function build(): Record<string, unknown> {
    switch (payload.type) {
      case "deposit":
        return { quantity: num(draft.quantity) ?? payload.quantity, unitPriceCents: draft.unitPrice ? inputToCents(draft.unitPrice) : null };
      case "settlement":
        return {
          soldQuantity: num(draft.soldQuantity),
          countedRemaining: num(draft.countedRemaining),
          restockQuantity: num(draft.restockQuantity),
        };
      case "sale":
        return {
          items: payload.items.map((item, i) => i === 0
            ? { ...item, quantity: num(draft.quantity) ?? 1, unitPriceCents: inputToCents(draft.unitPrice) }
            : item),
        };
      case "follow_up":
        return { title: draft.title.trim() || payload.title, inDays: num(draft.inDays) };
    }
  }

  const fields: { key: string; label: string; money?: boolean; text?: boolean }[] =
    payload.type === "deposit" ? [{ key: "quantity", label: "Qty" }, { key: "unitPrice", label: "Unit price", money: true }]
    : payload.type === "settlement" ? [{ key: "soldQuantity", label: "Sold" }, { key: "countedRemaining", label: "Left" }, { key: "restockQuantity", label: "Restock" }]
    : payload.type === "sale" ? [{ key: "quantity", label: "Qty" }, { key: "unitPrice", label: "Price", money: true }]
    : [{ key: "title", label: "Task", text: true }, { key: "inDays", label: "In days" }];

  return (
    <div className="mt-2.5 space-y-2 border-t border-white/[0.08] pt-2.5">
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
        <p className="text-[10px] text-white/30">
          Fill either how many sold or how many are left — whichever you actually counted.
        </p>
      )}
      <div className="flex gap-1.5">
        <GhostButton onClick={onCancel} className="flex-1"><X className="h-3 w-3" /> Cancel</GhostButton>
        <GhostButton onClick={() => onSave(build())} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
        </GhostButton>
        <GhostButton onClick={async () => { await onSave(build()); onApplyOne(); }} disabled={busy} className="flex-1">
          Save & record
        </GhostButton>
      </div>
    </div>
  );
}
