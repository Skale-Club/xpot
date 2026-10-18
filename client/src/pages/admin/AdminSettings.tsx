// Admin › Settings — the check-in rules (DAT-03).
//
// These lived in sales_app_settings with a storage method and no route, so the
// geofence radius and the GPS requirement could only be changed with SQL.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Loader2 } from "@/components/ui/loader";
import { EmptyState } from "@/components/xpot/EmptyState";
import { RetryButton } from "@/components/xpot/RetryButton";
import { clampGeofenceRadiusInput } from "@/pages/xpot/visitRules";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesAppSettings } from "#shared/schema.js";
import { Field, PrimaryButton, inputCls, inputStyle } from "@/pages/xpot/components/sales/ui";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import { shellMessages } from "@/i18n/messages/shell";

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT(manageMessages);
  const ts = useT(shellMessages);
  const query = useQuery<SalesAppSettings>({ queryKey: ["/api/xpot/admin/settings"] });
  const [draft, setDraft] = useState<Partial<SalesAppSettings> | null>(null);
  // What is typed in the radius box; clamped into the draft on blur or save.
  const [radiusText, setRadiusText] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (body: Partial<SalesAppSettings>) =>
      (await apiRequest("PUT", "/api/xpot/admin/settings", body)).json() as Promise<SalesAppSettings>,
    onSuccess: async () => {
      toast({ title: t("settingsSaved"), variant: "success" });
      setDraft(null);
      setRadiusText(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/settings"] });
    },
    onError: (err: Error) => toast({ title: t("couldNotSave"), description: err.message, variant: "destructive" }),
  });

  if (query.isError) {
    return (
      <EmptyState tone="red" icon={ShieldAlert} title={t("settingsLoadFailed")} hint={(query.error as Error).message}>
        <RetryButton onRetry={() => void query.refetch()} busy={query.isFetching} />
      </EmptyState>
    );
  }
  if (!query.data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  }

  const current = { ...query.data, ...draft };
  const set = <K extends keyof SalesAppSettings>(k: K, v: SalesAppSettings[K]) => setDraft((d) => ({ ...(d ?? {}), [k]: v }));
  const commitRadius = () => {
    if (radiusText == null) return current.defaultGeofenceRadiusMeters;
    const radius = clampGeofenceRadiusInput(radiusText, current.defaultGeofenceRadiusMeters);
    setRadiusText(null);
    if (radius !== current.defaultGeofenceRadiusMeters) set("defaultGeofenceRadiusMeters", radius);
    return radius;
  };
  // Without blocking there is nothing to override, so the switch is shown off-limits (its value is kept).
  const overrideApplies = current.checkInRequiresGps;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white/80">{ts("manageCheckInRules")}</h2>
        <p className="text-xs text-white/40">{t("checkInRulesHint")}</p>
      </div>

      {/* The three rules sit side by side on desktop instead of a narrow column. */}
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-3 lg:items-start">
        <Field label={t("defaultRadius")} hint={t("defaultRadiusHint")}>
          <input
            value={radiusText ?? String(current.defaultGeofenceRadiusMeters)}
            inputMode="numeric"
            onChange={(e) => setRadiusText(e.target.value)}
            onBlur={commitRadius}
            className={`${inputCls} tabular-nums`}
            style={inputStyle}
          />
        </Field>

        <label className="flex items-start gap-3 rounded-xl px-3 py-3 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={current.checkInRequiresGps}
            onChange={(e) => set("checkInRequiresGps", e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block text-sm text-white/85">{t("requireGps")}</span>
            <span className="block text-[11px] text-white/40">{t("requireGpsHint")}</span>
          </span>
        </label>

        <label className={`flex items-start gap-3 rounded-xl px-3 py-3 ${overrideApplies ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={current.allowManualOverride} disabled={!overrideApplies}
            onChange={(e) => set("allowManualOverride", e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block text-sm text-white/85">{t("allowOverride")}</span>
            <span className="block text-[11px] text-white/40">{t("allowOverrideHint")}</span>
            {!overrideApplies ? <span className="mt-1 block text-[11px] text-amber-300/80">{t("allowOverrideOffHint")}</span> : null}
          </span>
        </label>
      </div>

      <PrimaryButton
        tone="emerald"
        disabled={!draft && radiusText == null}
        loading={save.isPending}
        onClick={() => {
          const radius = commitRadius();
          const body = { ...draft, ...(radius !== query.data.defaultGeofenceRadiusMeters ? { defaultGeofenceRadiusMeters: radius } : {}) };
          if (Object.keys(body).length) save.mutate(body);
          else setDraft(null);
        }}
        className="!w-auto px-5"
      >
        {t("saveSettings")}
      </PrimaryButton>
    </div>
  );
}
