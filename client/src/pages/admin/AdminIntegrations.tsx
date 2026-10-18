import { useLocation } from "wouter";
import { Bot, KeyRound, Webhook } from "lucide-react";
import { shellMessages } from "@/i18n/messages/shell";
import { Tabs } from "@/components/xpot/Tabs";
import { useT } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { JourneyMcpCard } from "./tags/JourneyMcpCard";
import { AdminXphere } from "./AdminXphere";
import { IntegrationsHub } from "./platform/IntegrationsHub";
import { INTEGRATIONS_TABS, integrationsTabFromPath, integrationsTabPath, type IntegrationsTab } from "./integrationsUi";

const TAB_ICONS = { providers: KeyRound, xphere: Webhook, mcp: Bot };

/**
 * Admin › Integrations. The Services tab is the hub: one section per job Xpot
 * needs done (sign-in SMS, maps, voice, AI writing, CRM, AI assistants,
 * infrastructure). The CRM's per-person Xphere setup and the AI assistants'
 * access have their own tabs, which the hub links to. The tab is in the URL
 * (integrationsUi.ts): /admin/integrations, /admin/integrations/xphere, /admin/integrations/mcp.
 */
export function AdminIntegrations() {
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const tab: IntegrationsTab = integrationsTabFromPath(location);
  const labels: Record<IntegrationsTab, string> = { providers: tp("tabServices"), xphere: t("tabXphere"), mcp: tp("tabAssistants") };
  return (
    <div className="space-y-4">
      <Tabs
        tabs={INTEGRATIONS_TABS.map((id) => ({ id, label: labels[id], icon: TAB_ICONS[id], testId: `integrations-tab-${id}` }))}
        value={tab}
        onChange={(id) => navigate(integrationsTabPath(id))}
        ariaLabel={ts("orgIntegrations")}
        idPrefix="integrations"
        testId="integrations-tabs"
        accent="account"
      />
      {tab === "providers" && <IntegrationsHub />}
      {tab === "xphere" && <AdminXphere />}
      {tab === "mcp" && <JourneyMcpCard />}
    </div>
  );
}
