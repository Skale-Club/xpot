import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { EMPTY_LEAD_DELETION, leadDeletionVerdict, type LeadDeleteAlongside, type LeadDeleteBlocker, type LeadDeletionCounts } from "@shared/leadDeletion";

const KIND_KEY: Record<LeadDeleteBlocker | LeadDeleteAlongside, string> = {
  sales: "deleteSales",
  consignments: "deleteConsignments",
  pieces: "deletePieces",
  visits: "deleteVisits",
  tasks: "deleteTasks",
  deals: "deleteDeals",
};

/** What deleting a company says, in the user's language: why it is kept, or what goes with it (shared/leadDeletion.ts). */
export function useLeadDeletionText() {
  const t = useT(leadsMessages);
  const list = (parts: Array<{ kind: LeadDeleteBlocker | LeadDeleteAlongside; count: number }>) =>
    new Intl.ListFormat(t.locale, { style: "long", type: "conjunction" }).format(parts.map(({ kind, count }) => t.plural(KIND_KEY[kind], count)));
  return {
    /** The one sentence for a company that is kept ("... because it has 2 sales and 1 piece."), or null when it can be deleted. */
    blocked(counts: LeadDeletionCounts = EMPTY_LEAD_DELETION): string | null {
      const { blockers } = leadDeletionVerdict(counts);
      return blockers.length ? t("deleteBlocked", { what: list(blockers) }) : null;
    },
    /** The confirmation: the company, and how many visits, tasks and deals go with it. */
    confirm(name: string, counts: LeadDeletionCounts = EMPTY_LEAD_DELETION): string {
      const { alongside } = leadDeletionVerdict(counts);
      return alongside.length ? t("deleteNamedWith", { name, what: list(alongside) }) : t("deleteNamed", { name });
    },
  };
}
