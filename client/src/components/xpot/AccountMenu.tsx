import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronUp, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { signOut } from "@/lib/signOut";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";
import { useViewerAccess } from "@/lib/adminMode";
import { commonMessages } from "@/i18n/messages/common";
import { homeForModules, homeModule, useXpotModules } from "@/components/ModuleSwitch";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { InstallAppSidebarItem } from "./InstallApp";
import { BRAND_GRADIENT } from "./surface";
import { clearPanelRoute, panelEntryPath, rememberPanelRoute } from "./panelRoute";
import { usePanelNames } from "./panelNames";

// The person's own things, one place on every screen and both areas: their photo
// and name open the way to the other area (the panel from My work, My work from
// the panel; only for someone with a panel), Settings, Install app and Sign out. Sign out asks first: on the
// street a wrong tap would cost a text code to come back. The photo itself is
// changed in Settings.

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useAccountName() {
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const name = me ? me.rep.displayName || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() || me.user.email || "" : "";
  const initials = name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return { me, name, initials, avatarUrl: me?.rep.avatarUrl ?? null };
}

function Avatar({ size, className = "" }: { size: "sm" | "md"; className?: string }) {
  const { avatarUrl, initials } = useAccountName();
  const box = size === "sm" ? "h-9 w-9 rounded-xl text-xs" : "h-10 w-10 rounded-xl text-sm";
  return avatarUrl
    ? <img src={avatarUrl} alt="" className={`${box} shrink-0 border border-white/10 object-cover ${className}`} />
    : <span className={`${box} flex shrink-0 items-center justify-center font-bold text-white ${className}`} style={{ background: BRAND_GRADIENT }}>{initials}</span>;
}

/**
 * `sidebar`: the foot of the desktop sidebar, photo and name (just the photo when the sidebar is collapsed); `phone`:
 * the photo in the top bar. The menu opens upward from the sidebar, downward from the top bar.
 */
export function AccountMenu({ variant, collapsed = false }: { variant: "sidebar" | "phone"; collapsed?: boolean }) {
  const t = useT(shellMessages);
  const tw = useT(workspacesMessages);
  const [, navigate] = useLocation();
  const { name } = useAccountName();
  const modules = useXpotModules();
  const { reach, adminMode, profile } = useViewerAccess();
  const tc = useT(commonMessages);
  const { panelName } = usePanelNames();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  // The panel remembers where it was left; the way back to My work lands on the first module screen.
  const goToOtherArea = () => {
    if (adminMode) {
      rememberPanelRoute(`${window.location.pathname}${window.location.search}`);
      navigateGuarded(homeForModules(modules), navigate);
    } else {
      navigateGuarded(panelEntryPath(), navigate);
    }
  };
  const sidebar = variant === "sidebar";
  const place = sidebar ? (collapsed ? "bottom-0 left-full ml-2" : "bottom-full left-0 mb-2") : "right-0 top-full mt-2";
  const item = "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white";
  return (
    <div ref={root} className="relative" data-testid={`account-menu-${variant}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tw("accountMenu")}
        title={name || undefined}
        className={sidebar
          ? `flex h-12 w-full items-center rounded-xl transition-colors hover:bg-white/[0.04] ${collapsed ? "justify-center" : "gap-3 px-2"}`
          : "relative flex h-11 w-11 items-center justify-center rounded-full transition-colors active:bg-white/10"}
        data-testid="account-menu-button"
      >
        <span className="relative">
          <Avatar size={sidebar ? "sm" : "md"} />
          {sidebar ? <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#080c18] ${online ? "bg-emerald-400" : "bg-slate-500"}`} /> : null}
        </span>
        {sidebar && !collapsed ? <>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white/85">{name}</span>
          <ChevronUp className={`h-4 w-4 shrink-0 text-white/35 transition-transform ${open ? "" : "rotate-180"}`} aria-hidden="true" />
        </> : null}
      </button>
      {open ? (
        <div role="menu" className={`absolute z-[70] w-60 rounded-2xl border border-white/10 bg-[#0d1322] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] ${place}`}>
          {name ? <p className="truncate px-3 pb-1.5 pt-2 text-xs font-semibold text-white/45">{name}</p> : null}
          {reach ? (
            <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); goToOtherArea(); }} data-testid="account-menu-area">
              {adminMode ? <ArrowLeft className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> : <ShieldCheck className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
              {adminMode ? tc(homeModule(modules) === "tags" ? "moduleTags" : "moduleVisits") : panelName(profile)}
            </button>
          ) : null}
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); navigateGuarded("/settings", navigate); }} data-testid="account-menu-settings">
            <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />{t("navSettings")}
          </button>
          <InstallAppSidebarItem collapsed={false} />
          <button type="button" role="menuitem" className={`${item} hover:bg-red-500/10 hover:text-red-300`} onClick={() => { setOpen(false); setConfirming(true); }} data-testid="account-menu-sign-out">
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />{t("signOut")}
          </button>
        </div>
      ) : null}
      <SignOutConfirm open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}

/** "Sign out of Xpot?" before it happens. */
export function SignOutConfirm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(shellMessages);
  const tw = useT(workspacesMessages);
  const [, navigate] = useLocation();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={tw("signOutTitle")}
      description={tw("signOutHint")}
      confirmLabel={t("signOut")}
      testId="sign-out-confirm"
      onConfirm={async () => { clearPanelRoute(); await signOut(navigate); }}
    />
  );
}
