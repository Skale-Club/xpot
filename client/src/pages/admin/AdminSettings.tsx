// Admin › Settings — the check-in rules (DAT-03).
//
// These lived in sales_app_settings with a storage method and no route, so the
// geofence radius and the GPS requirement could only be changed with SQL.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/ui/loader";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesAppSettings } from "#shared/schema.js";
import { Field, PrimaryButton, inputCls, inputStyle } from "@/pages/xpot/components/sales/ui";

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<SalesAppSettings>({ queryKey: ["/api/xpot/admin/settings"] });
  const [draft, setDraft] = useState<Partial<SalesAppSettings> | null>(null);

  const save = useMutation({
    mutationFn: async (body: Partial<SalesAppSettings>) =>
      (await apiRequest("PUT", "/api/xpot/admin/settings", body)).json() as Promise<SalesAppSettings>,
    onSuccess: async () => {
      toast({ title: "Settings saved", variant: "success" });
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/settings"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  if (query.isLoading || !query.data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;
  }

  const current = { ...query.data, ...draft };
  const set = <K extends keyof SalesAppSettings>(k: K, v: SalesAppSettings[K]) => setDraft((d) => ({ ...(d ?? {}), [k]: v }));

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white/80">Check-in rules</h2>
        <p className="text-xs text-white/40">How a visit is validated against the company's location.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <Field label="Default geofence radius" hint="metres — used when a location has no radius of its own">
          <input
            value={current.defaultGeofenceRadiusMeters}
            inputMode="numeric"
            onChange={(e) => set("defaultGeofenceRadiusMeters", Math.max(10, Math.min(5000, Math.floor(Number(e.target.value) || 0))))}
            className={`${inputCls} tabular-nums`}
            style={inputStyle}
          />
        </Field>

        <label className="flex items-start gap-3 rounded-xl px-3 py-3 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={current.checkInRequiresGps}
            onChange={(e) => set("checkInRequiresGps", e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block text-sm text-white/85">Require GPS for check-in</span>
            <span className="block text-[11px] text-white/40">A check-in outside the geofence is refused unless the rep gives a reason.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl px-3 py-3 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={current.allowManualOverride}
            onChange={(e) => set("allowManualOverride", e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span>
            <span className="block text-sm text-white/85">Allow manual override</span>
            <span className="block text-[11px] text-white/40">Lets a rep check in outside the geofence by writing why. The visit is flagged.</span>
          </span>
        </label>
      </div>

      <PrimaryButton
        tone="emerald"
        disabled={!draft}
        loading={save.isPending}
        onClick={() => draft && save.mutate(draft)}
        className="!w-auto px-5"
      >
        Save settings
      </PrimaryButton>
    </div>
  );
}
