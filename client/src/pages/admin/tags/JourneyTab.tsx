import { Archive, Layers, Shapes, Users } from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { useBatches } from "./batches-shared";
import { JourneyPanel } from "./JourneyPanel";
import { useIsTagAdmin, useJourneyLabels } from "./journey-shared";
import { useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";

/**
 * Admin only (the tab is hidden from managers, and the panel and the server
 * refuse them too). Every batch's story in one timeline, searchable and
 * filterable by batch, reseller and kind. AI access (MCP) lives in Integrations.
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
  // ?batch=…&rep=…&kind=…&archived=1&q=…
  const filters = useUrlFilters({ batch: "", rep: "", kind: "", archived: "", q: "" });
  const { batch, rep, kind, q } = filters.values;
  const includeArchived = filters.values.archived === "1";

  const batchOptions = batches.map((b) => ({ value: b.id, label: `${b.batchCode} · ${b.name}` }));
  const repOptions = reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }));

  return (
    <div className="space-y-4" data-testid="admin-tags-journey-tab">
      <FilterBar
        testId="journey-filters"
        search={<FilterSearch value={q} onChange={(next) => filters.set({ q: next })} placeholder={t("journeySearch")} testId="journey-search" />}
        controls={
          <>
            <FilterSelect value={batch} onChange={(next) => filters.set({ batch: next })} placeholder={t("allBatches")} options={batchOptions} icon={Layers} testId="journey-filter-batch" />
            <FilterSelect value={rep} onChange={(next) => filters.set({ rep: next })} placeholder={t("allResellers")} options={repOptions} icon={Users} testId="journey-filter-reseller" />
            <FilterSelect value={kind} onChange={(next) => filters.set({ kind: next })} placeholder={t("allKinds")} options={journeyLabels.kindOptions} icon={Shapes} testId="journey-filter-kind" />
            <FilterToggle pressed={includeArchived} onChange={(on) => filters.set({ archived: on ? "1" : null })} label={t("showArchived")} icon={Archive} testId="journey-filter-archived" />
          </>
        }
        summary={{ active: filters.activeCount() > 0, onClear: () => filters.reset() }}
      />
      <JourneyPanel
        scope={{ batchId: batch || undefined }}
        filters={{ repId: rep ? Number(rep) : undefined, kind: kind || undefined, includeArchived }}
        search={q}
      />
    </div>
  );
}
