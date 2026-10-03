import { useState, type FormEvent } from "react";
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

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "pieces", label: "Pieces" },
  { id: "kits", label: "Kits" },
  { id: "batches", label: "Batches" },
  { id: "team", label: "Team" },
  { id: "provisioners", label: "NFC writers" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const ADMIN_TAGS_BASE = "/admin/tags";

/** Type the code printed on a piece, open its record. */
function CodeLookup({ onFound }: { onFound: (id: string) => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTagCode(code);
    if (!normalized) {
      toast({ title: "Invalid code", description: "Codes are 8 letters/numbers, e.g. A7K3P9X2.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const tag = await getJson<{ id: string }>(`/api/xpot/tags/lookup/${normalized}`);
      setCode("");
      onFound(tag.id);
    } catch (err) {
      toast({ title: "Piece not found", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Code, e.g. A7K3P9X2"
        className={`${INPUT} w-48 font-mono`}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        data-testid="admin-tag-code-lookup"
      />
      <button type="submit" disabled={busy || !code.trim()} className={BTN}>
        <ScanLine className="h-4 w-4" />
        Open
      </button>
    </form>
  );
}

/**
 * Admin → Tags: stock, resellers' kits, batches from the factory, the team
 * report and the desktop NFC writers. Paths: /admin/tags/<tab>[/<id>].
 */
export function AdminTags() {
  const [location, setLocation] = useLocation();
  const [tabSegment, idSegment] = location.replace(/^\/admin\/tags\/?/, "").split("/");
  const tab: TabId = TABS.find((t) => t.id === tabSegment)?.id ?? "overview";
  const id = idSegment ? decodeURIComponent(idSegment) : null;
  const go = (path: string) => setLocation(`${ADMIN_TAGS_BASE}${path}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(`/${t.id}`)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              }`}
              data-testid={`admin-tags-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <CodeLookup onFound={(tagId) => go(`/pieces/${tagId}`)} />
      </div>

      {tab === "overview" && <OverviewTab go={go} />}
      {tab === "pieces" && (id ? <PieceDetail id={id} go={go} /> : <PiecesTab go={go} />)}
      {tab === "kits" && <KitsTab go={go} />}
      {tab === "batches" && (id ? <BatchDetail id={id} go={go} /> : <BatchesTab go={go} />)}
      {tab === "team" && <TeamTab go={go} />}
      {tab === "provisioners" && <ProvisionersTab go={go} />}
    </div>
  );
}
