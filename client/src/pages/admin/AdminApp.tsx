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
import { panelGroups } from "@/components/xpot/moduleNav";
import { usePanelNames } from "@/components/xpot/panelNames";
import { ownedOrganizationId, profileOfMe } from "@/lib/adminMode";
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
import { can } from "@shared/profiles";
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
/** What an owner's or a partner's panel reaches; the rest of /admin is the platform's. (Tags narrows itself by tab: AdminTags.) */
const ORGANIZATION_SECTIONS = ["home", "work", "tags"];

/** A dedicated panel shell, one per profile (shared/profiles.ts): no personal module switch or user tab bar. A member has no panel. */
export function AdminApp({ section }: { section: string }) {
  const [location, navigate] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const tn = useT(navIaMessages);
  const tw = useT(workspacesMessages);
  const { panelName: nameOf, names } = usePanelNames();
  const modules = useXpotModules();
  const me = meQuery.data;
  const active = SECTIONS.find((id) => id === section) ?? "home";
  if (meQuery.isLoading) return <AppLoader />;
  const profile = profileOfMe(me);
  const allowed = !!profile && can(profile, "useManagementPanel") && (profile === "platform" || ORGANIZATION_SECTIONS.includes(active));
  if (!me || !allowed) {
    const exit = me ? homeForModules(modules) : "/";
    return <AppBackground><div className="mx-auto w-full max-w-md px-4 pb-20 pt-6"><PageHeader backHref={exit} backLabel={me ? tm("backToApp") : tc("goToSignIn")} title={tm("accessRestricted")} /><EmptyState tone="red" icon={ShieldAlert} title={me ? tm("noAdminPermission") : tm("signInToContinue")} action={<Button variant="secondary" onClick={() => navigate(exit)}>{me ? tm("backToApp") : tc("goToSignIn")}</Button>} /></div></AppBackground>;
  }
  const panelName = nameOf(profile);
  const groups = panelGroups(profile, modules, { shell: t, tags: tt, nav: tn }, names, ownedOrganizationId(me));
  const current = groups.flatMap((group) => group.items).find((item) => item.match(location));
  const title = current?.label ?? panelName;
  const lookupAllowed = active === "tags" && !/^\/admin\/tags\/(?:production|batches)(?:\/|$)/.test(location);
  // Stock has its own search, which takes a code or a scanned link: a second box for the same thing would only ask which to use.
  const lookupBox = lookupAllowed && !/^\/admin\/tags\/pieces\/?$/.test(location);
  return <AppLayout title={title} size="wide" mobileMaxWidth="max-w-5xl" mobileColumnClassName="pb-10 pt-5"
    topBarActions={lookupBox ? <CodeLookup onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /> : undefined}
    mobileHeader={<div className="mb-5 space-y-3">{active !== "home" && !(active === "tags" && !lookupAllowed) ? <PageHeader backHref="/admin" backLabel={tw("todayTitle")} title={title} /> : null}
      <Select aria-label={tw("chooseSection")} value={current?.href ?? ""} onChange={(event) => navigateGuarded(event.target.value, navigate)} data-testid="management-mobile-nav">
        {!current ? <option value="">{tw("chooseSection")}</option> : null}
        {groups.map((group, index) => <optgroup key={group.label || index} label={group.label || panelName}>{group.items.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}</optgroup>)}
      </Select>
      {lookupBox ? <CodeLookup fill onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /> : null}
    </div>}>
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
  </AppLayout>;
}
