import { useEffect, useState } from "react";
import { Building2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DotsLoader } from "@/components/ui/spinner";
import { FIELD_CONTROL, Input } from "@/components/xpot/Field";
import { Pill } from "@/components/xpot/StatusPill";
import { SURFACE_MODAL_CLASS } from "@/components/xpot/surface";
import { commonMessages } from "@/i18n/messages/common";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { findUsStateCode, StateSelect } from "@/components/StateSelect";
import { useXpotShared } from "../hooks/useXpotShared";
import { useLeads } from "../hooks/useLeads";
import { usePlaceSearch } from "../usePlaceSearch";
import { maskUsPhoneInput } from "../phoneInput";
import { matchSavedLead } from "../utils";
import { useLeadLookup } from "../hooks/useLeadLookup";
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
  const tc = useT(commonMessages);
  const { geoState, invalidateXpotData } = useXpotShared();
  const emptyForm = { name: initialName, phone: "", email: "", website: "", industry: "", address: "", city: "", state: "" };
  const [form, setForm] = useState(emptyForm);
  const [placeSearch, setPlaceSearch] = useState(initialName);
  const [placeDropdownOpen, setPlaceDropdownOpen] = useState(false);
  // The Google place the form was filled from, and the street it gave: its
  // coordinates and Place ID are sent only while that street is kept, so the
  // check-in geofence and the Tags review link work from the first visit.
  const [picked, setPicked] = useState<{ place: GooglePlaceResult; address: string } | null>(null);
  // Only the create mutation: mounted (closed) on the Dashboard, it must not load the company list.
  const { createLeadMutation } = useLeads(false);
  // The saved companies matching the typed name, asked of the server while
  // the dialog is open, to mark a Google result that is already one of them.
  const savedQuery = useLeadLookup(placeSearch, open);
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
      // A Google place that is already a company the rep can open comes back
      // as that company (POST /leads, existing: true) instead of a duplicate.
      toast(result.existing
        ? { title: t("companyAlreadySaved", { name: result.lead.name }), variant: "success" }
        : { title: t("companyCreated"), variant: "success" });
      await invalidateXpotData();
      onCreated?.(result.lead.id, result.lead.name);
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
      <DialogContent className="max-w-sm">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{t("newCompany")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          {/* Place search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
            <input
              aria-label={t("placeSearchPlaceholder")}
              value={placeSearch}
              onChange={(e) => { setPlaceSearch(e.target.value); setPlaceDropdownOpen(true); }}
              onFocus={() => setPlaceDropdownOpen(true)}
              onBlur={() => setTimeout(() => setPlaceDropdownOpen(false), 150)}
              placeholder={t("placeSearchPlaceholder")}
              className={`${FIELD_CONTROL} py-2 pl-9 pr-10`}
            />
            {placeQuery.isFetching && <DotsLoader size="xs" tone="muted" className="absolute right-3 top-1/2 -translate-y-1/2" />}
            {placeDropdownOpen && placeQuery.data?.results.length ? (
              <div className={`absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl shadow-[0_16px_32px_rgba(0,0,0,0.5)] ${SURFACE_MODAL_CLASS}`}>
                {placeQuery.data.results.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onMouseDown={() => applyPlace(place)}
                    className="flex min-h-11 w-full items-center gap-3 border-t border-white/[0.05] px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.04]"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{place.name}</div>
                      <div className="truncate text-xs text-white/35">{place.address}</div>
                    </div>
                    {/* Warn before a duplicate: this business is already saved. */}
                    {matchSavedLead(place, savedQuery.data ?? []) ? (
                      <Pill tone="blue" className="shrink-0">{t("badgeMatch")}</Pill>
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
            <Input key={key} value={value} onChange={onChange} placeholder={placeholder} aria-label={placeholder} />
          ))}
          <Input
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: maskUsPhoneInput(e.target.value) }))}
            placeholder={t("fieldPhone")}
            aria-label={t("fieldPhone")}
            inputMode="tel"
          />
          <Input value={form.email} onChange={f("email")} placeholder={t("fieldEmail")} aria-label={t("fieldEmail")} type="email" inputMode="email" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={form.city} onChange={f("city")} placeholder={t("cityPlaceholder")} aria-label={t("cityPlaceholder")} />
            <StateSelect value={form.state} onValueChange={(state) => setForm((previous) => ({ ...previous, state }))} placeholder={t("statePlaceholder")} selectClassName="h-11 text-base sm:text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createLeadMutation.isPending}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" onClick={handleCreate} disabled={!form.name.trim()} loading={createLeadMutation.isPending}>
            {t("createCompany")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
