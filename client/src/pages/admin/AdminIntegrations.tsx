import { useLocation } from "wouter";
import { Bot, KeyRound, Webhook } from "lucide-react";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { navigateGuarded, useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { shellMessages } from "@/i18n/messages/shell";
import { Tabs } from "@/components/xpot/Tabs";
import { useT } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { JourneyMcpCard } from "./tags/JourneyMcpCard";
import { AdminXphere } from "./AdminXphere";
import { IntegrationsHub } from "./platform/IntegrationsHub";
import { INTEGRATIONS_TABS, integrationsTabFromPath, integrationsTabPath, type IntegrationsTab } from "./integrationsUi";
import { UnsavedEditsContext, useUnsavedEdits } from "./unsavedEdits";

const TAB_ICONS = { providers: KeyRound, xphere: Webhook, mcp: Bot };

/**
 * Admin › Integrations. The Services tab is the hub: one section per job Xpot
 * needs done (sign-in SMS, maps, voice, AI writing, CRM, AI assistants,
 * infrastructure). The CRM's per-person Xphere setup and the AI assistants'
 * access have their own tabs, which the hub links to. The tab is in the URL
 * (integrationsUi.ts): /admin/integrations, /admin/integrations/xphere, /admin/integrations/mcp.
 * Each provider card and Xphere row saves on its own; while any has unsaved
 * edits, switching tab or leaving (a link, the sidebar, the palette, Back,
 * closing the tab) asks first, as the Landing editor does.
 */
export function AdminIntegrations() {
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const ts = useT(shellMessages);
  const [location, navigate] = useLocation();
  const tab: IntegrationsTab = integrationsTabFromPath(location);
  const labels: Record<IntegrationsTab, string> = { providers: tp("tabServices"), xphere: t("tabXphere"), mcp: tp("tabAssistants") };
  const edits = useUnsavedEdits();
  const guard = useUnsavedChangesGuard(edits.dirty);
  return (
    <UnsavedEditsContext.Provider value={edits.report}>
      <div className="space-y-4">
        <Tabs
          tabs={INTEGRATIONS_TABS.map((id) => ({ id, label: labels[id], icon: TAB_ICONS[id], testId: `integrations-tab-${id}` }))}
          value={tab}
          // Another tab unmounts this one's cards: their edits would be lost, so it asks first.
          onChange={(id) => navigateGuarded(integrationsTabPath(id), navigate)}
          ariaLabel={ts("orgIntegrations")}
          idPrefix="integrations"
          testId="integrations-tabs"
          accent="account"
        />
        {tab === "providers" && <IntegrationsHub />}
        {tab === "xphere" && <AdminXphere />}
        {tab === "mcp" && <JourneyMcpCard />}
        <ConfirmDialog
          open={!!guard.pendingHref}
          onOpenChange={(open) => !open && guard.stay()}
          title={t("leaveTitle")}
          description={t("leaveBody")}
          confirmLabel={t("leaveConfirm")}
          destructive
          onConfirm={guard.leave}
          testId="integrations-leave"
        />
      </div>
    </UnsavedEditsContext.Provider>
  );
}
