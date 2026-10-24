import { Shield, X } from "lucide-react";
import { useLocation } from "wouter";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { useViewerAccess } from "@/lib/adminMode";
import { homeForModules, useXpotModules } from "@/components/ModuleSwitch";
import { rememberModuleRoute } from "@/lib/xpot";
import { contextOfPath, repScreenFor } from "./moduleNav";

// The two sides of the app, kept visibly apart. Settings is the person's own
// (language, profile, sign-in); management lives in management mode, entered
// from the sidebar or Settings › Administration, and marked by an
// amber bar on every screen until it is left.

/** Where each module's management starts. */
export const MANAGE_HOME: Record<XpotModule, string> = { visits: "/admin/overview", tags: "/admin/tags" };

/**
 * Desktop sidebar item that enters admin mode. Leaving is the amber bar's job
 * (on every screen, phone and desktop), so there is one way out, not two. A
 * manager lands on the module's Manage home; a Rep Admin has no Manage screens
 * and stays where they are, their lists now showing their organization.
 */
export function AdminModeSidebarItem({ collapsed }: { collapsed: boolean }) {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { reach, adminMode, setAdminMode } = useViewerAccess();
  if (!reach || adminMode) return null;
  const context = contextOfPath(location);
  const label = t("adminModeEnter");
  return (
    <button
      type="button"
      onClick={() => {
        if (reach === "organization") {
          setAdminMode(true);
          return;
        }
        const module = context === "tags" ? "tags" : "visits";
        rememberModuleRoute(module, `${location.split("?")[0]}${window.location.search}`);
        setAdminMode(true);
        navigate(MANAGE_HOME[module]);
      }}
      title={collapsed ? label : undefined}
      className={`flex h-10 w-full items-center gap-3 rounded-xl text-sm font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/85 ${collapsed ? "justify-center px-0" : "px-3"}`}
      data-testid="sidebar-admin-mode"
    >
      <Shield className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

/** The amber bar across the top of every screen while admin mode is on. */
export function AdminModeBar() {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const modules = useXpotModules();
  const { adminMode, setAdminMode, reach } = useViewerAccess();
  if (!adminMode) return null;
  // A management screen has nothing to show a rep: land on the same module's rep twin.
  const leave = () => {
    setAdminMode(false);
    if (location.startsWith("/admin")) navigate(repScreenFor(location, homeForModules(modules)));
  };
  return (
    <div
      className="relative z-40 flex items-center gap-2 border-b border-amber-400/25 bg-amber-400/[0.12] px-4 pb-2 text-amber-200 lg:px-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      data-testid="admin-mode-bar"
    >
      <Shield className="h-4 w-4 shrink-0 text-amber-300" />
      {/* A phone has room for the name only; wider screens say whose lists show. */}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        <span className="sm:hidden">{t("adminModeEnter")}</span>
        <span className="hidden sm:inline">{t(reach === "organization" ? "adminModeOnOrganization" : "adminModeOn")}</span>
      </span>
      <button
        type="button"
        onClick={leave}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/30 px-2 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-400/15"
        data-testid="admin-mode-exit"
      >
        <X className="h-3.5 w-3.5" />
        {t("adminModeExit")}
      </button>
    </div>
  );
}
