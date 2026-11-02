import { useQuery } from "@tanstack/react-query";
import type { Profile } from "@shared/profiles";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { ownedOrganizations } from "@/lib/adminMode";
import type { XpotMeResponse } from "@/pages/xpot/types";
import type { PanelNames } from "./moduleNav";

/**
 * The panel's name by profile, and the words its sidebar, phone bar and palette use (i18n/messages/workspaces.ts).
 * The platform's is "Platform"; everyone else's is "My company" ("My companies" for an owner of several): a partner
 * sells and has a team too, so its panel is not "Production". A member has no panel.
 */
export function usePanelNames() {
  const t = useT(workspacesMessages);
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const runsSeveral = ownedOrganizations(me?.organizations).length > 1;
  const panelName = (profile: Profile | null | undefined) => t(profile === "platform" ? "panelPlatform" : runsSeveral ? "panelCompanies" : "panelCompany");
  const names: PanelNames = {
    today: t("todayTitle"),
    platform: t("panelPlatform"),
    company: t("panelCompany"),
    make: t("groupMake"),
    pieces: t("groupPieces"),
    field: t("groupField"),
    administration: t("groupAdministration"),
    team: t("panelTeam"),
    companies: t("panelCompanies"),
    stock: t("panelStock"),
    kits: t("panelKits"),
    purchases: t("panelPurchases"),
    tagsOverview: t("panelTagsOverview"),
  };
  return { panelName, names };
}
