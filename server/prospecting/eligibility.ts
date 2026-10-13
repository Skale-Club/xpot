import type { NormalizedPlace } from "./google-maps-engine.js";

export type ExistingLeadIdentity = {
  id: number;
  name: string;
  googlePlaceId: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  lastVisitAt: Date | null;
};

function phoneKey(value: string | null) {
  const raw = (value || "").replace(/\D/g, "");
  return raw.length === 11 && raw.startsWith("1") ? raw.slice(1) : raw;
}

function normalizedWebsite(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  }
}

/**
 * Cold mode excludes companies already won or physically visited by this rep.
 * An unvisited CRM prospect remains eligible and is linked instead of duplicated.
 */
export function evaluateColdEligibility(place: NormalizedPlace, leads: ExistingLeadIdentity[]) {
  const phone = phoneKey(place.phone);
  const website = normalizedWebsite(place.website);
  const match = leads.find((lead) =>
    Boolean(place.googlePlaceId && lead.googlePlaceId === place.googlePlaceId)
    || Boolean(phone.length >= 7 && phoneKey(lead.phone) === phone)
    || Boolean(website && normalizedWebsite(lead.website) === website),
  );
  if (!match) return { eligible: true, leadId: null, exclusionReason: null };
  if (match.status === "customer") return { eligible: false, leadId: match.id, exclusionReason: "existing_customer" };
  if (match.lastVisitAt) return { eligible: false, leadId: match.id, exclusionReason: "previously_visited" };
  return { eligible: true, leadId: match.id, exclusionReason: null };
}
