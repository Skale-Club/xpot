import { useState } from "react";
import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { useViewerAccess } from "@/lib/adminMode";
import { tabs } from "@/pages/xpot/utils";
import { COMPANY_TAB, CompanySheet, companyOpen, useCompanyGroups } from "./companyNav";
import { MobileTabBar } from "./MobileTabBar";
import { activeVisitsTab } from "./moduleNav";
import { MODULE_ACCENT } from "./surface";

// The Visits module's bottom bar on a phone, in the sidebar's order (moduleNav
// VISITS_TAB_ORDER). Managers in management mode get a Manage tab, as in Tags
// (TagsTabBar): the Visits management screens keep this bar, so managing the
// team sits next to working the field. An owner gets a Company tab instead, which
// opens the group of their team's screens (the sidebar's Company group).

export function VisitsTabBar() {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { canManage } = useViewerAccess();
  const company = useCompanyGroups();
  const [open, setOpen] = useState(false);
  const items = [
    ...tabs.map(({ id, labelKey, icon }) => ({ id: id as string, href: `/${id}`, label: t(labelKey), icon, testId: `visits-nav-${id}` })),
    ...(canManage ? [{ id: "manage", href: "/admin", label: t("navManage"), icon: Shield, testId: "visits-nav-manage" }] : []),
    ...(company.length ? [{ id: COMPANY_TAB.id, label: company[0].label, icon: COMPANY_TAB.icon, testId: "visits-nav-company" }] : []),
  ];
  return (
    <>
      <MobileTabBar
        module="visits"
        tabs={items}
        activeId={open || companyOpen(company, location) ? COMPANY_TAB.id : activeVisitsTab(location) ?? ""}
        onSelect={(id) => (id === COMPANY_TAB.id ? setOpen(true) : navigate(id === "manage" ? "/admin" : `/${id}`))}
      />
      <CompanySheet open={open} onClose={() => setOpen(false)} groups={company} accent={MODULE_ACCENT.visits} />
    </>
  );
}
