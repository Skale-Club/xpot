import type { ReactNode } from "react";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { useViewerAccess } from "@/lib/adminMode";
import { ModuleSwitch, useXpotModules } from "@/components/ModuleSwitch";
import { AccountMenu, useOnline } from "./AccountMenu";
import { AreaSwitch } from "./AreaSwitch";

/**
 * The top of a phone screen you start from, in both areas: the area switch (My work | My company) for someone with
 * a panel, else the module switch (Visits | Tags) for someone with both modules, else the screen's name; and the
 * account menu. 48px for most people, one row more when someone has a panel and both modules. The greeting, the date
 * and the logo are gone: they said nothing the person needed on every screen. Offline shows as a strip, not a dot.
 * Screens inside something (a piece, a company) have their own back arrow and title instead (moduleNav phoneBarHidden).
 */
export function PhoneTopBar({ module, title }: { module: XpotModule | null; title: ReactNode }) {
  const t = useT(shellMessages);
  const modules = useXpotModules();
  const { reach, adminMode } = useViewerAccess();
  const online = useOnline();
  const moduleSwitch = module && modules.length > 1 ? <ModuleSwitch current={module} /> : null;
  const lead = reach
    ? <AreaSwitch module={module} />
    : moduleSwitch ?? <h1 className="truncate text-lg font-bold tracking-tight text-white" data-testid="phone-title">{title}</h1>;
  return (
    <div className="mb-4 space-y-3 lg:hidden" data-testid="phone-top-bar">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{lead}</div>
        <AccountMenu variant="phone" />
      </div>
      {reach && !adminMode ? moduleSwitch : null}
      {!online ? <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="status">{t("offline")}</p> : null}
    </div>
  );
}
