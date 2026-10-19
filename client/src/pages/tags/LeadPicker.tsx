import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus, X } from "lucide-react";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import type { FullSalesLead } from "@/pages/xpot/types";
import { Pill } from "@/components/xpot/StatusPill";
import { CARD, INPUT } from "./ui";

/** An existing lead, or a new business name the server creates as a lead on save. */
export type LeadChoice = { leadId: number; name: string; placeId?: string | null } | { leadId: null; name: string; placeId?: null } | null;

/** Pick one of the rep's leads (the same list as the Leads tab) or type a new business. */
export default function LeadPicker({ value, onChange, id }: {
  value: LeadChoice;
  onChange: (v: LeadChoice) => void;
  /** For a <label htmlFor> (the kit Field passes one). */
  id?: string;
}) {
  const t = useT(tagsMessages);
  const [text, setText] = useState("");
  // Same cache key as the Visits side, so a business added there shows up here.
  const { data, isLoading } = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], staleTime: 60_000 });

  const query = text.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = data ?? [];
    // Nothing until the person searches: the list is not a menu to scroll through.
    return query ? list.filter((lead) => lead.name.toLowerCase().includes(query)).slice(0, 6) : [];
  }, [data, query]);
  const exact = (data ?? []).some((lead) => lead.name.toLowerCase() === query);

  if (value) {
    return (
      <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] pl-3.5 pr-0.5" data-testid="lead-picked">
        <Building2 className="h-4 w-4 shrink-0 text-white/40" />
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">{value.name}</span>
        {!value.leadId && <Pill tone="violet" className="shrink-0">{t("leadNew")}</Pill>}
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setText("");
          }}
          aria-label={t("leadChange")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 active:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isLoading ? t("leadsLoading") : t("leadSearch")}
        autoCapitalize="words"
        className={INPUT}
        data-testid="input-lead-search"
      />
      {(matches.length > 0 || query) && (
        <ul className={`mt-2 divide-y divide-white/[0.06] overflow-hidden ${CARD}`}>
          {matches.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                onClick={() => onChange({ leadId: lead.id, name: lead.name, placeId: lead.googlePlaceId ?? null })}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-white/[0.04] active:bg-white/10"
              >
                <span className="truncate text-base text-white">{lead.name}</span>
                {lead.locations?.[0]?.city && <span className="shrink-0 text-xs text-white/40">{lead.locations[0].city}</span>}
              </button>
            </li>
          ))}
          {query && !exact && (
            <li>
              <button
                type="button"
                onClick={() => onChange({ leadId: null, name: text.trim() })}
                className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left text-base font-semibold text-violet-300 hover:bg-white/[0.04] active:bg-white/10"
                data-testid="button-lead-create"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("leadCreate", { name: text.trim() })}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function leadPayload(choice: LeadChoice): { leadId?: number; leadName?: string } {
  if (!choice) return {};
  return choice.leadId ? { leadId: choice.leadId } : { leadName: choice.name };
}
