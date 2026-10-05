import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { useBatches } from "./batches-shared";
import { JourneyMcpCard } from "./JourneyMcpCard";
import { JourneyPanel } from "./JourneyPanel";
import { useIsTagAdmin, useJourneyLabels } from "./journey-shared";
import { Select, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";

/**
 * Admin only (the tab is hidden from managers, and the panel and the server
 * refuse them too). Every batch's story in one timeline, filterable by batch,
 * reseller and kind, plus the MCP tokens that give an AI session access.
 */
export function JourneyTab() {
  // The gate lives here so a manager never mounts the queries below.
  const isAdmin = useIsTagAdmin();
  return isAdmin ? <JourneyTabBody /> : null;
}

function JourneyTabBody() {
  const t = useT(manageTagsMessages);
  const labels = useTagLabels();
  const journeyLabels = useJourneyLabels();
  const { data: batches = [] } = useBatches();
  const { data: reps = [] } = useReps();
  const [batchId, setBatchId] = useState<string | undefined>();
  const [repId, setRepId] = useState<string | undefined>();
  const [kind, setKind] = useState<string | undefined>();
  const [includeArchived, setIncludeArchived] = useState(false);

  const batchOptions = batches.map((b) => ({ value: b.id, label: `${b.batchCode} · ${b.name}` }));
  const repOptions = reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }));

  return (
    <div className="space-y-6" data-testid="admin-tags-journey-tab">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={batchId} onChange={setBatchId} placeholder={t("allBatches")} options={batchOptions} className="sm:w-72" testId="journey-filter-batch" />
          <Select value={repId} onChange={setRepId} placeholder={t("allResellers")} options={repOptions} className="sm:w-56" testId="journey-filter-reseller" />
          <Select value={kind} onChange={setKind} placeholder={t("allKinds")} options={journeyLabels.kindOptions} className="sm:w-44" testId="journey-filter-kind" />
          <div className="flex items-center gap-2 px-1">
            <Switch id="journey-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
            <label htmlFor="journey-archived" className="text-sm text-white/60">
              {t("showArchived")}
            </label>
          </div>
        </div>
        <JourneyPanel scope={{ batchId }} filters={{ repId: repId ? Number(repId) : undefined, kind, includeArchived }} />
      </div>
      <JourneyMcpCard />
    </div>
  );
}
