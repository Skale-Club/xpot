import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePlaceSearch } from "../usePlaceSearch";
import { parseAddress } from "../utils";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import type { GooglePlaceResult, FullSalesLead, SalesLeadPayload } from "../types";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";

export function useLeads() {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const { geoState, loadCurrentLocation, invalidateXpotData } = useXpotShared();
  const { xpotMeQuery, activeTab } = useXpotQueries();

  const [leadLookupSearch, setLeadLookupSearch] = useState("");
  const [selectedLeadPlace, setSelectedLeadPlace] = useState<GooglePlaceResult | null>(null);
  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    website: "",
    industry: "",
    addressLine1: "",
    city: "",
    state: "",
  });

  const leadsQuery = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], enabled: xpotMeQuery.isSuccess });
  const leadPlaceQuery = usePlaceSearch(leadLookupSearch, xpotMeQuery.isSuccess && activeTab === "leads", geoState);

  const filteredLeadsForList = useMemo(() => {
    const search = leadLookupSearch.trim().toLowerCase();
    if (!search) return leadsQuery.data || [];

    return (leadsQuery.data || []).filter((lead) => {
      const haystack = [
        lead.name,
        lead.industry,
        lead.phone,
        lead.email,
        lead.locations?.map((location) => `${location.addressLine1} ${location.city || ""} ${location.state || ""}`).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [leadsQuery.data, leadLookupSearch]);

  const createLeadMutation = useMutation({
    mutationFn: async (payload: SalesLeadPayload) => {
      const response = await apiRequest("POST", "/api/xpot/leads", payload);
      return response.json() as Promise<{ lead: FullSalesLead }>;
    },
    onError: (error: Error) => {
      toast({ title: t("leadCreateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      await apiRequest("DELETE", `/api/xpot/leads/${leadId}`);
      return leadId;
    },
    onSuccess: async () => {
      toast({ title: t("leadDeleted"), variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("leadDeleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const syncToGhlMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await apiRequest("POST", `/api/xpot/leads/${leadId}/sync-ghl`);
      return res.json() as Promise<{ lead: FullSalesLead; ghl: { synced: boolean; message?: string } }>;
    },
    onSuccess: async (data) => {
      if (data.ghl.synced) {
        toast({ title: t("ghlSent"), description: t("ghlSentDesc"), variant: "success" });
      } else {
        toast({ title: t("ghlFailed"), description: data.ghl.message || t("ghlFailedDesc"), variant: "destructive" });
      }
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("syncFailed"), description: error.message, variant: "destructive" });
    },
  });

  const promoteToLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await apiRequest("POST", `/api/xpot/leads/${leadId}/promote`);
      return res.json() as Promise<{ lead: FullSalesLead }>;
    },
    onSuccess: async () => {
      toast({ title: t("promoted"), variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("promoteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (rows: Array<{
      name: string; phone?: string; email?: string; website?: string;
      industry?: string; addressLine1?: string; city?: string; state?: string; postalCode?: string;
    }>) => {
      const res = await apiRequest("POST", "/api/xpot/leads/import-csv", { rows });
      return res.json() as Promise<{ created: number; errors: { row: number; message: string }[] }>;
    },
    onSuccess: async (data) => {
      toast({ title: t.plural("imported", data.created), variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("importFailed"), description: error.message, variant: "destructive" });
    },
  });

  const applyPlaceToLeadForm = (place: GooglePlaceResult) => {
    const parsedAddress = parseAddress(place.address);
    setSelectedLeadPlace(place);
    setLeadLookupSearch(place.name);
    setLeadForm({
      name: place.name,
      phone: place.phone || "",
      email: "",
      website: place.website || "",
      industry: place.primaryType || "",
      addressLine1: parsedAddress.addressLine1,
      city: parsedAddress.city,
      state: parsedAddress.state,
    });
  };

  const createLeadFromForm = async () => {
    const payload: SalesLeadPayload = {
      name: leadForm.name,
      phone: leadForm.phone || undefined,
      email: leadForm.email || undefined,
      website: leadForm.website || undefined,
      industry: leadForm.industry || undefined,
      source: selectedLeadPlace ? "google_places" : "xpot",
      status: "lead",
      notes: selectedLeadPlace ? `Imported from Google Places (${selectedLeadPlace.placeId})` : undefined,
      googlePlaceId: selectedLeadPlace?.placeId,
      primaryLocation: leadForm.addressLine1
        ? {
            label: "Main",
            addressLine1: leadForm.addressLine1,
            city: leadForm.city || undefined,
            state: leadForm.state || undefined,
            country: "US",
            lat: selectedLeadPlace?.lat ?? undefined,
            lng: selectedLeadPlace?.lng ?? undefined,
            geofenceRadiusMeters: 150,
            isPrimary: true,
          }
        : undefined,
    };

    const result = await createLeadMutation.mutateAsync(payload);
    toast({ title: selectedLeadPlace ? t("businessImported") : t("leadCreated"), variant: "success" });
    setLeadForm({ name: "", phone: "", email: "", website: "", industry: "", addressLine1: "", city: "", state: "" });
    setSelectedLeadPlace(null);
    await invalidateXpotData();
    return result.lead;
  };

  return {
    leadsQuery,
    leadLookupSearch,
    setLeadLookupSearch,
    leadForm,
    setLeadForm,
    selectedLeadPlace,
    setSelectedLeadPlace,
    filteredLeadsForList,
    leadPlaceQuery,
    applyPlaceToLeadForm,
    createLeadFromForm,
    createLeadMutation,
    deleteLeadMutation,
    syncToGhlMutation,
    promoteToLeadMutation,
    importCsvMutation,
  };
}
