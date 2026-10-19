import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { Pill, toneOf, type PillTone } from "@/components/xpot/StatusPill";

/**
 * Where a company is with us. A prospect has not been worked yet (idle
 * slate), a lead has been visited (sky, like a completed visit), a customer
 * has bought (blue, like "sold"; "active", the older word, reads Customer too).
 * No green: green is money; no violet: that is Tags.
 */
export const LEAD_STATE_TONE: Record<string, PillTone> = {
  prospect: "slate",
  lead: "sky",
  active: "blue",
  customer: "blue",
  inactive: "muted",
};

const LABEL_KEY = {
  prospect: "stateProspect",
  lead: "stateLead",
  active: "stateActive",
  inactive: "stateInactive",
  customer: "stateCustomer",
} as const;

/** The company's state as a pill (lead page header, company list rows and cards). */
export function LeadStatePill({ status }: { status: string }) {
  const t = useT(leadsMessages);
  const key = LABEL_KEY[status as keyof typeof LABEL_KEY];
  return <Pill tone={toneOf(LEAD_STATE_TONE, status, "muted")}>{key ? t(key) : status}</Pill>;
}
