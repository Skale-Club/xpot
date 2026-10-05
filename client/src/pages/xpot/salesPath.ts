// The Sales screen keeps its tab and open item in the URL (/sales/stock/12),
// so a desktop link opens the same pane. "consignments" is "stock" in the path.

export type SalesTab = "overview" | "sales" | "consignments" | "pipeline";

export const SALES_TAB_PATH: Record<SalesTab, string> = {
  overview: "overview",
  sales: "sales",
  consignments: "stock",
  pipeline: "pipeline",
};

export function parseSalesPath(path: string): { tab: SalesTab; id: number | null } {
  const [, , seg, rawId] = path.split("?")[0].split("/");
  const tab = (Object.keys(SALES_TAB_PATH) as SalesTab[]).find((k) => SALES_TAB_PATH[k] === seg) ?? "overview";
  const id = rawId ? Number(rawId) : NaN;
  return { tab, id: Number.isInteger(id) && id > 0 ? id : null };
}

export function salesPath(tab: SalesTab, id?: number | null): string {
  if (tab === "overview" && id == null) return "/sales";
  return id == null ? `/sales/${SALES_TAB_PATH[tab]}` : `/sales/${SALES_TAB_PATH[tab]}/${id}`;
}
