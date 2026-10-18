import { useEffect, useState } from "react";
import { MapPinOff, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { formatMeters } from "../utils";

/** What the server said when it refused the check-in; null when there was no location at all. */
export type GeofenceMiss = {
  distanceMeters: number;
  allowedRadiusMeters: number;
  accuracyMeters: number | null;
};

type ReasonId = "imprecise" | "address" | "noLocation" | "other";

/**
 * Asked when a check-in cannot be validated by location: outside the
 * customer's radius (typical on a computer, which locates by Wi-Fi), or with
 * no location at all. The reason travels with the visit as a manual override,
 * so a manager sees why it was accepted.
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
        { id: "imprecise", label: t("overrideReasonImprecise") },
        { id: "address", label: t("overrideReasonAddress") },
        { id: "other", label: t("overrideReasonOther") },
      ]
    : [
        { id: "noLocation", label: t("overrideReasonNoLocation") },
        { id: "other", label: t("overrideReasonOther") },
      ];
  const [reasonId, setReasonId] = useState<ReasonId>(reasons[0].id);
  const [otherText, setOtherText] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonId(miss ? "imprecise" : "noLocation");
    setOtherText("");
  }, [open, miss]);

  const reason = reasonId === "other" ? otherText.trim() : reasons.find((r) => r.id === reasonId)?.label ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{t("overrideTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <InlineAlert tone="warning" icon={miss ? ShieldAlert : MapPinOff}>
            {miss
              ? t("overrideOutside", { distance: formatMeters(miss.distanceMeters), name: leadName, radius: formatMeters(miss.allowedRadiusMeters) })
              : t("overrideNoLocation", { name: leadName })}
            {miss?.accuracyMeters ? <span className="mt-1 block text-xs text-white/50">{t("overrideAccuracy", { accuracy: formatMeters(miss.accuracyMeters) })}</span> : null}
          </InlineAlert>

          <p className="text-xs leading-relaxed text-white/50">{t("overrideAsk")}</p>

          <div className="space-y-2" role="radiogroup" aria-label={t("overrideAsk")}>
            {reasons.map((option) => {
              const selected = option.id === reasonId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReasonId(option.id)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors ${selected ? "border-blue-400/40 bg-blue-500/10 text-white" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.05]"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-blue-300" : "border-white/25"}`}>
                    {selected ? <span className="h-2 w-2 rounded-full bg-blue-300" /> : null}
                  </span>
                  {option.label}
                </button>
              );
            })}
          </div>

          {reasonId === "other" ? (
            <Textarea
              value={otherText}
              onChange={(event) => setOtherText(event.target.value.slice(0, 500))}
              placeholder={t("overrideOtherPlaceholder")}
              aria-label={t("overrideOtherPlaceholder")}
              rows={3}
              autoFocus
              className="resize-none"
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("overrideCancel")}
          </Button>
          <Button type="button" variant="brand" disabled={!reason} loading={loading} onClick={() => onConfirm(reason)} data-testid="check-in-override-confirm">
            {t("overrideConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
