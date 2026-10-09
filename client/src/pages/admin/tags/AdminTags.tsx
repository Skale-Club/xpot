import { useState, type FormEvent } from "react";
import { Tabs } from "@/components/xpot/Tabs";
import { useLocation } from "wouter";
import { ScanLine } from "lucide-react";
import { normalizeTagCode } from "@shared/tags";
import { useToast } from "@/hooks/use-toast";
import { errorMessage, getJson } from "./api";
import { BTN, INPUT } from "./ui";
import { OverviewTab } from "./OverviewTab";
import { PiecesTab } from "./PiecesTab";
import { PieceDetail } from "./PieceDetail";
import { KitsTab } from "./KitsTab";
import { BatchesTab } from "./BatchesTab";
import { BatchDetail } from "./BatchDetail";
import { TeamTab } from "./TeamTab";
import { ProvisionersTab } from "./ProvisionersTab";
import { JourneyTab } from "./JourneyTab";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// Same order and names as the Tags "Manage" group in the sidebar (components/xpot/moduleNav.ts).
const TABS = [
  { id: "overview", labelKey: "manageOverview" },
  { id: "pieces", labelKey: "managePieces" },
  { id: "kits", labelKey: "manageKits" },
  { id: "team", labelKey: "manageResellers" },
  { id: "batches", labelKey: "manageBatches", adminOnly: true },
  { id: "journey", labelKey: "manageJourney", adminOnly: true },
  { id: "provisioners", labelKey: "manageWriters", adminOnly: true },
] as const satisfies ReadonlyArray<{ id: string; labelKey: string; adminOnly?: boolean }>;
type TabId = (typeof TABS)[number]["id"];

export const ADMIN_TAGS_BASE = "/admin/tags";

/** Type the code printed on a piece, open its record. On desktop it sits in the top bar (AdminApp). */
export function CodeLookup({ onFound }: { onFound: (id: string) => void }) {
  const t = useT(manageTagsMessages);
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTagCode(code);
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
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t("codePlaceholder")}
        className={`${INPUT} w-48 font-mono`}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        data-testid="admin-tag-code-lookup"
      />
      <button type="submit" disabled={busy || !code.trim()} className={BTN}>
        <ScanLine className="h-4 w-4" />
        {t("open")}
      </button>
    </form>
  );
}

/**
 * Admin → Tags: stock, resellers' kits, batches from the factory, the admin-only
 * Journey, the team report and the desktop NFC writers. Paths: /admin/tags/<tab>[/<id>].
 */
export function AdminTags() {
  const [location, setLocation] = useLocation();
  const ts = useT(shellMessages);
  const [tabSegment, idSegment] = location.replace(/^\/admin\/tags\/?/, "").split("/");
  // Batches, the Journey and the NFC writers are the global admin's: managers
  // neither see their tabs nor reach them by URL (and the API answers 403).
  const isAdmin = useIsSuperAdmin();
  const tabs = TABS.filter((t) => isAdmin || !("adminOnly" in t));
  const tab: TabId = tabs.find((t) => t.id === tabSegment)?.id ?? "overview";
  const id = idSegment ? decodeURIComponent(idSegment) : null;
  const go = (path: string) => setLocation(`${ADMIN_TAGS_BASE}${path}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        {/* The desktop sidebar lists these as the Tags "Manage" group; the phone keeps the strip. */}
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: ts(t.labelKey), testId: `admin-tags-tab-${t.id}` }))}
          value={tab}
          onChange={(id) => go(`/${id}`)}
          ariaLabel={ts("navManage")}
          idPrefix="admin-tags"
          fill={false}
          className="min-w-0 flex-1"
        />
        <CodeLookup onFound={(tagId) => go(`/pieces/${tagId}`)} />
      </div>

      {tab === "overview" && <OverviewTab go={go} />}
      {tab === "pieces" && (id ? <PieceDetail id={id} go={go} /> : <PiecesTab go={go} />)}
      {tab === "kits" && <KitsTab go={go} />}
      {tab === "batches" && isAdmin && (id ? <BatchDetail id={id} go={go} /> : <BatchesTab go={go} />)}
      {tab === "journey" && isAdmin && <JourneyTab />}
      {tab === "team" && <TeamTab go={go} />}
      {tab === "provisioners" && isAdmin && <ProvisionersTab go={go} />}
    </div>
  );
}
