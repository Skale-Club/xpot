import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Phone, Plus, UserRound } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/xpot/Field";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { displayPhone, phoneHref } from "../../utils";
import { maskUsPhoneInput } from "../../phoneInput";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import type { SalesLeadContact } from "../../types";
import { Pill } from "@/components/xpot/StatusPill";

const EMPTY = { name: "", jobTitle: "", phone: "", email: "" };

/** People at the company (owner, buyer). The API only creates; there is no edit yet. */
export function LeadContacts({ leadId, contacts }: { leadId: number; contacts: SalesLeadContact[] }) {
  const t = useT(leadsMessages);
  const tc = useT(commonMessages);
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY | null>(null);

  const addMutation = useMutation({
    mutationFn: async (input: typeof EMPTY) => {
      const res = await apiRequest("POST", `/api/xpot/leads/${leadId}/contacts`, {
        name: input.name.trim(),
        jobTitle: input.jobTitle.trim() || null,
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        isPrimary: contacts.length === 0,
      });
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: t("contactAdded"), variant: "success" });
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
    },
    onError: (error: Error) => {
      toast({ title: t("contactAddFailed"), description: error.message, variant: "destructive" });
    },
  });

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  return (
    <div className="space-y-2">
      {contacts.length === 0 && !form && <p className="text-xs text-white/40">{t("noContacts")}</p>}

      {contacts.map((c) => (
        <div key={c.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${GLASS_CLASS}`}>
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
            <UserRound className="h-4 w-4 text-white/50" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{c.name}</span>
              {c.isPrimary && (
                <Pill tone="blue">{t("primaryContact")}</Pill>
              )}
            </div>
            {c.jobTitle && <div className="text-xs text-white/40">{c.jobTitle}</div>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {c.phone && (
                <a href={phoneHref(c.phone)} className="inline-flex min-h-8 items-center gap-1 text-white/60 hover:text-white">
                  <Phone className="h-3 w-3" aria-hidden="true" /> {displayPhone(c.phone)}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex min-h-8 min-w-0 items-center gap-1 text-white/60 hover:text-white">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden="true" /> <span className="truncate">{c.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

      {form ? (
        <form
          className={`space-y-2 rounded-xl p-3 ${GLASS_CLASS}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) addMutation.mutate(form);
          }}
        >
          <Input autoFocus value={form.name} onChange={set("name")} placeholder={t("contactName")} aria-label={t("contactName")} />
          <Input value={form.jobTitle} onChange={set("jobTitle")} placeholder={t("contactJobTitle")} aria-label={t("contactJobTitle")} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input value={form.phone} onChange={(e) => setForm((f) => (f ? { ...f, phone: maskUsPhoneInput(e.target.value) } : f))} placeholder={t("fieldPhone")} aria-label={t("fieldPhone")} inputMode="tel" />
            <Input value={form.email} onChange={set("email")} placeholder={t("fieldEmail")} aria-label={t("fieldEmail")} type="email" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)} disabled={addMutation.isPending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant="brand" size="sm" disabled={!form.name.trim()} loading={addMutation.isPending}>
              {t("saveContact")}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setForm(EMPTY)} className="-ml-2 text-blue-300">
          <Plus aria-hidden="true" /> {t("addContact")}
        </Button>
      )}
    </div>
  );
}
