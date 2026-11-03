import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLoader, ScreenLoader } from "@/components/ui/spinner";
import { ModuleSwitch, homeForModules } from "@/components/ModuleSwitch";
import { repModules } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { organizationsMessages } from "@/i18n/messages/organizations";
import { isVisitsPath } from "@/lib/xpot";
import { workspaceForPath } from "@/lib/workspace";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { TagsTabBar } from "@/pages/tags/TagsTabBar";
import { AppLayout, MODULE_COLUMN } from "./AppLayout";
import { ShellHeader } from "./ShellHeader";
import { VisitsTabBar } from "./VisitsTabBar";
import { PageHeader } from "./PageHeader";

/** A route or scope change keeps navigation visible while its content is unavailable. */
export function RouteLoader() {
  const [path] = useLocation();
  const { data: me } = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], enabled: false });
  const modules = me ? repModules({ role: me.user.isAdmin ? "admin" : me.rep.role, modules: me.rep.modules }) : [];
  const t = useT(shellMessages);
  const to = useT(organizationsMessages);
  const management = workspaceForPath(path) === "management";
  const tags = /^\/tags(?:\/|$)/.test(path);
  const visits = isVisitsPath(path);
  if (!me || !(management || tags || visits || path === "/settings")) return <AppLoader />;
  if (path === "/settings") return (
    <AppLayout title={t("navSettings")} mobileMaxWidth="max-w-lg" mobileColumnClassName="pb-20 pt-6" pending>
      <PageHeader title={t("navSettings")} backHref={homeForModules(modules)} className="mb-6" />
      <ScreenLoader />
    </AppLayout>
  );
  return (
    <AppLayout
      title={path.startsWith("/organizations") ? to("title") : "Xpot"}
      wide
      pending
      mobileColumnClassName={management ? "pb-10 pt-5" : MODULE_COLUMN}
      mobileHeader={!management ? <><ShellHeader /><div className="mb-4"><ModuleSwitch current={tags ? "tags" : "visits"} /></div></> : undefined}
      mobileNav={!management ? tags ? <TagsTabBar /> : <VisitsTabBar /> : undefined}
    >
      <ScreenLoader />
    </AppLayout>
  );
}
