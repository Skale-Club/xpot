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
import { AdminBranding } from "./AdminBranding";
import { AdminLandingContent } from "./AdminLandingContent";
import { AdminTags, CodeLookup } from "./tags/AdminTags";
import { AdminProducts } from "./AdminProducts";
import { AdminSettings } from "./AdminSettings";
import { AdminSystemHealth } from "./AdminSystemHealth";
import { AppLayout } from "@/components/xpot/AppLayout";
import { moduleGroups, organizationItems, type NavItem } from "@/components/xpot/moduleNav";
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

// The management screens. They are not a place of their own any more: each one
// belongs to a module (Visits: team, products, check-in rules; Tags: the
// /admin/tags tabs) or to the account's Organization (people, integrations,
// branding), and the shell shows it inside that part of the app (moduleNav.ts).
// The URLs stay /admin/<section> so bookmarks and links keep working.

const SECTIONS = ["overview", "tags", "products", "integrations", "branding", "landing", "xphere", "reps", "settings", "health"] as const;
type SectionId = (typeof SECTIONS)[number];
/** The global admin's sections (moduleNav marks them adminOnly). */
const SUPER_ADMIN_SECTIONS: readonly SectionId[] = ["integrations", "branding", "landing", "xphere", "health"];

export function AdminApp({ section }: { section: string }) {
  const [location, setLocation] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);

  const me = meQuery.data;
  const active: SectionId = SECTIONS.find((s) => s === section) ?? "overview";
  // Opening a management screen (a bookmark, a link) means the person wants the management side.
  const access = useViewerAccess();
  useEffect(() => {
    if (access.hasAdminAccess && !access.adminMode) access.setAdminMode(true);
  }, [access.hasAdminAccess, access.adminMode, access.setAdminMode]);

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
  const labels = { shell: t, tags: tt };
  const organization = organizationItems(labels, viewer);
  const isOrganization = organization.some((i) => i.match(location));
  // The sibling screens of this one, for the phone's tab strip (the desktop sidebar lists them).
  const siblings: NavItem[] = active === "tags"
    ? []
    : isOrganization
      ? organization
      : moduleGroups("visits", viewer, labels)[1]?.items ?? [];
  const tagsManage = moduleGroups("tags", viewer, labels)[1]?.items ?? [];
  const current = [...siblings, ...organization, ...tagsManage].find((i) => i.match(location));
  const title = current?.label ?? t("navManage");
  const back = active === "tags" ? moduleEntryPath("tags") : isOrganization ? "/settings" : moduleEntryPath("visits");
  const heading = active === "tags" ? `${tc("moduleTags")} · ${t("navManage")}` : isOrganization ? t("navOrganization") : `${tc("moduleVisits")} · ${t("navManage")}`;

  return (
    <AppLayout
      title={title}
      size="wide"
      mobileMaxWidth="max-w-5xl"
      mobileColumnClassName={active === "tags" ? "pb-28 pt-6" : "pb-20 pt-6"}
      // Tags management is a tab of the Tags module on a phone.
      mobileNav={active === "tags" ? <TagsTabBar /> : undefined}
      topBarActions={active === "tags" ? <CodeLookup onFound={(id) => setLocation(`/admin/tags/pieces/${id}`)} /> : undefined}
      mobileHeader={
        <>
          <PageHeader backHref={back} backLabel={t("backToModule")} title={heading} description={me.user.email} />

          {siblings.length > 0 && (
            <Tabs
              className="mb-6"
              fill={false}
              accent={isOrganization ? "account" : "visits"}
              ariaLabel={heading}
              idPrefix="admin-section"
              value={siblings.find((item) => item.match(location))?.href ?? ""}
              onChange={(href) => setLocation(href)}
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
      {active === "branding" && viewer.isAdmin && <AdminBranding />}
      {active === "landing" && viewer.isAdmin && <AdminLandingContent />}
      {active === "health" && viewer.isAdmin && <AdminSystemHealth />}
      {active === "reps" && <AdminReps />}
      {active === "tags" && <AdminTags />}
      {active === "settings" && <AdminSettings />}
    </AppLayout>
  );
}
