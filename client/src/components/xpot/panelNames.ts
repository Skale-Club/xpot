import type { Profile } from "@shared/profiles";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import type { PanelNames } from "./moduleNav";

/**
 * The panel's name by profile, and the words its sidebar, phone menu and palette use (i18n/messages/workspaces.ts).
 * The platform's is "Platform", a partner's "Production", an owner's "My organization"; a member has no panel.
 */
export function usePanelNames() {
  const t = useT(workspacesMessages);
  const panelName = (profile: Profile | null | undefined) => t(profile === "platform" ? "panelPlatform" : profile === "partner" ? "panelProduction" : "panelOrganization");
  const names: PanelNames = {
    today: t("todayTitle"),
    platform: t("panelPlatform"),
    company: t("panelCompany"),
    organization: t("organizationGroup"),
    production: t("panelProduction"),
    team: t("panelTeam"),
    stock: t("panelStock"),
    kits: t("panelKits"),
    purchases: t("panelPurchases"),
    settings: t("panelSettings"),
    tagsOverview: t("panelTagsOverview"),
  };
  return { panelName, names };
}
