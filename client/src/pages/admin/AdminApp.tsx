import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { AppLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/xpot/AppBackground";
import { EmptyState } from "@/components/xpot/EmptyState";
import { PageHeader } from "@/components/xpot/PageHeader";
import { SessionGate } from "@/components/xpot/SessionGate";
import { AppLayout } from "@/components/xpot/AppLayout";
import { panelGroups } from "@/components/xpot/moduleNav";
import { usePanelNames } from "@/components/xpot/panelNames";
import { ownedOrganizationId, profileOfMe } from "@/lib/adminMode";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { AdminOverview } from "./AdminOverview";
import { AdminReps } from "./AdminReps";
import { AdminIntegrations } from "./AdminIntegrations";
import { AdminBrandSite } from "./platform/AdminBrandSite";
import { AdminTags, CodeLookup } from "./tags/AdminTags";
import { useProductionAccess } from "./tags/production-shared";
import { AdminProducts } from "./AdminProducts";
import { AdminSettings } from "./AdminSettings";
import { AdminSystemHealth } from "./AdminSystemHealth";
import { AdminHome } from "./AdminHome";
import { AdminWork } from "./AdminWork";
import { can } from "@shared/profiles";
import { isTagPieceQueue } from "@shared/tagQueues";
import { pieceQueueCard } from "./tags/overview-model";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { navIaMessages } from "@/i18n/messages/navIa";
import { manageMessages } from "@/i18n/messages/manage";
import { workspacesMessages } from "@/i18n/messages/workspaces";
import { useXpotModules, homeForModules } from "@/components/ModuleSwitch";

const SECTIONS = ["home", "work", "overview", "tags", "products", "integrations", "branding", "landing", "xphere", "reps", "settings", "health"] as const;
/** What an owner's or a partner's panel reaches; the rest of /admin is the platform's. (Tags narrows itself by tab: AdminTags.) */
const ORGANIZATION_SECTIONS = ["home", "work", "tags"];
/**
 * Hand out and Take back have their own code field; a second one above them would open the piece and lose the list
 * (NAV-32). A queue Today opened lists its pieces and opens each one itself: a code box above it only pushes it down.
 */
const NO_CODE_LOOKUP = /^\/admin\/tags\/(?:kits|overview\/[^/]+)(?:\/|$)/;
/** Stock lists and a piece's own page: the list has its own search, and a piece needs no second lookup (PE-30). */
const OWN_PIECE_SEARCH = /^\/admin\/tags\/pieces(?:\/|$)/;
/** The Tags screens only the platform reaches, and those a partner reaches only if it prints: said as denied, so no lookup above them (PROD-57). */
const PLATFORM_ONLY = /^\/admin\/tags\/(?:shop|journey)(?:\/|$)/;
const PRINT_ONLY = /^\/admin\/tags\/(?:production|batches|provisioners)(?:\/|$)/;

/**
 * The panel's frame, one per profile (shared/profiles.ts): the sidebar (a bottom bar on the phone) and
 * the screen's own title, once. A member has no panel.
 */
export function AdminApp({ section }: { section: string }) {
  const [location, navigate] = useLocation();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const tn = useT(navIaMessages);
  const tw = useT(workspacesMessages);
  const tf = useT(adminTagsFlowMessages);
  const { panelName: nameOf, names } = usePanelNames();
  const modules = useXpotModules();
  const { prints } = useProductionAccess();
  const me = meQuery.data;
  const active = SECTIONS.find((id) => id === section) ?? "home";
  if (meQuery.isLoading) return <AppLoader />;
  // No session, a sign-up under review or no signal: the gate says which (it is not "access restricted").
  if (!me) return <SessionGate error={meQuery.error} />;
  const profile = profileOfMe(me);
  const hasPanel = !!profile && can(profile, "useManagementPanel");
  const allowed = hasPanel && (profile === "platform" || ORGANIZATION_SECTIONS.includes(active) || active === "overview");
  if (!me || !hasPanel) {
    const exit = me ? homeForModules(modules) : "/";
    return <AppBackground><div className="mx-auto w-full max-w-md px-4 pb-20 pt-6"><PageHeader backHref={exit} backLabel={me ? tm("backToApp") : tc("goToSignIn")} title={tm("accessRestricted")} /><EmptyState icon={ShieldAlert} title={me ? tm("ownersOnly") : tm("signInToContinue")} action={<Button variant="secondary" onClick={() => navigate(exit)}>{me ? tm("backToApp") : tc("goToSignIn")}</Button>} /></div></AppBackground>;
  }
  const panelName = nameOf(profile);
  const groups = panelGroups(profile, modules, { shell: t, tags: tt, nav: tn }, names, ownedOrganizationId(me));
  const current = groups.flatMap((group) => group.items).find((item) => item.match(location));
  // A queue's list (what Today opened) is titled by the queue, not by the screen it hangs from (NAV-17).
  const queue = /^\/admin\/tags\/overview\/([^/]+)\/?$/.exec(location)?.[1];
  const title = queue && isTagPieceQueue(queue) ? tf(pieceQueueCard(queue).labelKey) : current?.label ?? panelName;
  const denied = profile !== "platform" && (PLATFORM_ONLY.test(location) || (PRINT_ONLY.test(location) && !prints));
  const lookupAllowed = active === "tags" && !NO_CODE_LOOKUP.test(location) && !denied;
  // Stock has its own search, which takes a code or a scanned link: a second box for the same thing would only ask which to use.
  const lookupBox = lookupAllowed && !OWN_PIECE_SEARCH.test(location);
  // A screen the person's panel does not have: said inside the panel, with the way back to Today.
  if (!allowed) return <AppLayout title={panelName} size="wide" mobileMaxWidth="max-w-5xl" mobileColumnClassName="pb-10 pt-5">
    <EmptyState icon={ShieldAlert} title={tm("accessRestricted")} hint={tm("noAdminPermission")} action={<Button variant="secondary" onClick={() => navigate("/admin")}>{tw("todayTitle")}</Button>} />
  </AppLayout>;
  return <AppLayout title={title} size="wide" mobileMaxWidth="max-w-5xl" mobileColumnClassName="pb-10 pt-5"
    topBarActions={lookupBox ? <CodeLookup onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /> : undefined}
    // The frame says the screen's title on a phone (AppLayout), once.
    mobileHeader={lookupBox ? <div className="mb-5"><CodeLookup fill onFound={(id) => navigate(`/admin/tags/pieces/${id}`)} /></div> : undefined}>
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
