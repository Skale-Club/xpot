import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import type { FullSalesLead, SalesLeadPayload } from "../types";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";

/** Free-text match over a company's name, sector, phone, email and addresses. */
export function leadMatchesSearch(lead: FullSalesLead, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [
    lead.name,
    lead.industry,
    lead.phone,
    lead.email,
    lead.locations?.map((location) => `${location.addressLine1} ${location.city || ""} ${location.state || ""}`).join(" "),
  ].filter(Boolean).join(" ").toLowerCase().includes(search);
}

export function useLeads(enabled = true) {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const { invalidateXpotData } = useXpotShared();
  const { xpotMeQuery } = useXpotQueries();

  const leadsQuery = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], enabled: xpotMeQuery.isSuccess && enabled });

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

  return {
    leadsQuery,
    createLeadMutation,
    deleteLeadMutation,
  };
}
