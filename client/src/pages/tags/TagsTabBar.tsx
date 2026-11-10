import { useState } from "react";
import { Building2, LayoutDashboard, Package, Shield, ShoppingBag } from "lucide-react";
import { useLocation } from "wouter";
import { COMPANY_TAB, CompanySheet, companyOpen, useCompanyGroups } from "@/components/xpot/companyNav";
import { MobileTabBar } from "@/components/xpot/MobileTabBar";
import { MODULE_ACCENT } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { useViewerAccess } from "@/lib/adminMode";
import { useXpotModules } from "@/components/ModuleSwitch";
import { APP_BASE } from "./lib";

// The Tags module's bottom bar on a phone: Dashboard, Customers, My pieces and Shop. Writing a
// chip without Xpot (/tags/direct) is a rare case, reached from the dashboard. Managers in admin mode get a fourth
// tab, Manage (every piece, batches, kits, resellers), which opens /admin/tags
// and keeps this bar, so managing pieces sits next to working with them. An owner gets a Company tab, which opens the
// group of their team's screens (the sidebar's Company group).

export const TAGS_NAV = [
  { href: APP_BASE, key: "navHome", icon: LayoutDashboard },
  { href: `${APP_BASE}/customers`, key: "navCustomers", icon: Building2 },
  { href: `${APP_BASE}/pieces`, key: "navPieces", icon: Package },
  { href: `${APP_BASE}/shop`, key: "navShop", icon: ShoppingBag },
] as const;

export const TAGS_MANAGE_HREF = "/admin/tags";

/** Which tab a path belongs to. */
export function activeTagsTab(path: string): string {
  if (path === TAGS_MANAGE_HREF || path.startsWith(`${TAGS_MANAGE_HREF}/`)) return TAGS_MANAGE_HREF;
  if (path.startsWith(`${APP_BASE}/customers`)) return `${APP_BASE}/customers`;
  if (path.startsWith(`${APP_BASE}/shop`)) return `${APP_BASE}/shop`;
  // A piece is one of the person's pieces, wherever it was opened from.
  if (path.startsWith(`${APP_BASE}/pieces`) || path.startsWith(`${APP_BASE}/t/`)) return `${APP_BASE}/pieces`;
  return APP_BASE;
}

export function TagsTabBar() {
  const t = useT(tagsMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const modules = useXpotModules();
  const { canManage } = useViewerAccess();
  const company = useCompanyGroups();
  const [open, setOpen] = useState(false);
  const primary = modules.includes("visits") ? TAGS_NAV.filter((item) => item.href !== `${APP_BASE}/customers`) : TAGS_NAV;
  const tabs = [
    ...primary.map(({ href, key, icon }) => ({ id: href as string, href, label: t(key), icon, testId: `tags-nav-${key}` })),
    ...(canManage ? [{ id: TAGS_MANAGE_HREF, href: TAGS_MANAGE_HREF, label: ts("navManage"), icon: Shield, testId: "tags-nav-manage" }] : []),
    ...(company.length ? [{ id: COMPANY_TAB.id, label: company[0].label, icon: COMPANY_TAB.icon, testId: "tags-nav-company" }] : []),
  ];
  return (
    <>
      <MobileTabBar
        module="tags"
        tabs={tabs}
        activeId={open || companyOpen(company, location) ? COMPANY_TAB.id : activeTagsTab(location)}
        onSelect={(id) => (id === COMPANY_TAB.id ? setOpen(true) : navigate(id))}
      />
      <CompanySheet open={open} onClose={() => setOpen(false)} groups={company} accent={MODULE_ACCENT.tags} />
    </>
  );
}
