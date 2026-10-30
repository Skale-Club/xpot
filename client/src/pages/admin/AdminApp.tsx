import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { AppLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/xpot/AppBackground";
import { EmptyState } from "@/components/xpot/EmptyState";
import { PageHeader } from "@/components/xpot/PageHeader";
import { AppLayout } from "@/components/xpot/AppLayout";
import { Select } from "@/components/xpot/Field";
import { managementGroups, organizationPanelGroups } from "@/components/xpot/moduleNav";
import { managementReach } from "@/lib/adminMode";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminOverview } from "./AdminOverview";
import { AdminReps } from "./AdminReps";
import { AdminIntegrations } from "./AdminIntegrations";
import { AdminBrandSite } from "./platform/AdminBrandSite";
import { AdminTags, CodeLookup } from "./tags/AdminTags";
import { AdminProducts } from "./AdminProducts";
import { AdminSettings } from "./AdminSettings";
import { AdminSystemHealth } from "./AdminSystemHealth";
import { AdminHome } from "./AdminHome";
import { AdminWork } from "./AdminWork";
import { isSuperAdmin } from "@shared/modules";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { navIaMessages } from "@/i18n/messages/navIa";
import { manageMessages } from "@/i18n/messages/manage";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { useXpotModules, homeForModules } from "@/components/ModuleSwitch";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";

const SECTIONS = ["home", "work", "overview", "tags", "products", "integrations", "branding", "landing", "xphere", "reps", "settings", "health"] as const;
const SUPER_ADMIN_SECTIONS = ["integrations", "branding", "landing", "xphere", "health"];

/** A dedicated management shell: no personal module switch or user tab bar. */
export function AdminApp({ section }: { section: string }) {
  const [location, navigate] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const tn = useT(navIaMessages);
  const tw = useT(workspacesMessages);
  const modules = useXpotModules();
  const me = meQuery.data;
  const active = SECTIONS.find((id) => id === section) ?? "home";
  if (meQuery.isLoading) return <AppLoader />;
  const organizationOnly = managementReach(me) === "organization";
  const allowed = !!me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role) || (active === "work" && organizationOnly));
  if (!me || !allowed) {
    const exit = me ? homeForModules(modules) : "/";
    return <AppBackground><div className="mx-auto w-full max-w-md px-4 pb-20 pt-6"><PageHeader backHref={exit} backLabel={me ? tm("backToApp") : tc("goToSignIn")} title={tm("accessRestricted")} /><EmptyState tone="red" icon={ShieldAlert} title={me ? tm("noAdminPermission") : tm("signInToContinue")} action={<Button variant="secondary" onClick={() => navigate(exit)}>{me ? tm("backToApp") : tc("goToSignIn")}</Button>} /></div></AppBackground>;
  }
  const viewer = { canManage: true, isAdmin: isSuperAdmin(me) };
  const panelName = tw(viewer.isAdmin ? "superAdmin" : "management");
  const groups = organizationOnly ? organizationPanelGroups(modules, { shell: t, tags: tt, nav: tn }) : managementGroups(modules, viewer, { shell: t, tags: tt, nav: tn }, { home: tw("home"), tags: tw("tagsGroup"), visits: tw("visitsGroup"), team: tw("teamGroup"), system: tw("systemGroup") });
  const current = groups.flatMap((group) => group.items).find((item) => item.match(location));
  const title = current?.label ?? panelName;
  const restricted = SUPER_ADMIN_SECTIONS.includes(active) && !viewer.isAdmin;
  const lookupAllowed = active === "tags" && !/^\/admin\/tags\/(?:production|batches)(?:\/|$)/.test(location);
  return <AppLayout title={title} size="wide" mobileMaxWidth="max-w-5xl" mobileColumnClassName="pb-10 pt-5"
    topBarActions={lookupAllowed ? <CodeLookup onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /> : undefined}
    mobileHeader={<div className="mb-5 space-y-3">{active !== "home" && !(active === "tags" && !lookupAllowed) ? <PageHeader backHref={organizationOnly ? "/organizations" : "/admin"} backLabel={tw("home")} title={title} /> : null}
      <Select aria-label={tw("chooseSection")} value={current?.href ?? ""} onChange={(event) => navigateGuarded(event.target.value, navigate)} data-testid="management-mobile-nav">
        {!current ? <option value="">{tw("chooseSection")}</option> : null}
        {groups.map((group, index) => <optgroup key={group.label || index} label={group.label || panelName}>{group.items.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}</optgroup>)}
      </Select>
      {lookupAllowed ? <CodeLookup fill onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /> : null}
    </div>}>
    {restricted ? <EmptyState icon={ShieldAlert} tone="red" title={tm("accessRestricted")} hint={tm("noAdminPermission")} /> : <>
      {active === "home" && <AdminHome />}
      {active === "work" && <AdminWork />}
      {active === "overview" && <AdminOverview />}
      {active === "products" && <AdminProducts />}
      {(active === "integrations" || active === "xphere") && <AdminIntegrations />}
      {(active === "branding" || active === "landing") && <AdminBrandSite />}
      {active === "health" && <AdminSystemHealth />}
      {active === "reps" && <AdminReps />}
      {active === "tags" && <AdminTags />}
      {active === "settings" && <AdminSettings />}
    </>}
  </AppLayout>;
}
