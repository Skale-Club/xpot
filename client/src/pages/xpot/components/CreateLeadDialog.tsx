import { useEffect, useState } from "react";
import { Building2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/ui/loader";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { findUsStateCode, StateSelect } from "@/components/StateSelect";
import { useXpotShared } from "../hooks/useXpotShared";
import { useLeads } from "../hooks/useLeads";
import { usePlaceSearch } from "../usePlaceSearch";
import { maskUsPhoneInput } from "../phoneInput";
import { findMatchingLead } from "../utils";
import type { GooglePlaceResult } from "../types";

/**
 * The one "New company" form, autofilled from Google Places. Used by the
 * check-in screen, the Dashboard search and Companies. Check-in and the
 * Dashboard create a `prospect` (it becomes a lead at check-in); Companies
 * passes `status="lead"`, the status its list shows.
 */
export function CreateLeadDialog({ open, onOpenChange, initialName, onCreated, status = "prospect" }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  onCreated?: (leadId: number, name: string) => void;
  status?: "prospect" | "lead";
}) {
  const { toast } = useToast();
  const t = useT(checkinMessages);
  const { geoState, invalidateXpotData } = useXpotShared();
  const emptyForm = { name: initialName, phone: "", email: "", website: "", industry: "", address: "", city: "", state: "" };
  const [form, setForm] = useState(emptyForm);
  const [placeSearch, setPlaceSearch] = useState(initialName);
  const [placeDropdownOpen, setPlaceDropdownOpen] = useState(false);
  // The Google place the form was filled from, and the street it gave: its
  // coordinates and Place ID are sent only while that street is kept, so the
  // check-in geofence and the Tags review link work from the first visit.
  const [picked, setPicked] = useState<{ place: GooglePlaceResult; address: string } | null>(null);
  const { createLeadMutation, leadsQuery } = useLeads();
  const placeQuery = usePlaceSearch(placeSearch, open, geoState);

  useEffect(() => {
    setForm((p) => ({ ...p, name: initialName }));
    setPlaceSearch(initialName);
  }, [initialName]);

  function applyPlace(place: GooglePlaceResult) {
    const parts = place.address.split(",");
    const state = parts.map((part) => findUsStateCode(part)).find(Boolean) ?? "";
    const city = parts.length >= 3 ? parts[parts.length - 3].trim() : "";
    const address = parts[0]?.trim() ?? "";
    setForm((prev) => ({
      ...prev,
      name: place.name,
      phone: place.phone ? maskUsPhoneInput(place.phone) : prev.phone,
      website: place.website || prev.website,
      address,
      city,
      state,
    }));
    setPicked({ place, address });
    setPlaceSearch(place.name);
    setPlaceDropdownOpen(false);
  }

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleCreate() {
    if (!form.name.trim()) return;
    const fromPlace = picked && picked.address === form.address ? picked.place : null;
    try {
      const result = await createLeadMutation.mutateAsync({
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        industry: form.industry || undefined,
        source: fromPlace ? "google_places" : "manual",
        status,
        googlePlaceId: picked?.place.placeId || undefined,
        primaryLocation: form.address ? {
          label: "Main",
          addressLine1: form.address || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          lat: fromPlace?.lat ?? undefined,
          lng: fromPlace?.lng ?? undefined,
          isPrimary: true,
        } : undefined,
      } as any);
      toast({ title: t("companyCreated"), variant: "success" });
      await invalidateXpotData();
      onCreated?.(result.lead.id, form.name.trim());
      onOpenChange(false);
      setForm(emptyForm);
      setPicked(null);
      setPlaceSearch(initialName);
    } catch (err: any) {
      toast({ title: t("createFailed"), description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{t("newCompany")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 mt-1">
          {/* Place search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={placeSearch}
              onChange={(e) => { setPlaceSearch(e.target.value); setPlaceDropdownOpen(true); }}
              onFocus={() => setPlaceDropdownOpen(true)}
              onBlur={() => setTimeout(() => setPlaceDropdownOpen(false), 150)}
              placeholder={t("placeSearchPlaceholder")}
              className="w-full h-10 rounded-xl pl-9 pr-9 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
            {placeQuery.isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/30" />}
            {placeDropdownOpen && placeQuery.data?.results.length ? (
              <div
                className="absolute left-0 right-0 top-full z-50 max-h-48 overflow-y-auto"
                style={{
                  background: "#0e1117",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderTop: "none",
                  borderBottomLeftRadius: "12px",
                  borderBottomRightRadius: "12px",
                  boxShadow: "0 16px 32px rgba(0,0,0,0.5)",
                }}
              >
                {placeQuery.data.results.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onMouseDown={() => applyPlace(place)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-white/30" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{place.name}</div>
                      <div className="truncate text-xs text-white/35">{place.address}</div>
                    </div>
                    {/* Warn before a duplicate: this business is already saved. */}
                    {findMatchingLead(place, leadsQuery.data ?? []) ? (
                      <span className="shrink-0 rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">{t("badgeMatch")}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Fields */}
          {[
            { key: "name", value: form.name, onChange: f("name"), placeholder: t("businessNamePlaceholder") },
            { key: "website", value: form.website, onChange: f("website"), placeholder: t("fieldWebsite") },
            { key: "industry", value: form.industry, onChange: f("industry"), placeholder: t("fieldIndustry") },
            { key: "address", value: form.address, onChange: f("address"), placeholder: t("streetPlaceholder") },
          ].map(({ key, value, onChange, placeholder }) => (
            <input
              key={key}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
          ))}
          <input
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: maskUsPhoneInput(e.target.value) }))}
            placeholder={t("fieldPhone")}
            inputMode="tel"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <input
            value={form.email}
            onChange={f("email")}
            placeholder={t("fieldEmail")}
            type="email"
            inputMode="email"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.city}
              onChange={f("city")}
              placeholder={t("cityPlaceholder")}
              className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
            <StateSelect value={form.state} onValueChange={(state) => setForm((previous) => ({ ...previous, state }))} placeholder={t("statePlaceholder")} selectClassName="text-[16px]" />
          </div>

          <button
            disabled={createLeadMutation.isPending || !form.name.trim()}
            onClick={handleCreate}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 mt-1"
            style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
          >
            {createLeadMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
            {t("createCompany")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
