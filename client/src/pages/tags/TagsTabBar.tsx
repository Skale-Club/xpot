import { LayoutDashboard, Package, Shield } from "lucide-react";
import { useLocation } from "wouter";
import { MobileTabBar } from "@/components/xpot/MobileTabBar";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { useViewerAccess } from "@/lib/adminMode";
import { APP_BASE } from "./lib";

// The Tags module's bottom bar on a phone: Dashboard and My pieces. Writing a
// chip without Xpot (/tags/direct) is a rare case, reached from the dashboard. Managers in admin mode get a fourth
// tab, Manage (every piece, batches, kits, resellers), which opens /admin/tags
// and keeps this bar, so managing pieces sits next to working with them.

export const TAGS_NAV = [
  { href: APP_BASE, key: "navHome", icon: LayoutDashboard },
  { href: `${APP_BASE}/pieces`, key: "navPieces", icon: Package },
] as const;

export const TAGS_MANAGE_HREF = "/admin/tags";

/** Which tab a path belongs to. */
export function activeTagsTab(path: string): string {
  if (path === TAGS_MANAGE_HREF || path.startsWith(`${TAGS_MANAGE_HREF}/`)) return TAGS_MANAGE_HREF;
  if (path.startsWith(`${APP_BASE}/pieces`)) return `${APP_BASE}/pieces`;
  return APP_BASE;
}

export function TagsTabBar() {
  const t = useT(tagsMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { canManage } = useViewerAccess();
  const tabs = [
    ...TAGS_NAV.map(({ href, key, icon }) => ({ id: href as string, label: t(key), icon, testId: `tags-nav-${key}` })),
    ...(canManage ? [{ id: TAGS_MANAGE_HREF, label: ts("navManage"), icon: Shield, testId: "tags-nav-manage" }] : []),
  ];
  return <MobileTabBar module="tags" tabs={tabs} activeId={activeTagsTab(location)} onSelect={navigate} />;
}
