import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { COMPANY_ORGANIZATION_SLUG, type Distribution } from "@shared/organizations";
import { DistributionChoice, OrganizationLinks } from "./OrganizationDistribution";
import { ReleasedModelsField } from "./components/ReleasedModelsField";

// Organization › Settings. The platform edits it all; a partner or an owner reading their own organization sees a
// summary of what applies to them and one sentence saying who changes it, not controls that do nothing.

/** The part of an organization these settings read (pages/xpot/OrganizationsPage.tsx). */
export type SettingsOrganization = {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  printsOwnPieces?: boolean;
  distribution?: Distribution;
  releasedPrintModels?: string[] | null;
};

/** What a reader's organization is set up to do: the models it prints and who handles its orders. */
function SettingsSummary({ organization }: { organization: SettingsOrganization }) {
  const t = useT(organizationsMessages);
  const models = organization.releasedPrintModels ?? null;
  const lines = [
    ...(organization.printsOwnPieces ? [models === null ? t("youPrintAll") : models.length ? t.plural("youPrintSome", models.length) : t("youPrintNone")] : []),
    ...(organization.printsOwnPieces ? [organization.distribution === "own" ? t("youHandleOwn") : t("xpotHandlesYours")] : []),
  ];
  if (!lines.length) return null;
  return (
    <ul className="space-y-1.5 text-sm text-white/80" data-testid="organization-settings-summary">
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

/** `owner`: the Xpot admin, the only one who lets a branch print its own pieces (Tags › Production). */
export function OrganizationSettings({ organization, mayEdit, owner }: { organization: SettingsOrganization; mayEdit: boolean; owner: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(organizationsMessages);
  const tw = useT(peopleWorkspaceMessages);
  const tc = useT(commonMessages);
  const [name, setName] = useState(organization.name);
  const [isActive, setIsActive] = useState(organization.isActive);
  const [prints, setPrints] = useState(!!organization.printsOwnPieces);
  const [distribution, setDistribution] = useState<Distribution>(organization.distribution ?? "xpot");
  const [released, setReleased] = useState<string[] | null>(organization.releasedPrintModels ?? null);
  // The partner handling its own orders hands out the pieces it prints: without printing it is Xpot's again.
  const savedDistribution = organization.distribution ?? "xpot";
  const nextDistribution: Distribution = prints ? distribution : "xpot";
  const company = organization.slug === COMPANY_ORGANIZATION_SLUG;
  const releasedChanged = JSON.stringify(released) !== JSON.stringify(organization.releasedPrintModels ?? null);
  const dirty = name.trim() !== organization.name || isActive !== organization.isActive || prints !== !!organization.printsOwnPieces || nextDistribution !== savedDistribution || (prints && releasedChanged);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/xpot/organizations/${organization.id}`, {
      ...(name.trim() !== organization.name ? { name: name.trim() } : {}),
      ...(isActive !== organization.isActive ? { isActive } : {}),
      ...(prints !== !!organization.printsOwnPieces ? { printsOwnPieces: prints } : {}),
      ...(nextDistribution !== savedDistribution ? { distribution: nextDistribution } : {}),
      ...(prints && releasedChanged ? { releasedPrintModels: released } : {}),
    })).json(),
    onSuccess: () => {
      toast({ title: t("orgSaved"), variant: "success" });
      void qc.invalidateQueries({ queryKey: [`/api/xpot/organizations/${organization.id}`] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/me"] });
    },
    onError: (error) => toast({ title: t("couldNotSave"), description: describeApiError(error), variant: "destructive" }),
  });

  if (!mayEdit) {
    return (
      <div className={`max-w-xl space-y-4 rounded-2xl ${GLASS_CLASS} p-5`}>
        <Field label={t("orgName")}>
          <Input value={organization.name} disabled readOnly />
        </Field>
        {!organization.isActive ? <p className="text-sm text-white/60">{t("inactive")}</p> : null}
        {!company ? <SettingsSummary organization={organization} /> : null}
        <p className="text-xs text-white/45">{t("settingsReadOnly")}</p>
      </div>
    );
  }
  return (
    <div className={`max-w-xl space-y-4 rounded-2xl ${GLASS_CLASS} p-5`}>
      <Field label={t("orgName")}>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <SwitchRow checked={isActive} onCheckedChange={setIsActive} label={tw("orgActive")} hint={tw("orgActiveHint")} testId="organization-active" />
      {!company && (owner || organization.printsOwnPieces) ? (
        <SwitchRow checked={prints} onCheckedChange={setPrints} label={tw("orgPrintsOwnPieces")} hint={tw("orgPrintsOwnPiecesHint")} disabled={!owner} testId="organization-prints-own-pieces" />
      ) : null}
      {!company && prints && (owner || organization.printsOwnPieces) ? <ReleasedModelsField value={released} onChange={setReleased} disabled={!owner} /> : null}
      {!company && prints ? <DistributionChoice value={distribution} onChange={setDistribution} disabled={!owner} /> : null}
      {!company && owner && savedDistribution === "own" && prints ? <OrganizationLinks organizationId={organization.id} /> : null}
      <FormFooter dirty={dirty} onCancel={dirty ? () => { setName(organization.name); setIsActive(organization.isActive); setPrints(!!organization.printsOwnPieces); setReleased(organization.releasedPrintModels ?? null); setDistribution(savedDistribution); } : undefined}>
        <Button variant="brand" onClick={() => save.mutate()} disabled={!dirty || !name.trim()} loading={save.isPending}>{tc("save")}</Button>
      </FormFooter>
    </div>
  );
}
