import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

// Where Take back puts pieces: the stock of the organization their kit came from (shared/tagKits.ts
// takeBackDestination; the server answers it per piece in the dry run, per kit in the list, and after the action).

export interface StockDestination {
  organizationId: number;
  name: string;
  /** The company's own stock, said "company stock" rather than by name. */
  company: boolean;
}

/** "company stock" or "Harbor Print Co. stock", in the viewer's language. */
export function useStockLabel(): (destination: Pick<StockDestination, "name" | "company">) => string {
  const t = useT(adminTagsFlowMessages);
  return (destination) => (destination.company ? t("stockOfCompany") : t("stockOfOrg", { name: destination.name }));
}

/** The destinations of a list of pieces, each with how many go there, in the order first met. */
export function destinationGroups(destinations: ReadonlyArray<StockDestination | null | undefined>): Array<StockDestination & { count: number }> {
  const groups = new Map<number, StockDestination & { count: number }>();
  for (const destination of destinations) {
    if (!destination) continue;
    const group = groups.get(destination.organizationId);
    if (group) group.count += 1;
    else groups.set(destination.organizationId, { ...destination, count: 1 });
  }
  return Array.from(groups.values());
}

/** "company stock", or with several destinations "company stock (2), Harbor Print Co. stock (1)". */
export function describeGroups(groups: ReadonlyArray<StockDestination & { count: number }>, label: (d: StockDestination) => string): string {
  if (groups.length === 1) return label(groups[0]);
  return groups.map((group) => `${label(group)} (${group.count})`).join(", ");
}
