import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Phone, Plus, UserRound } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { BRAND_GRADIENT } from "@/components/xpot/surface";
import type { SalesLeadContact } from "../../types";

const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-indigo-400/50";
const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" };

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
      {contacts.length === 0 && !form && <p className="text-xs text-white/35">{t("noContacts")}</p>}

      {contacts.map((c) => (
        <div key={c.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
            <UserRound className="h-4 w-4 text-indigo-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{c.name}</span>
              {c.isPrimary && (
                <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-300">
                  {t("primaryContact")}
                </span>
              )}
            </div>
            {c.jobTitle && <div className="text-xs text-white/40">{c.jobTitle}</div>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-white/55 hover:text-white">
                  <Phone className="h-3 w-3" /> {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 text-white/55 hover:text-white">
                  <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{c.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

      {form ? (
        <form
          className="space-y-2 rounded-xl p-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) addMutation.mutate(form);
          }}
        >
          <input autoFocus value={form.name} onChange={set("name")} placeholder={t("contactName")} className={inputCls} style={inputStyle} />
          <input value={form.jobTitle} onChange={set("jobTitle")} placeholder={t("contactJobTitle")} className={inputCls} style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.phone} onChange={set("phone")} placeholder={t("fieldPhone")} inputMode="tel" className={inputCls} style={inputStyle} />
            <input value={form.email} onChange={set("email")} placeholder={t("fieldEmail")} type="email" className={inputCls} style={inputStyle} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold text-white/60 hover:text-white"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || addMutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND_GRADIENT }}
            >
              {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("saveContact")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setForm(EMPTY)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          <Plus className="h-3 w-3" /> {t("addContact")}
        </button>
      )}
    </div>
  );
}
