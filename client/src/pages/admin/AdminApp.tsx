import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { AppLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/xpot/AppBackground";
import { EmptyState } from "@/components/xpot/EmptyState";
import { PageHeader } from "@/components/xpot/PageHeader";
import { Tabs } from "@/components/xpot/Tabs";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminOverview } from "./AdminOverview";
import { AdminReps } from "./AdminReps";
import { AdminIntegrations } from "./AdminIntegrations";
import { AdminBrandSite } from "./platform/AdminBrandSite";
import { AdminTags, CodeLookup } from "./tags/AdminTags";
import { AdminProducts } from "./AdminProducts";
import { AdminSettings } from "./AdminSettings";
import { AdminSystemHealth } from "./AdminSystemHealth";
import { AppLayout } from "@/components/xpot/AppLayout";
import { accountSection, administrationItems, moduleGroups, paletteExtras, platformItems, type NavItem } from "@/components/xpot/moduleNav";
import { VisitsTabBar } from "@/components/xpot/VisitsTabBar";
import { navIaMessages } from "@/i18n/messages/navIa";
import { useToast } from "@/hooks/use-toast";
import { AdminBadge } from "@/components/xpot/AdminBadge";
import { isSuperAdmin } from "@shared/modules";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageMessages } from "@/i18n/messages/manage";
import { MODULE_HOME, moduleEntryPath } from "@/lib/xpot";
import { TagsTabBar } from "@/pages/tags/TagsTabBar";
import { useViewerAccess } from "@/lib/adminMode";
import { navigateGuarded } from "@/hooks/useUnsavedChangesGuard";

// The management screens. They are not a place of their own any more: each one
// belongs to a module (Visits: overview, products, check-in rules; Tags: the
// /admin/tags tabs), to the account's Administration (People) or to the Xpot
// admin's Platform (integrations, brand and public site, status), and the
// shell shows it inside that part of the app (moduleNav.ts). On a phone a
// module's management keeps that module's tab bar (its Manage tab).
// The URLs stay /admin/<section> so bookmarks and links keep working.

const SECTIONS = ["overview", "tags", "products", "integrations", "branding", "landing", "xphere", "reps", "settings", "health"] as const;
type SectionId = (typeof SECTIONS)[number];
/** The global admin's sections (moduleNav's Platform group). */
const SUPER_ADMIN_SECTIONS: readonly SectionId[] = ["integrations", "branding", "landing", "xphere", "health"];

