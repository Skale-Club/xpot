import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ScanLine, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/xpot/EmptyState";
import { parseTagIntakeScan } from "@shared/tagIntake";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, getJson } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/xpot/Field";
import { isTagPieceQueue } from "@shared/tagQueues";
import { OverviewQueue, OverviewTab } from "./OverviewTab";
import { PiecesTab } from "./PiecesTab";
import { PieceDetail } from "./PieceDetail";
import { KitsTab } from "./KitsTab";
import { productionPath } from "./production-workflow";
import { TeamTab } from "./TeamTab";
import { ShowcaseTab } from "./ShowcaseTab";
import { ProductionTab } from "./ProductionTab";
import { ProvisionersTab } from "./ProvisionersTab";
import { JourneyTab } from "./JourneyTab";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageMessages } from "@/i18n/messages/manage";

// "shop" is the Tags › Shop showcase (the Xpot admin's). Same order and names as the Tags "Manage" group in the sidebar (components/xpot/moduleNav.ts): the piece's life,
// production first. "kits" is Distribution (Hand out, Stuscle orders, Kits, Take back); the URL stays /kits.
const TABS = [
  { id: "overview", labelKey: "manageOverview" },
  { id: "production", labelKey: "manageProduction", adminOnly: true },
  { id: "pieces", labelKey: "managePieces" },
  { id: "kits", labelKey: "manageKits" },
  { id: "team", labelKey: "manageResellers" },
  { id: "shop", labelKey: "manageShop", adminOnly: true },
  { id: "journey", labelKey: "manageJourney", adminOnly: true },
  { id: "provisioners", labelKey: "manageWriters", adminOnly: true },
] as const satisfies ReadonlyArray<{ id: string; labelKey: string; adminOnly?: boolean }>;
type TabId = (typeof TABS)[number]["id"];

export const ADMIN_TAGS_BASE = "/admin/tags";

/**
 * Type the code printed on a piece, or paste what its QR / chip holds (https://xpot.place/q/CODE, /n/CODE, the app's
 * /tags/t/CODE), and open its record. Same parser as batch intake (shared/tagIntake.ts); the host serving the app
 * counts as a tag host too. On desktop it sits in the top bar (AdminApp).
 */
export function CodeLookup({ onFound, fill = false }: { onFound: (id: string) => void; /** Take the full row (the phone strip). */ fill?: boolean }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const scan = parseTagIntakeScan(code, [window.location.hostname]);
    const normalized = scan.ok ? scan.publicCode : null;
    if (!normalized) {
      toast({ title: t("invalidCode"), description: t("invalidCodeHint"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const tag = await getJson<{ id: string }>(`/api/xpot/tags/lookup/${normalized}`);
      setCode("");
      onFound(tag.id);
    } catch (err) {
      toast({ title: t("pieceNotFound"), description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={`flex min-w-0 gap-2 ${fill ? "w-full" : ""}`}>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("codePlaceholder")}
        aria-label={t("codePlaceholder")}
        className={`min-h-10 min-w-0 font-mono ${fill ? "flex-1" : "w-48 xl:w-60"}`}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        data-testid="admin-tag-code-lookup"
      />
      <Button type="submit" variant="brand" accent="tags" className="min-h-10 shrink-0" disabled={!code.trim()} loading={busy}>
        <ScanLine className="h-4 w-4" />
        {t("open")}
      </Button>
    </form>
  );
}

/**
 * Admin → Tags: stock, resellers' kits, batches from the factory, the admin-only
 * Journey, the team report and the desktop NFC writers. Paths: /admin/tags/<tab>[/<id>].
 */
export function AdminTags() {
  const [location, setLocation] = useLocation();
  const tm = useT(manageMessages);
  const [tabSegment, idSegment, ...more] = location.replace(/^\/admin\/tags\/?/, "").split("/");
  // Batches, the Journey and the NFC writers are the global admin's: managers
  // neither see their tabs nor reach them by URL (and the API answers 403).
  const isAdmin = useIsSuperAdmin();
  const tabs = TABS.filter((t) => isAdmin || !("adminOnly" in t));
  const tab: TabId = tabSegment === "batches" && isAdmin ? "production" : tabs.find((t) => t.id === tabSegment)?.id ?? "overview";
  const id = idSegment ? decodeURIComponent(idSegment) : null;
  const go = (path: string) => setLocation(`${ADMIN_TAGS_BASE}${productionPath(path)}`);
  const requested = TABS.find((item) => item.id === tabSegment);
  if (!isAdmin && ((requested && "adminOnly" in requested) || tabSegment === "batches")) return <EmptyState tone="red" icon={ShieldAlert} title={tm("accessRestricted")} hint={tm("noAdminPermission")} />;

  return (
    <div className="space-y-5">
      {tab === "overview" && (isTagPieceQueue(id) ? <OverviewQueue queue={id} go={go} /> : <OverviewTab go={go} />)}
      {tab === "pieces" && (id ? <PieceDetail id={id} go={go} /> : <PiecesTab go={go} />)}
      {tab === "kits" && <KitsTab go={go} />}
      {tab === "production" && isAdmin && <ProductionTab rest={(tabSegment === "batches" ? ["batches", idSegment ?? "", ...more] : [idSegment ?? "", ...more]).map(decodeURIComponent)} go={go} />}
      {tab === "journey" && isAdmin && <JourneyTab />}
      {tab === "team" && <TeamTab go={go} />}
      {tab === "shop" && isAdmin && <ShowcaseTab />}
      {tab === "provisioners" && isAdmin && <ProvisionersTab go={go} />}
    </div>
  );
}
