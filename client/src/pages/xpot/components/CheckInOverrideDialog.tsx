import { useEffect, useState } from "react";
import { MapPinOff, MapPinned } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { formatMeters } from "../utils";

/** What the server said when it refused the check-in; null when there was no location at all. */
export type GeofenceMiss = {
  distanceMeters: number;
  allowedRadiusMeters: number;
  accuracyMeters: number | null;
};

type ReasonId = "elsewhere" | "imprecise" | "address" | "noLocation" | "other";

/**
 * Asked when a check-in cannot be validated by location: away from the
 * customer's address, or with no location at all. Meeting a customer
 * somewhere else (a coffee shop, an event, a job site) is normal field work,
 * so it is the first answer and already chosen; nothing here should read as an
 * error. What the rep picks travels with the visit as a manual override, so a
 * manager sees how it was recorded.
 */
export function CheckInOverrideDialog({ open, onOpenChange, miss, leadName, loading, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  miss: GeofenceMiss | null;
  leadName: string;
  loading: boolean;
  onConfirm: (reason: string) => void;
}) {
  const t = useT(checkinMessages);
  const reasons: Array<{ id: ReasonId; label: string }> = miss
    ? [
        { id: "elsewhere", label: t("overrideReasonElsewhere") },
        { id: "imprecise", label: t("overrideReasonImprecise") },
        { id: "address", label: t("overrideReasonAddress") },
        { id: "other", label: t("overrideReasonOther") },
      ]
    : [
        { id: "noLocation", label: t("overrideReasonNoLocation") },
        { id: "elsewhere", label: t("overrideReasonElsewhere") },
        { id: "other", label: t("overrideReasonOther") },
      ];
  const [reasonId, setReasonId] = useState<ReasonId>(reasons[0].id);
  const [otherText, setOtherText] = useState("");
  const [where, setWhere] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonId(miss ? "elsewhere" : "noLocation");
    setOtherText("");
    setWhere("");
  }, [open, miss]);

  const label = reasons.find((r) => r.id === reasonId)?.label ?? "";
  const reason = reasonId === "other"
    ? otherText.trim()
    : reasonId === "elsewhere" && where.trim() ? `${label}: ${where.trim()}` : label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
              {miss ? <MapPinned className="h-[18px] w-[18px]" /> : <MapPinOff className="h-[18px] w-[18px]" />}
            </span>
            {t("overrideTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-sm leading-relaxed text-white/75">
            {miss
              ? t("overrideOutside", { distance: formatMeters(miss.distanceMeters), name: leadName, radius: formatMeters(miss.allowedRadiusMeters) })
              : t("overrideNoLocation", { name: leadName })}
            {miss?.accuracyMeters ? <span className="mt-1 block text-xs text-white/40">{t("overrideAccuracy", { accuracy: formatMeters(miss.accuracyMeters) })}</span> : null}
          </div>

          <p className="text-xs leading-relaxed text-white/50">{t("overrideAsk")}</p>

          <div className="space-y-2" role="radiogroup">
            {reasons.map((option) => {
              const selected = option.id === reasonId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReasonId(option.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors ${selected ? "border-indigo-400/40 bg-indigo-500/10 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.05]"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-indigo-300" : "border-white/25"}`}>
                    {selected ? <span className="h-2 w-2 rounded-full bg-indigo-300" /> : null}
                  </span>
                  {option.label}
                </button>
              );
            })}
          </div>

          {reasonId === "elsewhere" ? (
            <input
              value={where}
              onChange={(event) => setWhere(event.target.value.slice(0, 200))}
              placeholder={t("overrideWherePlaceholder")}
              className="h-11 w-full rounded-xl border border-white/[0.09] bg-white/[0.06] px-3 text-[16px] text-white placeholder:text-white/25 focus:border-indigo-400/40 focus:outline-none"
              data-testid="check-in-override-where"
            />
          ) : null}

          {reasonId === "other" ? (
            <textarea
              value={otherText}
              onChange={(event) => setOtherText(event.target.value.slice(0, 500))}
              placeholder={t("overrideOtherPlaceholder")}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.06] px-3 py-2.5 text-[16px] text-white placeholder:text-white/25 focus:border-indigo-400/40 focus:outline-none"
            />
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white">
              {t("overrideCancel")}
            </button>
            <button
              type="button"
              disabled={!reason || loading}
              onClick={() => onConfirm(reason)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              data-testid="check-in-override-confirm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("overrideConfirm")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
