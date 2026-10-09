import { Shield, X } from "lucide-react";
import { useLocation } from "wouter";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { useViewerAccess } from "@/lib/adminMode";
import { MODULE_HOME } from "@/lib/xpot";
import { contextOfPath } from "./moduleNav";

// The two sides of the app, kept visibly apart. Settings is the person's own
// (language, profile, password); management lives in admin mode, entered with
// the shield and marked by an amber bar on every screen until it is left.

/** Where each module's management starts. */
const MANAGE_HOME: Record<XpotModule, string> = { visits: "/admin/overview", tags: "/admin/tags" };

/** The shield on a phone header: enters admin mode at this module's management. Only for people who manage. */
export function AdminModeButton({ module }: { module: XpotModule }) {
  const t = useT(shellMessages);
  const [, navigate] = useLocation();
  const { hasAdminAccess, adminMode, setAdminMode } = useViewerAccess();
  if (!hasAdminAccess) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setAdminMode(true);
        navigate(MANAGE_HOME[module]);
      }}
      title={t("adminModeEnter")}
      aria-label={t("adminModeEnter")}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border transition-all active:scale-95 touch-manipulation ${
        adminMode
          ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
          : "border-white/5 bg-white/[0.03] text-white/40 hover:bg-white/10 hover:text-white"
      }`}
      data-testid="admin-mode-button"
    >
      <Shield className="h-[18px] w-[18px]" />
    </button>
  );
}

/**
 * Desktop sidebar item that enters admin mode. Leaving is the amber bar's job
 * (on every screen, phone and desktop), so there is one way out, not two.
 */
export function AdminModeSidebarItem({ collapsed }: { collapsed: boolean }) {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { hasAdminAccess, adminMode, setAdminMode } = useViewerAccess();
  if (!hasAdminAccess || adminMode) return null;
  const context = contextOfPath(location);
  const label = t("adminModeEnter");
  return (
    <button
      type="button"
      onClick={() => {
        setAdminMode(true);
        navigate(MANAGE_HOME[context === "tags" ? "tags" : "visits"]);
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

/** Leaving admin mode from a management screen goes back to the module it belongs to. */
function leave(location: string, navigate: (to: string) => void, setAdminMode: (on: boolean) => void) {
  setAdminMode(false);
  if (location.startsWith("/admin")) {
    const context = contextOfPath(location);
    navigate(MODULE_HOME[context === "tags" ? "tags" : "visits"]);
  }
}

/** The amber bar across the top of every screen while admin mode is on. */
export function AdminModeBar() {
  const t = useT(shellMessages);
  const [location, navigate] = useLocation();
  const { adminMode, setAdminMode } = useViewerAccess();
  if (!adminMode) return null;
  return (
    <div
      className="relative z-40 flex items-center gap-2 border-b border-amber-400/25 bg-amber-400/[0.12] px-4 pb-2 text-amber-200 lg:px-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      data-testid="admin-mode-bar"
    >
      <Shield className="h-4 w-4 shrink-0 text-amber-300" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t("adminModeOn")}</span>
      {!location.startsWith("/organizations") && (
        <button
          type="button"
          onClick={() => navigate("/organizations")}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-200/80 hover:bg-amber-400/15 hover:text-amber-100"
          data-testid="admin-mode-organization"
        >
          {t("navOrganization")}
        </button>
      )}
      <button
        type="button"
        onClick={() => leave(location, navigate, setAdminMode)}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/30 px-2 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-400/15"
        data-testid="admin-mode-exit"
      >
        <X className="h-3.5 w-3.5" />
        {t("adminModeExit")}
      </button>
    </div>
  );
}
