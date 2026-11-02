import type { ReactNode } from "react";
import type { XpotModule } from "@shared/modules";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { ModuleSwitch, useXpotModules } from "@/components/ModuleSwitch";
import { AccountMenu, useOnline } from "./AccountMenu";

/**
 * The top of a phone screen you start from, in both areas: the module switch (Visits | Tags) for someone with both
 * modules, else the screen's name; and the account menu, which is also the way between My work and the panel. 48px.
 * The greeting, the date and the logo are gone: they said nothing the person needed on every screen. Offline shows as a strip, not a dot.
 * Screens inside something (a piece, a company) have their own back arrow and title instead (moduleNav phoneBarHidden).
 */
export function PhoneTopBar({ module, title }: { module: XpotModule | null; title: ReactNode }) {
  const t = useT(shellMessages);
  const modules = useXpotModules();
  const online = useOnline();
  const moduleSwitch = module && modules.length > 1 ? <ModuleSwitch current={module} /> : null;
  const lead = moduleSwitch ?? <h1 className="truncate text-lg font-bold tracking-tight text-white" data-testid="phone-title">{title}</h1>;
  return (
    <div className="mb-4 space-y-3 lg:hidden" data-testid="phone-top-bar">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{lead}</div>
        <AccountMenu variant="phone" />
      </div>
      {!online ? <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="status">{t("offline")}</p> : null}
    </div>
  );
}
