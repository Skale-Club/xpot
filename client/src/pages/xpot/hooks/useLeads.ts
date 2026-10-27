import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, fetchAllPages } from "@/lib/queryClient";
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

/** The Companies list; `organizationId` narrows a manager's list to one organization (?organizationId=). */
export function useLeads(enabled = true, organizationId?: number) {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const { invalidateXpotData } = useXpotShared();
  const { xpotMeQuery } = useXpotQueries();

  // Under the "/api/xpot/leads" prefix, so every lead mutation's invalidation refreshes it too.
  // Both load every page (the bare key through the default query function): the
  // screen searches, filters and counts the whole portfolio, not its first page.
  const leadsQuery = useQuery<FullSalesLead[]>(organizationId
    ? {
      queryKey: ["/api/xpot/leads", "organization", organizationId],
      queryFn: () => fetchAllPages<FullSalesLead>(`/api/xpot/leads?organizationId=${organizationId}`),
      enabled: xpotMeQuery.isSuccess && enabled,
    }
    : { queryKey: ["/api/xpot/leads"], enabled: xpotMeQuery.isSuccess && enabled });

  const createLeadMutation = useMutation({
    mutationFn: async (payload: SalesLeadPayload) => {
      const response = await apiRequest("POST", "/api/xpot/leads", payload);
      // `existing`: the Google place was already this company (POST /leads answers 200 with it, not a duplicate).
      return response.json() as Promise<{ lead: FullSalesLead; existing?: boolean }>;
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