export function AdminApp({ section }: { section: string }) {
  const [location, setLocation] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const tn = useT(navIaMessages);
  const { toast } = useToast();

  const me = meQuery.data;
  const active: SectionId = SECTIONS.find((s) => s === section) ?? "overview";
  // Opening a management screen (a bookmark, a link) means the person wants the
  // management side; say so, since every list now shows the whole team.
  const access = useViewerAccess();
  useEffect(() => {
    if (access.hasAdminAccess && !access.adminMode) {
      access.setAdminMode(true);
      toast({ title: tn("managementOnTitle"), description: tn("managementOnBody") });
    }
  }, [access.hasAdminAccess, access.adminMode, access.setAdminMode, toast, tn]);

  // Wait for admin mode before any screen fetches: its lists would come back as a rep's.
  if (meQuery.isLoading || (access.hasAdminAccess && !access.adminMode)) {
    return <AppLoader />;
  }

  // Gate: admins and managers only.
  const allowed = !!me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role));
  if (!me || !allowed) {
    const exit = me ? MODULE_HOME.visits : "/";
    return (
      <AppBackground>
        <div className="mx-auto w-full max-w-md px-4 pb-20 pt-6">
          <PageHeader backHref={exit} backLabel={me ? tm("backToApp") : tc("goToSignIn")} title={tm("accessRestricted")} />
          <EmptyState
            tone="red"
            icon={ShieldAlert}
            title={me ? tm("noAdminPermission") : tm("signInToContinue")}
            action={
              <Button variant="secondary" onClick={() => setLocation(exit)}>
                {me ? tm("backToApp") : tc("goToSignIn")}
              </Button>
            }
          />
        </div>
      </AppBackground>
    );
  }

  const viewer = { canManage: true, isAdmin: isSuperAdmin(me) };
  const labels = { shell: t, tags: tt, nav: tn };
  // Administration (People, Organizations) or Platform (the Xpot admin's), or a module's Manage.
  const area = accountSection(location);
  const platform = viewer.isAdmin ? platformItems(labels) : [];
  const visitsManage = moduleGroups("visits", viewer, labels)[1]?.items ?? [];
  // The sibling screens of this one, for the phone's tab strip (the desktop sidebar lists them).
  const siblings: NavItem[] = active === "tags"
    ? []
    : area === "administration"
      ? administrationItems(labels)
      : area === "platform"
        ? platform
        : visitsManage;
  const sectionHref = siblings.find((item) => item.match(location))?.href ?? "";
  const tagsManage = moduleGroups("tags", viewer, labels)[1]?.items ?? [];
  // The same name as in the sidebar and the palette (the landing editor before Brand, which also matches it).
  const current = [...paletteExtras("platform", labels), ...siblings, ...administrationItems(labels), ...platform, ...tagsManage].find((i) => i.match(location));
  const title = current?.label ?? t("navManage");
  // Administration and Platform are reached from Settings; a module's management goes back to the module.
  const back = active === "tags" ? moduleEntryPath("tags") : area ? "/settings?tab=memberships" : moduleEntryPath("visits");
  const heading = active === "tags"
    ? `${tc("moduleTags")} · ${t("navManage")}`
    : area === "administration"
      ? t("navOrganization")
      : area === "platform"
        ? tn("navPlatform")
        : `${tc("moduleVisits")} · ${t("navManage")}`;
  // A module's management keeps its phone tab bar, Manage lit.
  const tabBar = active === "tags" ? <TagsTabBar /> : area ? undefined : <VisitsTabBar />;

  return (
    <AppLayout
      title={title}
      size="wide"
      mobileMaxWidth="max-w-5xl"
      mobileColumnClassName={tabBar ? "pb-28 pt-6" : "pb-20 pt-6"}
      mobileNav={tabBar}
      topBarActions={active === "tags" ? <CodeLookup onFound={(id) => setLocation(`/admin/tags/pieces/${id}`)} /> : undefined}
      mobileHeader={
        <>
          <PageHeader backHref={back} backLabel={t("backToModule")} title={heading} description={area === "platform" ? <AdminBadge /> : me.user.email} />

          {siblings.length > 0 && (
            <Tabs
              className="mb-6"
              fill={false}
              accent={area ? "account" : "visits"}
              ariaLabel={heading}
              idPrefix="admin-section"
              value={sectionHref}
              // A tab is not a link, so the Landing editor's unsaved-changes guard is asked here;
              // the open section's own tab (Brand while on its Landing tab) stays put.
              onChange={(href) => href !== sectionHref && navigateGuarded(href, setLocation)}
              tabs={siblings.map(({ href, label, icon, adminOnly }) => ({ id: href, label, icon, badge: adminOnly ? <AdminBadge /> : undefined }))}
            />
          )}
        </>
      }
    >
      {active === "overview" && <AdminOverview />}
      {active === "products" && <AdminProducts />}
      {/* A manager who types one of these URLs gets nothing (and the API answers 403). */}
      {SUPER_ADMIN_SECTIONS.includes(active) && !viewer.isAdmin && (
        <EmptyState icon={ShieldAlert} tone="red" title={tm("accessRestricted")} hint={tm("noAdminPermission")} />
      )}
      {(active === "integrations" || active === "xphere") && viewer.isAdmin && <AdminIntegrations />}
      {/* Brand & public site: one page, /admin/branding opens Identity and /admin/landing its Landing tab. */}
      {(active === "branding" || active === "landing") && viewer.isAdmin && <AdminBrandSite />}
      {active === "health" && viewer.isAdmin && <AdminSystemHealth />}
      {active === "reps" && <AdminReps />}
      {active === "tags" && <AdminTags />}
      {active === "settings" && <AdminSettings />}
    </AppLayout>
  );
}
