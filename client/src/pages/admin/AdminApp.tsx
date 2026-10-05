import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/ui/loader";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminOverview } from "./AdminOverview";
import { AdminReps } from "./AdminReps";
import { AdminIntegrations } from "./AdminIntegrations";
import { AdminXphere } from "./AdminXphere";
import { AdminBranding } from "./AdminBranding";
import { AdminTags, CodeLookup } from "./tags/AdminTags";
import { AdminProducts } from "./AdminProducts";
import { AdminSettings } from "./AdminSettings";
import { AppLayout } from "@/components/xpot/AppLayout";
import { moduleGroups, organizationItems, type NavItem } from "@/components/xpot/moduleNav";
import { AdminBadge } from "@/components/xpot/AdminBadge";
import { isSuperAdmin } from "@shared/modules";
import { useIsComputer } from "@/hooks/use-is-desktop";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageMessages } from "@/i18n/messages/manage";
import { MODULE_HOME } from "@/lib/xpot";

// The management screens. They are not a place of their own any more: each one
// belongs to a module (Visits: team, products, check-in rules, Xphere; Tags: the
// /admin/tags tabs) or to the account's Organization (people, integrations,
// branding), and the shell shows it inside that part of the app (moduleNav.ts).
// The URLs stay /admin/<section> so bookmarks and links keep working.

const SECTIONS = ["overview", "tags", "products", "integrations", "branding", "xphere", "reps", "settings"] as const;
type SectionId = (typeof SECTIONS)[number];
/** The global admin's sections (moduleNav marks them adminOnly). */
const SUPER_ADMIN_SECTIONS: readonly SectionId[] = ["integrations", "branding", "xphere"];

export function AdminApp({ section }: { section: string }) {
  const [location, setLocation] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const isComputer = useIsComputer();

  const me = meQuery.data;
  const active: SectionId = SECTIONS.find((s) => s === section) ?? "overview";

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060912]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  // Gate: admins and managers only.
  const allowed = !!me && (me.user.isAdmin || ["admin", "manager"].includes(me.rep.role));
  if (!me || !allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060912] px-6 text-center text-white">
        <ShieldAlert className="h-10 w-10 text-red-400" />
        <div>
          <p className="text-lg font-semibold">{tm("accessRestricted")}</p>
          <p className="mt-1 text-sm text-white/50">
            {me ? tm("noAdminPermission") : tm("signInToContinue")}
          </p>
        </div>
        <button
          onClick={() => setLocation(me ? MODULE_HOME.visits : "/")}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          {me ? tm("backToApp") : tc("goToSignIn")}
        </button>
      </div>
    );
  }

  const viewer = { canManage: true, isAdmin: isSuperAdmin(me), isComputer };
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
  const back = active === "tags" ? MODULE_HOME.tags : isOrganization ? "/settings" : MODULE_HOME.visits;
  const heading = active === "tags" ? `${tc("moduleTags")} · ${t("navManage")}` : isOrganization ? t("navOrganization") : `${tc("moduleVisits")} · ${t("navManage")}`;

  return (
    <AppLayout
      title={title}
      size="wide"
      mobileMaxWidth="max-w-5xl"
      mobileColumnClassName="pb-20 pt-6"
      topBarActions={active === "tags" ? <CodeLookup onFound={(id) => setLocation(`/admin/tags/pieces/${id}`)} /> : undefined}
      mobileHeader={
        <>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setLocation(back)}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10"
              title={t("backToModule")}
              aria-label={t("backToModule")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{heading}</h1>
              <p className="text-xs text-white/40">{me.user.email}</p>
            </div>
          </div>

          {siblings.length > 0 && (
            <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
              {siblings.map(({ href, label, icon: Icon, match, adminOnly }) => {
                const isActive = match(location);
                return (
                  <button
                    key={href}
                    onClick={() => setLocation(href)}
                    className={`relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {adminOnly && <AdminBadge />}
                  </button>
                );
              })}
            </nav>
          )}
        </>
      }
    >
      {active === "overview" && <AdminOverview />}
      {active === "products" && <AdminProducts />}
      {/* A manager who types one of these URLs gets nothing (and the API answers 403). */}
      {SUPER_ADMIN_SECTIONS.includes(active) && !viewer.isAdmin && (
        <p className="py-16 text-center text-sm text-white/50">{tm("noAdminPermission")}</p>
      )}
      {active === "integrations" && viewer.isAdmin && <AdminIntegrations />}
      {active === "branding" && viewer.isAdmin && <AdminBranding />}
      {active === "xphere" && viewer.isAdmin && <AdminXphere />}
      {active === "reps" && <AdminReps />}
      {active === "tags" && <AdminTags />}
      {active === "settings" && <AdminSettings />}
    </AppLayout>
  );
}
