import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import type { PanelNames } from "./moduleNav";
import type { Panel } from "./panels";

/**
 * The panels' names and the words their sidebar, phone bar and palette use (i18n/messages/workspaces.ts). The three
 * panels are Admin, Production and Visits (components/xpot/panels.ts); no panel carries a company's name. An owner's
 * team is the Company group of Visits, named in `names`.
 */
export function usePanelNames() {
  const t = useT(workspacesMessages);
  /** The name of a panel: the selector's label, the amber bar's and the title's. */
  const panelLabel = (panel: Panel) => t(panel === "admin" ? "panelAdmin" : panel === "production" ? "panelProduction" : "panelVisits");
  const names: PanelNames = {
    today: t("todayTitle"),
    companiesGroup: t("groupCompanies"),
    platformGroup: t("groupPlatform"),
    pieces: t("groupPieces"),
    operation: t("groupOperation"),
    make: t("groupMake"),
    printing: t("panelPrinting"),
    models: t("panelModels"),
    customers: t("panelCustomers"),
    team: t("panelTeam"),
    companies: t("panelCompanies"),
    stock: t("panelStock"),
    kits: t("panelKits"),
    tagsOverview: t("panelTagsOverview"),
    company: t("groupCompany"),
    companyOverview: t("companyOverview"),
    companyPieces: t("companyPieces"),
    companyKits: t("companyKits"),
    companyPurchases: t("companyPurchases"),
    companyResults: t("companyResults"),
    companyTeamResults: t("companyTeamResults"),
    companyCustomers: t("companyCustomers"),
    companyTasks: t("companyTasks"),
    companySales: t("companySales"),
  };
  return { panelLabel, names };
}
