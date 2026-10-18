import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { useViewerAccess } from "@/lib/adminMode";
import { tabs } from "@/pages/xpot/utils";
import { MobileTabBar } from "./MobileTabBar";
import { activeVisitsTab } from "./moduleNav";
import { MANAGE_HOME } from "./AdminMode";

// The Visits module's bottom bar on a phone, in the sidebar's order (moduleNav
// VISITS_TAB_ORDER). Managers in management mode get a Manage tab, as in Tags
// (TagsTabBar): the Visits management screens keep this bar, so managing the
// team sits next to working the field.

export function VisitsTabBar() {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { canManage } = useViewerAccess();
  const items = [
    ...tabs.map(({ id, labelKey, icon }) => ({ id: id as string, label: t(labelKey), icon, testId: `visits-nav-${id}` })),
    ...(canManage ? [{ id: "manage", label: t("navManage"), icon: Shield, testId: "visits-nav-manage" }] : []),
  ];
  return (
    <MobileTabBar
      module="visits"
      tabs={items}
      activeId={activeVisitsTab(location) ?? ""}
      onSelect={(id) => navigate(id === "manage" ? MANAGE_HOME.visits : `/${id}`)}
    />
  );
}
