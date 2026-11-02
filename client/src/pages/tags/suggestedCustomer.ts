// The customer to offer when someone sets up a piece that has none: the one they are selling to, else the business
// they are visiting right now (an open visit). Nothing when neither: the field stays empty.

export type SuggestedCustomer = { leadId: number; name: string; placeId: string | null };

export function suggestedCustomer(input: {
  /** "Selling to" (lib.ts getSellTo), set by starting a sale from a visit. */
  sellTo: SuggestedCustomer | null;
  /** The lead of the visit in progress (/api/xpot/me activeVisit.lead). */
  visitLead: { id: number; name: string; googlePlaceId?: string | null } | null | undefined;
}): SuggestedCustomer | null {
  if (input.sellTo) return input.sellTo;
  const lead = input.visitLead;
  return lead ? { leadId: lead.id, name: lead.name, placeId: lead.googlePlaceId ?? null } : null;
}
