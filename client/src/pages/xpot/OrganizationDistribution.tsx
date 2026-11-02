import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2Off } from "lucide-react";
import type { Distribution } from "@shared/organizations";
import { COMPANY_ORGANIZATION_SLUG, DISTRIBUTIONS } from "@shared/organizations";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Select } from "@/components/xpot/Field";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { organizationsMessages } from "@/i18n/messages/organizations";

// Organization › Settings, for a partner that prints its own pieces (docs/PROFILES_EXECUTION_PLAN.md, F6, D3): who
// handles its orders, and, when it handles its own, the selling organizations linked to it (the people it may hand kits
// to). Only an Xpot admin changes either; server/tags/distribution.ts says what each choice means.

const DISTRIBUTION_LABEL = { xpot: "distributionXpot", own: "distributionOwn" } as const satisfies Record<Distribution, string>;

/** Xpot (Stuscle) or the partner. Saved with the rest of Settings. */
export function DistributionChoice({ value, onChange, disabled }: { value: Distribution; onChange: (value: Distribution) => void; disabled?: boolean }) {
  const t = useT(organizationsMessages);
  return (
    <fieldset className="space-y-2" disabled={disabled} data-testid="organization-distribution">
      <legend className="text-sm font-semibold text-white">{t("distributionTitle")}</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("distributionTitle")}>
        {DISTRIBUTIONS.map((option) => (
          <label
            key={option}
            className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm text-white transition-colors ${value === option ? "border-violet-400/40 bg-violet-500/[0.1]" : "border-white/10 hover:bg-white/[0.03]"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input type="radio" name="distribution" value={option} checked={value === option} onChange={() => onChange(option)} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" data-testid={`organization-distribution-${option}`} />
            <span className="min-w-0">
              <span className="block font-medium">{t(DISTRIBUTION_LABEL[option])}</span>
              <span className="mt-0.5 block text-xs text-white/50">{t(option === "xpot" ? "distributionXpotHint" : "distributionOwnHint")}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type LinkedOrganization = { sellerId: number; name: string; isActive: boolean };
type OrganizationOption = { id: number; name: string; slug: string; isActive: boolean };

/** The selling organizations linked to a partner that handles its own distribution: unlink, or link another. */
export function OrganizationLinks({ organizationId }: { organizationId: number }) {
  const t = useT(organizationsMessages);
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `/api/xpot/organizations/${organizationId}/links`;
  const [pick, setPick] = useState("");
  const [unlinking, setUnlinking] = useState<LinkedOrganization | null>(null);
  const links = useQuery<LinkedOrganization[]>({ queryKey: [base] });
  const organizations = useQuery<OrganizationOption[]>({ queryKey: ["/api/xpot/organizations"] });
  const linked = new Set((links.data ?? []).map((link) => link.sellerId));
  const available = (organizations.data ?? []).filter((org) => org.isActive && org.id !== organizationId && org.slug !== COMPANY_ORGANIZATION_SLUG && !linked.has(org.id));
  const change = useMutation({
    mutationFn: async (action: { link: number } | { unlink: number }) => {
      if ("link" in action) await apiRequest("POST", base, { sellerId: action.link });
      else await apiRequest("DELETE", `${base}/${action.unlink}`);
    },
    onSuccess: () => {
      setPick("");
      void qc.invalidateQueries({ queryKey: [base] });
      // The hand-out form lists the linked people (/api/xpot/admin/tag-people).
      void qc.invalidateQueries({ queryKey: ["admin-tags"] });
    },
    onError: (error) => toast({ title: t("linksFailed"), description: describeApiError(error), variant: "destructive" }),
  });
  return (
    <section className="space-y-2" data-testid="organization-links">
      <h3 className="text-sm font-semibold text-white">{t("linksTitle")}</h3>
      <p className="text-xs text-white/50">{t("linksHint")}</p>
      {links.data?.length ? (
        <ul className={`divide-y divide-white/[0.06] overflow-hidden rounded-xl ${GLASS_SUBTLE_CLASS}`}>
          {links.data.map((link) => (
            <li key={link.sellerId} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm text-white">
              <span className="min-w-0 truncate">{link.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setUnlinking(link)} disabled={change.isPending} data-testid={`organization-unlink-${link.sellerId}`}>
                <Link2Off />
                {t("linkRemove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : links.isSuccess ? (
        <p className="text-sm text-white/45">{t("linksEmpty")}</p>
      ) : null}
      {available.length ? (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Select value={pick} onChange={(event) => setPick(event.target.value)} placeholder={t("linksChoose")} options={available.map((org) => ({ value: String(org.id), label: org.name }))} aria-label={t("linksChoose")} data-testid="organization-link-select" />
          </div>
          <Button variant="brand" onClick={() => change.mutate({ link: Number(pick) })} disabled={!pick} loading={change.isPending} data-testid="organization-link-add">{t("linkAdd")}</Button>
        </div>
      ) : links.isSuccess ? (
        <p className="text-xs text-white/40">{t("linksAllLinked")}</p>
      ) : null}
      <ConfirmDialog
        open={!!unlinking}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title={unlinking ? t("unlinkTitle", { name: unlinking.name }) : ""}
        description={t("unlinkBody")}
        confirmLabel={t("linkRemove")}
        destructive
        busy={change.isPending}
        onConfirm={() => {
          if (unlinking) change.mutate({ unlink: unlinking.sellerId }, { onSettled: () => setUnlinking(null) });
        }}
        testId="organization-unlink-confirm"
      />
    </section>
  );
}
