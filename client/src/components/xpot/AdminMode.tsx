import { ArrowLeft, Shield, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { useViewerAccess } from "@/lib/adminMode";
import { homeForModules, useXpotModules } from "@/components/ModuleSwitch";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";

export const MANAGE_HOME: Record<XpotModule, string> = { visits: "/admin", tags: "/admin" };

/** One explicit door into management; it never changes the personal screens' data scope. */
export function AdminModeSidebarItem({ collapsed, mobile = false }: { collapsed: boolean; mobile?: boolean }) {
  const t = useT(workspacesMessages);
  const [, navigate] = useLocation();
  const { reach, adminMode, me, hasAdminAccess } = useViewerAccess();
  if (!reach || adminMode) return null;
  const label = t(me?.user.isAdmin ? "superAdmin" : "management");
  return <button type="button" onClick={() => navigateGuarded(hasAdminAccess ? "/admin" : "/organizations", navigate)} title={collapsed ? label : undefined}
    className={`flex min-h-10 w-full items-center gap-3 rounded-xl text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white ${collapsed ? "justify-center px-0" : "px-3"} ${mobile ? "border border-white/10 bg-white/[0.03]" : ""}`}
    data-testid="sidebar-admin-mode"><Shield className="h-[18px] w-[18px] shrink-0" />{!collapsed && <span className="truncate">{label}</span>}</button>;
}

/** A workspace identity and a clear way back, only inside the management panel. */
export function AdminModeBar() {
  const t = useT(workspacesMessages);
  const [, navigate] = useLocation();
  const modules = useXpotModules();
  const { adminMode, me } = useViewerAccess();
  if (!adminMode) return null;
  return <div className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/20 bg-amber-400/[0.08] px-4 py-2 text-amber-100 lg:px-8" data-testid="admin-mode-bar">
    <span className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300" />{t(me?.user.isAdmin ? "superAdmin" : "management")}</span>
    <button type="button" onClick={() => navigateGuarded(homeForModules(modules), navigate)} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-amber-400/10" data-testid="admin-mode-exit"><ArrowLeft className="h-3.5 w-3.5" />{t("backToApp")}</button>
  </div>;
}
