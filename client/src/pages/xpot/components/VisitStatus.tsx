import { useT, type Translate } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { PILL_BORDERS, PILL_DOTS, PILL_TONES, Pill, VISIT_OUTCOME_TONE, toneOf, type PillTone } from "@/components/xpot/StatusPill";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { EYEBROW } from "@/components/xpot/surface";
import { formatMeters } from "../utils";
import { visitLocationException, type VisitLocationException } from "../visitRules";

export type VisitStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "invalid"
  | "no_answer"
  | "came_back_later"
  | "not_interested"
  | "follow_up"
  | "sale_made";

// `label` is the English name, kept as a fallback; screens show the
// translated `status_<value>` message from checkinMessages instead. The colour
// comes from VISIT_OUTCOME_TONE (components/xpot/StatusPill.tsx), so the badge,
// the picker and the Visits filter chips always agree.
export const VISIT_STATUSES: { value: VisitStatus; label: string }[] = [
  { value: "sale_made", label: "Sale Made" },
  { value: "completed", label: "Completed" },
  { value: "follow_up", label: "Follow Up" },
  { value: "came_back_later", label: "Come Back Later" },
  { value: "no_answer", label: "No Answer" },
  { value: "not_interested", label: "Not Interested" },
  { value: "cancelled", label: "Cancelled" },
  { value: "in_progress", label: "In Progress" },
  { value: "planned", label: "Planned" },
  { value: "invalid", label: "Invalid" },
];

/** The pill tone of a visit status (slate for one the map doesn't know). */
export function visitStatusTone(status: string): PillTone {
  return toneOf(VISIT_OUTCOME_TONE, status);
}

/** The status name in the reader's language; unknown statuses show as-is. */
export function visitStatusLabel(t: Translate<typeof checkinMessages.en>, status: string): string {
  const key = `status_${status}`;
  if (key in checkinMessages.en) return t(key as keyof typeof checkinMessages.en);
  return VISIT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT(checkinMessages);
  return (
    <Pill tone={visitStatusTone(status)} dot>
      {visitStatusLabel(t, status)}
    </Pill>
  );
}

/** The check-in fields every visit row carries (shared/schema/sales.ts salesVisits). */
export type VisitLocationFields = {
  checkedInAt?: string | Date | null;
  validationStatus?: string | null;
  manualOverrideReason?: string | null;
  distanceFromTargetMeters?: number | null;
  gpsAccuracyMeters?: number | null;
};

function exceptionLabel(t: Translate<typeof checkinMessages.en>, exception: VisitLocationException) {
  return exception === "no_location" ? t("exceptionNoLocation") : t("exceptionOutsideArea");
}

/**
 * The mark Check-in rules promise: a visit accepted outside the business area
 * (with a reason, or while blocking is off) or with no location to compare.
 * Nothing for a visit validated on site, or one not checked in yet. The
 * history list and table show this; the reason is in its title.
 */
export function LocationExceptionBadge({ visit }: { visit: VisitLocationFields }) {
  const t = useT(checkinMessages);
  const exception = visitLocationException(visit);
  if (!exception) return null;
  const reason = visit.manualOverrideReason?.trim();
  const hint = exception === "no_location"
    ? reason ? t("exceptionNoLocationReason", { reason }) : t("exceptionNoLocationHint")
    : reason ? t("exceptionOutsideAreaReason", { reason }) : t("exceptionOutsideAreaHint");
  return (
    <span title={hint} aria-label={hint} className="inline-flex" data-testid="location-exception">
      <Pill tone="amber">{exceptionLabel(t, exception)}</Pill>
    </span>
  );
}

/**
 * On the visit page, in place of the badge: the same exception spelled out,
 * with the rep's reason, the distance and the location's accuracy. The
 * check-in dialog tells reps their manager sees this reason.
 */
export function LocationExceptionNotice({ visit }: { visit: VisitLocationFields }) {
  const t = useT(checkinMessages);
  const exception = visitLocationException(visit);
  if (!exception) return null;
  const reason = visit.manualOverrideReason?.trim();
  const facts = [
    typeof visit.distanceFromTargetMeters === "number" ? t("exceptionDistance", { distance: formatMeters(visit.distanceFromTargetMeters) }) : null,
    typeof visit.gpsAccuracyMeters === "number" ? t("exceptionAccuracy", { accuracy: formatMeters(visit.gpsAccuracyMeters) }) : null,
  ].filter(Boolean);
  return (
    <div data-testid="location-exception-notice">
      <InlineAlert tone="warning" title={exceptionLabel(t, exception)}>
        {reason ? <p><span className="text-white/45">{t("exceptionReason")}: </span>{reason}</p> : (
          <p>{exception === "no_location" ? t("exceptionNoLocationHint") : t("exceptionOutsideAreaHint")}</p>
        )}
        {facts.length ? <p className="mt-0.5 text-xs text-white/45">{facts.join(" · ")}</p> : null}
      </InlineAlert>
    </div>
  );
}

export function StatusPicker({ value, onChange, layout = "compact" }: { value: string; onChange: (v: VisitStatus) => void; layout?: "compact" | "wide" }) {
  const t = useT(checkinMessages);
  const OUTCOMES = VISIT_STATUSES.filter((s) => !["planned", "in_progress", "invalid", "cancelled"].includes(s.value));
  return (
    <div className="space-y-2">
      <div className={EYEBROW}>{t("visitOutcome")}</div>
      <div role="radiogroup" aria-label={t("visitOutcome")} className={layout === "wide" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" : "grid grid-cols-3 gap-2"}>
        {OUTCOMES.map((s) => {
          const isActive = value === s.value;
          const tone = visitStatusTone(s.value);
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(s.value)}
              className={`inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border px-1.5 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                isActive ? `${PILL_TONES[tone]} ${PILL_BORDERS[tone]}` : "border-white/[0.08] bg-white/[0.04] text-white/45 hover:text-white/70"
              }`}
            >
              {isActive ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PILL_DOTS[tone]}`} aria-hidden="true" /> : null}
              <span className="truncate">{visitStatusLabel(t, s.value)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
