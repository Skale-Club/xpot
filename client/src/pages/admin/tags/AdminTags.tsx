import { screens } from "@/lib/screens";
import { Redirect, useLocation } from "wouter";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Button } from "@/components/ui/button";
import { isTagPieceQueue } from "@shared/tagQueues";
import { productionPath } from "./production-workflow";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useProductionAccess } from "./production-shared";
import { useT } from "@/i18n";
import { manageMessages } from "@/i18n/messages/manage";
import { workspacesMessages } from "@/i18n/messages/workspaces";

const { tagOverview: OverviewTab, tagQueue: OverviewQueue, tagPieces: PiecesTab, tagDetail: PieceDetail, tagKits: KitsTab, tagShowcase: ShowcaseTab, tagProduction: ProductionTab, tagProvisioners: ProvisionersTab, tagJourney: JourneyTab } = screens;

// "shop" is the Tags › Shop showcase (the Xpot admin's). Same order and names as the Tags "Manage" group in the sidebar (components/xpot/moduleNav.ts): the piece's life,
// production first. "kits" is Distribution (Hand out, Stuscle orders, Kits, Take back); the URL stays /kits.
const TABS = [
  { id: "overview", labelKey: "manageOverview" },
  { id: "production", labelKey: "manageProduction", adminOnly: true },
  { id: "pieces", labelKey: "managePieces" },
  { id: "kits", labelKey: "manageKits" },
  { id: "shop", labelKey: "manageShop", adminOnly: true },
  { id: "journey", labelKey: "manageJourney", adminOnly: true },
  { id: "provisioners", labelKey: "manageWriters", adminOnly: true },
] as const satisfies ReadonlyArray<{ id: string; labelKey: string; adminOnly?: boolean }>;
type TabId = (typeof TABS)[number]["id"];

export const ADMIN_TAGS_BASE = "/admin/tags";

/**
 * Admin → Tags: stock, resellers' kits, batches from the factory, the admin-only
 * Journey and the desktop NFC writers. Paths: /admin/tags/<tab>[/<id>].
 */
export function AdminTags() {
  const [location, setLocation] = useLocation();
  const tm = useT(manageMessages);
  const tw = useT(workspacesMessages);
  const [tabSegment, idSegment, ...more] = location.replace(/^\/admin\/tags\/?/, "").split("/");
  // Overview, Inventory and Distribution are every panel's (the server narrows them to the owner's or the partner's
  // organization). The shop, the Journey and, for anyone but a partner, Production and the NFC writers are the
  // platform's: other profiles neither see their tabs nor reach them by URL (and the API answers 403).
  const isAdmin = useIsSuperAdmin();
  // Production and the bench computers are also a partner's (the owner of a branch that prints its own pieces), for that branch.
  const { prints } = useProductionAccess();
  const reaches = (id: TabId) => isAdmin || ((id === "production" || id === "provisioners") && prints);
  const tabs = TABS.filter((t) => !("adminOnly" in t) || reaches(t.id));
  const tab: TabId = tabSegment === "batches" && reaches("production") ? "production" : tabs.find((t) => t.id === tabSegment)?.id ?? "overview";
  // The per-reseller report moved into People › person (Tags sales); old links still land there.
  if (tabSegment === "team") return <Redirect to="/admin/reps" />;
  const id = idSegment ? decodeURIComponent(idSegment) : null;
  const go = (path: string) => setLocation(`${ADMIN_TAGS_BASE}${productionPath(path)}`);
  const requested = TABS.find((item) => item.id === tabSegment);
  if ((requested && "adminOnly" in requested && !reaches(requested.id)) || (tabSegment === "batches" && !reaches("production"))) return <EmptyState icon={ShieldAlert} title={tm("accessRestricted")} hint={tm("noAdminPermission")} action={<Button variant="secondary" onClick={() => setLocation("/admin")}>{tw("todayTitle")}</Button>} />;

  return (
    <div className="space-y-5">
      {tab === "overview" && (isTagPieceQueue(id) ? <OverviewQueue queue={id} go={go} /> : <OverviewTab go={go} />)}
      {tab === "pieces" && (id ? <PieceDetail id={id} go={go} /> : <PiecesTab go={go} />)}
      {tab === "kits" && <KitsTab go={go} />}
      {tab === "production" && reaches("production") && <ProductionTab rest={(tabSegment === "batches" ? ["batches", idSegment ?? "", ...more] : [idSegment ?? "", ...more]).map(decodeURIComponent)} go={go} />}
      {tab === "journey" && isAdmin && <JourneyTab />}
      {tab === "shop" && isAdmin && <ShowcaseTab />}
      {tab === "provisioners" && reaches("provisioners") && <ProvisionersTab go={go} />}
    </div>
  );
}
