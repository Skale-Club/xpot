import { screens } from "@/lib/screens";
import { Redirect, useLocation, useSearch } from "wouter";
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
import { panelHome, panelOfPath, panelsOf } from "@/components/xpot/panels";
import { usePanelNames } from "@/components/xpot/panelNames";
import { ownedOrganizationId, profileOfMe } from "@/lib/adminMode";
import type { XpotMeResponse } from "@/pages/xpot/types";
import { CodeLookup } from "./tags/CodeLookup";
import { useProductionAccess } from "./tags/production-shared";
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

const { adminTags: AdminTags, adminOverview: AdminOverview, adminReps: AdminReps, adminIntegrations: AdminIntegrations, adminBrandSite: AdminBrandSite, adminProducts: AdminProducts, adminSettings: AdminSettings, adminHealth: AdminSystemHealth, adminHome: AdminHome, adminWork: AdminWork, adminAcademy: AdminAcademy } = screens;

const SECTIONS = ["home", "work", "overview", "tags", "products", "integrations", "branding", "landing", "xphere", "reps", "settings", "health", "academy"] as const;
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

/** Tasks and Sales of every company left the Admin menu but still open by their URL: their title is said here. */
const HIDDEN_WORK = /^\/admin\/work\/(tasks|sales)(?:\/|$)/;

/**
 * The management screens' frame: the sidebar (a bottom bar on the phone) of the panel the path belongs to
 * (components/xpot/panels.ts) and the screen's own title, once. An owner's screens have Visits' chrome and its Company
 * group (AppLayout); a member has none of these.
 */
export function AdminApp({ section }: { section: string }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const t = useT(shellMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageMessages);
  const tn = useT(navIaMessages);
  const tw = useT(workspacesMessages);
  const tf = useT(adminTagsFlowMessages);
  const { panelLabel, names } = usePanelNames();
  const modules = useXpotModules();
  const { prints } = useProductionAccess();
  const me = meQuery.data;
  const active = SECTIONS.find((id) => id === section) ?? "home";
  if (meQuery.isLoading) return <AppLoader />;
  // No session, a sign-up under review or no signal: the gate says which (it is not "access restricted").
  if (!me) return <SessionGate error={meQuery.error} />;
  const profile = profileOfMe(me);
  const hasPanel = !!profile && can(profile, "useManagementPanel");
  // The panel of the path must be one the person has, on top of the rule for the screen (never more access than that rule gave).
  // An owner has no panel (their screens are Visits' Company group), so their rule alone stays: exactly the sections they had.
  const panel = panelOfPath(`${location}${search ? `?${search}` : ""}`, profile);
  const allowed = hasPanel && (profile === "platform" || ORGANIZATION_SECTIONS.includes(active) || active === "overview") && (profile === "owner" || panelsOf(profile, modules).includes(panel));
  if (!me || !hasPanel) {
    const exit = me ? homeForModules(modules) : "/";
    return <AppBackground><div className="mx-auto w-full max-w-md px-4 pb-20 pt-6"><PageHeader backHref={exit} backLabel={me ? tm("backToApp") : tc("goToSignIn")} title={tm("accessRestricted")} /><EmptyState icon={ShieldAlert} title={me ? tm("ownersOnly") : tm("signInToContinue")} action={<Button variant="secondary" onClick={() => navigate(exit)}>{me ? tm("backToApp") : tc("goToSignIn")}</Button>} /></div></AppBackground>;
  }
  // A partner has no Today of its own: its first screen is the board of its production.
  if (profile === "partner" && /^\/admin\/?$/.test(location)) return <Redirect to={panelHome("production", profile)} />;
  // What a screen the person's panel lacks is titled, and the way back it offers: the Company group's name for an owner.
  const panelName = profile === "owner" ? names.company : panelLabel(panel);
  const todayName = profile === "owner" ? names.companyOverview : tw("todayTitle");
  const groups = panelGroups(profile, panel, modules, { shell: t, tags: tt, nav: tn }, names, ownedOrganizationId(me));
  const current = groups.flatMap((group) => group.items).find((item) => item.match(location));
  // A queue's list (what Today opened) is titled by the queue, not by the screen it hangs from (NAV-17).
  const queue = /^\/admin\/tags\/overview\/([^/]+)\/?$/.exec(location)?.[1];
  const hidden = HIDDEN_WORK.exec(location)?.[1];
  const title = queue && isTagPieceQueue(queue) ? tf(pieceQueueCard(queue).labelKey) : current?.label ?? (hidden ? t(hidden === "tasks" ? "tabTasks" : "tabSales") : panelName);
  const denied = profile !== "platform" && (PLATFORM_ONLY.test(location) || (PRINT_ONLY.test(location) && !prints));
  const lookupAllowed = active === "tags" && !NO_CODE_LOOKUP.test(location) && !denied;
  // Stock has its own search, which takes a code or a scanned link: a second box for the same thing would only ask which to use.
  const lookupBox = lookupAllowed && !OWN_PIECE_SEARCH.test(location);
  // A screen the person's panel does not have: said inside the panel, with the way back to Today.
  if (!allowed) return <AppLayout title={panelName} size="wide" mobileMaxWidth="max-w-5xl" mobileColumnClassName="pb-10 pt-5">
    <EmptyState icon={ShieldAlert} title={tm("accessRestricted")} hint={tm("noAdminPermission")} action={<Button variant="secondary" onClick={() => navigate("/admin")}>{todayName}</Button>} />
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
    {active === "academy" && <AdminAcademy />}
    {active === "reps" && <AdminReps />}
    {active === "tags" && <AdminTags />}
    {active === "settings" && <AdminSettings />}
  </AppLayout>;
}
