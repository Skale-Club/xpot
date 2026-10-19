// Admin › Settings — the check-in rules (DAT-03).
//
// These lived in sales_app_settings with a storage method and no route, so the
// geofence radius and the GPS requirement could only be changed with SQL.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { clampGeofenceRadiusInput } from "@/pages/xpot/visitRules";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesAppSettings } from "#shared/schema.js";
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
    return <ErrorState title={t("settingsLoadFailed")} message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  }
  if (!query.data) {
    return <ListSkeleton rows={1} rowClassName="h-40 rounded-2xl" />;
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
  // Flipping a switch back, or retyping the same radius, leaves nothing to save.
  const dirty =
    (radiusText != null && radiusText.trim() !== String(query.data.defaultGeofenceRadiusMeters)) ||
    Object.entries(draft ?? {}).some(([key, value]) => query.data[key as keyof SalesAppSettings] !== value);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white/80">{ts("manageCheckInRules")}</h2>
        <p className="text-xs text-white/40">{t("checkInRulesHint")}</p>
      </div>

      <div className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4`}>
        {/* The three rules sit side by side on desktop instead of a narrow column. */}
        <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
          <Field label={t("defaultRadius")} hint={t("defaultRadiusHint")}>
            <Input
              value={radiusText ?? String(current.defaultGeofenceRadiusMeters)}
              inputMode="numeric"
              onChange={(e) => setRadiusText(e.target.value)}
              onBlur={commitRadius}
              className="tabular-nums"
            />
          </Field>

          <SwitchRow
            checked={current.checkInRequiresGps}
            onCheckedChange={(checked) => set("checkInRequiresGps", checked)}
            label={t("requireGps")}
            hint={t("requireGpsHint")}
          />

          <SwitchRow
            checked={current.allowManualOverride}
            onCheckedChange={(checked) => set("allowManualOverride", checked)}
            disabled={!overrideApplies}
            label={t("allowOverride")}
            hint={t("allowOverrideHint")}
            note={!overrideApplies ? t("allowOverrideOffHint") : undefined}
          />
        </div>

        <FormFooter
          dirty={dirty}
          onCancel={dirty ? () => { setDraft(null); setRadiusText(null); } : undefined}
        >
          <Button
            variant="brand"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => {
              const radius = commitRadius();
              const body = { ...draft, ...(radius !== query.data.defaultGeofenceRadiusMeters ? { defaultGeofenceRadiusMeters: radius } : {}) };
              if (Object.keys(body).length) save.mutate(body);
              else setDraft(null);
            }}
          >
            {t("saveSettings")}
          </Button>
        </FormFooter>
      </div>
    </div>
  );
}
