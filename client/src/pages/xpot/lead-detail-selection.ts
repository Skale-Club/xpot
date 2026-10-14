import type { FullSalesLead } from "./types";

export function selectLeadForDetail(
  allLeads: FullSalesLead[],
  routeId: number | null,
) {
  return routeId ? allLeads.find((lead) => lead.id === routeId) ?? null : null;
}
