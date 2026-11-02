import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { Field, Input } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { formatPhone } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { addPersonMessages } from "@/i18n/messages/addPerson";
import { DEFAULT_COUNTRY_CODE, normalizePhone } from "@shared/phone";

export type PersonFieldsValue = { firstName: string; lastName: string; countryCode: string; phone: string };
export const EMPTY_PERSON: PersonFieldsValue = { firstName: "", lastName: "", countryCode: DEFAULT_COUNTRY_CODE, phone: "" };

/** The name and phone of a person to add: the same fields wherever someone is added (a team, or People). */
export function PersonFields({ value, onChange }: { value: PersonFieldsValue; onChange: (next: PersonFieldsValue) => void }) {
  const t = useT(addPersonMessages);
  const set = (patch: Partial<PersonFieldsValue>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("firstName")}>
        <Input value={value.firstName} onChange={(event) => set({ firstName: event.target.value })} autoComplete="off" required data-testid="add-person-first-name" />
      </Field>
      <Field label={t("lastName")}>
        <Input value={value.lastName} onChange={(event) => set({ lastName: event.target.value })} autoComplete="off" data-testid="add-person-last-name" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("phone")} hint={t("phoneHint")}>
          <div className="flex min-h-11 gap-2">
            <CountryCodePicker value={value.countryCode} onChange={(countryCode) => set({ countryCode })} label={t("country")} />
            <Input value={value.phone} onChange={(event) => set({ phone: event.target.value })} type="tel" autoComplete="off" required data-testid="add-person-phone" />
          </div>
        </Field>
      </div>
    </div>
  );
}

/** A person's name as typed: first and last, trimmed. */
export const personName = (value: PersonFieldsValue) => [value.firstName, value.lastName].map((part) => part.trim()).filter(Boolean).join(" ");

/**
 * "Add person": the owner of an organization (or the platform) brings someone in by name and phone. They join as an
 * employee, always: there is no role to choose. With no account on that phone one is made, and they sign in with a code
 * sent to it (POST /api/xpot/organizations/:id/people). Used by an organization's Team tab and by Settings › My organization.
 */
export function AddPersonForm({ organizationId, hint = true }: { organizationId: number; hint?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = useT(addPersonMessages);
  const [person, setPerson] = useState<PersonFieldsValue>(EMPTY_PERSON);
  const [created, setCreated] = useState<string | null>(null);
  const { firstName, lastName, countryCode, phone } = person;
  const normalized = normalizePhone(phone, countryCode);

  const add = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/xpot/organizations/${organizationId}/people`, {
        phone,
        countryCode,
        firstName,
        ...(lastName.trim() ? { lastName } : {}),
      });
      return (await response.json()) as { repId: number; createdAccount: boolean };
    },
    onSuccess: ({ createdAccount }) => {
      const name = personName(person);
      toast({ title: t("added", { name }), variant: "success" });
      setCreated(createdAccount ? t("canSignIn", { name, phone: formatPhone(normalized) }) : t("addedExisting", { name }));
      setPerson({ ...EMPTY_PERSON, countryCode });
      const base = `/api/xpot/organizations/${organizationId}`;
      void qc.invalidateQueries({ queryKey: [`${base}/members`] });
      void qc.invalidateQueries({ queryKey: [base] });
      void qc.invalidateQueries({ queryKey: ["/api/xpot/organizations"] });
      // Someone selling alone now runs a team: the owner's panel appears (runsATeam).
      void qc.invalidateQueries({ queryKey: ["/api/xpot/me"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setCreated(null);
    add.mutate();
  };

  return (
    <form onSubmit={submit} className={`space-y-3 rounded-2xl ${GLASS_CLASS} p-4`} data-testid="add-person-form">
      <div>
        <p className="text-sm font-semibold text-white">{t("title")}</p>
        {hint && <p className="mt-0.5 text-xs text-white/50">{t("hint")}</p>}
      </div>
      <PersonFields value={person} onChange={setPerson} />
      {created && <InlineAlert tone="success">{created}</InlineAlert>}
      {add.error && <InlineAlert tone="error">{describeApiError(add.error)}</InlineAlert>}
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={!firstName.trim() || !normalized} loading={add.isPending} data-testid="add-person-submit">
          <UserPlus />
          {t("add")}
        </Button>
      </div>
    </form>
  );
}
