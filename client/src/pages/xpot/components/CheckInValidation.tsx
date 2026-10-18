import { MapPinOff, ShieldAlert } from "lucide-react";
import { useT } from "@/i18n";
import { visitsMessages } from "@/i18n/messages/visits";
import { formatMeters } from "../utils";

/** The check-in fields every visit row carries (shared/schema/sales.ts salesVisits). */
export type CheckInValidationFields = {
  checkedInAt?: string | Date | null;
  validationStatus?: string | null;
  manualOverrideReason?: string | null;
  distanceFromTargetMeters?: number | null;
  gpsAccuracyMeters?: number | null;
};

/** Visits a manager should look at: started by exception, or outside the radius. */
export function needsCheckInReview(visit: CheckInValidationFields) {
  return Boolean(visit.checkedInAt) && (visit.validationStatus === "manual_override" || visit.validationStatus === "outside_geofence");
}

/**
 * Small marker for the history list. Only exceptions and check-ins outside
 * the radius get one; a visit without location is common (a customer with no
 * map address) and would flag half the list.
 */
export function CheckInFlag({ visit }: { visit: CheckInValidationFields }) {
  const t = useT(visitsMessages);
  if (!needsCheckInReview(visit)) return null;
  const label = visit.validationStatus === "manual_override" ? t("checkInOverride") : t("checkInOutside");
  const title = visit.manualOverrideReason ? `${label}: ${visit.manualOverrideReason}` : label;
  return (
    <span title={title} aria-label={title} className="inline-flex text-amber-300" data-testid="check-in-flag">
      <ShieldAlert className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * On the visit page: how the check-in was validated when it was not a plain
 * "inside the radius", with the rep's reason. The check-in dialog tells reps
 * their manager sees this reason, so it has to be shown somewhere.
 */
export function CheckInValidationNotice({ visit }: { visit: CheckInValidationFields }) {
  const t = useT(visitsMessages);
  if (!visit.checkedInAt || !visit.validationStatus || visit.validationStatus === "valid") return null;

  const review = needsCheckInReview(visit);
  const title = visit.validationStatus === "manual_override"
    ? t("checkInOverride")
    : visit.validationStatus === "outside_geofence" ? t("checkInOutside") : t("checkInNoLocation");
  const facts = [
    typeof visit.distanceFromTargetMeters === "number" ? t("checkInDistance", { distance: formatMeters(visit.distanceFromTargetMeters) }) : null,
    typeof visit.gpsAccuracyMeters === "number" ? t("checkInAccuracy", { accuracy: formatMeters(visit.gpsAccuracyMeters) }) : null,
  ].filter(Boolean);
  const Icon = review ? ShieldAlert : MapPinOff;

  return (
    <section
      className={`flex gap-3 rounded-2xl border px-5 py-4 ${review ? "border-amber-400/20 bg-amber-400/[0.06]" : "border-white/[0.07] bg-white/[0.018]"}`}
      data-testid="check-in-validation"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${review ? "text-amber-300" : "text-white/40"}`} />
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-semibold ${review ? "text-amber-100" : "text-white/70"}`}>{title}</p>
        {visit.manualOverrideReason ? (
          <p className="text-sm text-white/70">
            <span className="text-white/40">{t("checkInReason")}: </span>{visit.manualOverrideReason}
          </p>
        ) : null}
        {facts.length ? <p className="text-xs text-white/40">{facts.join(" · ")}</p> : null}
        {visit.validationStatus === "gps_unavailable" && !visit.manualOverrideReason ? <p className="text-xs text-white/40">{t("checkInNoLocationHint")}</p> : null}
      </div>
    </section>
  );
}
