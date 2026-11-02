import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/xpot/CopyButton";
import { Field, Select } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatPhone } from "@shared/phone";
import { useT } from "@/i18n";
import { addPersonMessages } from "@/i18n/messages/addPerson";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { peopleWorkspaceMessages } from "@/i18n/messages/peopleWorkspace";
import { EMPTY_PERSON, PersonFields, personName, type PersonFieldsValue } from "@/pages/xpot/components/AddPersonForm";
import { ModuleChecks, REPS_KEY, Setting, send, type Rep } from "./PersonDetail";

/**
 * People › Add person: the platform makes someone's access directly (active, signs in with a code sent to their
 * phone), in the same form as a team's, with the three things only the platform decides: the organization they
 * join (none is fine: a reseller on their own), their modules and, for Tags, who pays for the pieces they receive.
 */
export function NewPersonForm({ initiallyOpen, onClosed, onCreated }: { initiallyOpen: boolean; onClosed: () => void; onCreated: (rep: Rep) => void }) {
  const { toast } = useToast();
  const t = useT(manageMessages);
  const ta = useT(addPersonMessages);
  const tw = useT(peopleWorkspaceMessages);
  const tc = useT(commonMessages);
  const queryClient = useQueryClient();
  const [open, setOpenState] = useState(initiallyOpen);
  const [person, setPerson] = useState<PersonFieldsValue>(EMPTY_PERSON);
  const [orgId, setOrgId] = useState("");
  // Nothing preselected (the same as approving a sign-up): modules and, for Tags, the cost rule are chosen on purpose.
  const [modules, setModules] = useState<string[]>([]);
  const [costPolicy, setCostPolicy] = useState<"zero" | "acquisition" | "">("");
  const [created, setCreated] = useState<{ message: string; rep: Rep } | null>(null);
  const organizations = useQuery<{ id: number; name: string; personal: boolean }[]>({ queryKey: ["/api/xpot/organizations"] });
  // Someone else's personal space is not somewhere to add a person.
  const options = (organizations.data ?? []).filter((o) => !o.personal);
  const needsCostPolicy = modules.includes("tags") && !costPolicy;
  const name = personName(person);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) onClosed();
  };

  const create = useMutation({
    mutationFn: async () => {
      const rep = await send<Rep>("/api/xpot/admin/reps/accounts", { displayName: name, phone: person.phone, countryCode: person.countryCode, modules, ...(costPolicy ? { costPolicy } : {}) });
      if (orgId) await send(`/api/xpot/organizations/${orgId}/members`, { repId: rep.id, membershipRole: "member" });
      return rep;
    },
    onSuccess: (rep) => {
      const message = t("welcomeMessage", { name: person.firstName.trim(), link: window.location.origin, phone: formatPhone(rep.phone ?? person.phone) });
      setCreated({ message, rep });
      void queryClient.invalidateQueries({ queryKey: REPS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      toast({ title: t("repCanSignInNow", { name }), variant: "success" });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    setPerson({ ...EMPTY_PERSON, countryCode: person.countryCode });
    setOrgId("");
    setModules([]);
    setCostPolicy("");
    setCreated(null);
  };

  if (!open) {
    return (
      <Button variant="brand" onClick={() => setOpen(true)} data-testid="button-new-reseller">
        <UserPlus />
        {ta("add")}
      </Button>
    );
  }

  if (created) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4" data-testid="reseller-created">
        <p className="text-sm font-semibold text-emerald-200">{t("accessCreated")}</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-sm text-white">{created.message}</pre>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto">
            <CopyButton value={created.message} label={t("copyMessage")} className="min-h-11" />
          </span>
          <Button variant="ghost" onClick={() => { const rep = created.rep; reset(); setOpen(false); onCreated(rep); }}>
            {tc("close")}
          </Button>
          <Button variant="secondary" onClick={reset}>
            {t("createAnother")}
          </Button>
        </div>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className={`space-y-4 rounded-2xl ${GLASS_CLASS} p-4`} data-testid="new-reseller-form">
      <div>
        <p className="text-sm font-semibold text-white">{ta("title")}</p>
        <p className="mt-0.5 text-xs text-white/50">{t("newResellerHint")}</p>
      </div>
      <PersonFields value={person} onChange={setPerson} />
      <Field label={ta("organization")} className="sm:max-w-sm">
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)} data-testid="new-person-organization"
          options={[{ value: "", label: tw("personNoOrg") }, ...options.map((o) => ({ value: String(o.id), label: o.name }))]} />
      </Field>
      <Setting label={t("modules")}>
        <div className="flex flex-wrap items-center gap-3">
          <ModuleChecks value={modules} onChange={setModules} />
          {modules.length === 0 && <span className="text-xs text-amber-200/70">{t("chooseModules")}</span>}
        </div>
      </Setting>
      {modules.includes("tags") && (
        <Field label={t("costPolicyTitle")} className="sm:max-w-sm">
          <Select value={costPolicy} onChange={(event) => setCostPolicy(event.target.value as "zero" | "acquisition")} data-testid="new-reseller-cost-policy">
            {costPolicy === "" && <option value="" disabled>{t("costPolicyNotSet")}</option>}
            <option value="zero">{t("costPolicyZero")}</option>
            <option value="acquisition">{t("costPolicyAcquisition")}</option>
          </Select>
        </Field>
      )}
      <FormFooter onCancel={() => setOpen(false)}>
        <Button
          type="submit"
          variant="brand"
          disabled={!person.firstName.trim() || !person.phone.trim() || modules.length === 0 || needsCostPolicy}
          loading={create.isPending}
          data-testid="button-create-reseller"
        >
          <UserPlus />
          {ta("add")}
        </Button>
      </FormFooter>
    </form>
  );
}
