import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Network, PackageOpen, Users } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagKitItem } from "@shared/tagsApi";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Segmented } from "@/components/xpot/Segmented";
import { ADMIN_TAGS_KEY, STALE_MS, getJson, withQuery } from "./api";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { hasTagsModule, useResellers } from "./batches-shared";
import { Loading, LoadError, organizationFilterOptions, useOrganizations } from "./pieces-shared";
import { useViewerAccess } from "@/lib/adminMode";
import { HandOutFlow } from "./kits-give-form";
import { KitList } from "./kits-list";
import { AcquisitionInbox, pendingOf, useAcquisitions } from "./kits-orders";
import { ReturnsStation } from "./returns-station";
import { PAST_HAND_OUTS_PREVIEW, distributionView, pastHandOutsOpen, type DistributionView } from "./distribution-model";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";

/** The kits handed out so far, newest first, filtered by reseller (?kitRep=12) and, for platform management, organization (?org=3). */
function KitsView({ go, showAllFirst }: { go: (path: string) => void; showAllFirst: boolean }) {
  const [showAll, setShowAll] = useState(showAllFirst);
  const kitFilters = useUrlFilters({ kitRep: "", org: "" });
  const repFilter = /^\d+$/.test(kitFilters.values.kitRep) ? Number(kitFilters.values.kitRep) : null;
  const { canManage } = useViewerAccess();
  const orgFilter = canManage && /^[1-9]\d*$/.test(kitFilters.values.org) ? Number(kitFilters.values.org) : null;
  const { data: resellers = [] } = useResellers();
  const { data: organizations = [] } = useOrganizations(canManage);
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const tf = useT(adminTagsFlowMessages);
  const kitsUrl = withQuery("/api/xpot/admin/tag-kits", { repId: repFilter, organizationId: orgFilter });
  const kits = useQuery<TagKitItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "kits", kitsUrl],
    queryFn: () => getJson(kitsUrl),
    staleTime: STALE_MS,
  });
  const list = kits.data ?? [];
  const filtered = repFilter != null || orgFilter != null;
  // Latest few until asked for more; a filter (or an old kits link) shows everything it matches.
  const preview = !showAll && !filtered && list.length > PAST_HAND_OUTS_PREVIEW;
  return (
    <div className="space-y-3">
      <FilterBar
        testId="kits-filters"
        controls={
          <>
            <FilterSelect
              value={repFilter ? String(repFilter) : ""}
              onChange={(kitRep) => kitFilters.set({ kitRep })}
              placeholder={tm("allResellers")}
              icon={Users}
              options={resellers.map((r) => ({
                value: String(r.id),
                label: `${r.displayName}${r.team ? ` · ${r.team}` : ""}${!r.isActive ? tm("resellerInactive") : !hasTagsModule(r) ? tm("resellerNoTags") : ""}`,
              }))}
              testId="admin-tags-reseller-select"
            />
            {canManage ? (
              <FilterSelect
                value={orgFilter ? String(orgFilter) : ""}
                onChange={(org) => kitFilters.set({ org })}
                placeholder={tm("allOrganizations")}
                icon={Network}
                options={organizationFilterOptions(organizations, orgFilter ? String(orgFilter) : "", (id) => tm("organizationNumber", { id }))}
                testId="admin-kits-org"
              />
            ) : null}
          </>
        }
        summary={{ shown: list.length, active: filtered, onClear: () => kitFilters.reset() }}
      />
      {kits.isLoading ? (
        <Loading rows={3} />
      ) : kits.isError ? (
        <LoadError what={t("theKits")} error={kits.error} onRetry={() => void kits.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact tone="tags" icon={PackageOpen} title={orgFilter ? t("noKitsMatch") : repFilter ? t("noKitsForReseller") : t("noKitsYet")} cardStyle={{}} />
      ) : (
        <>
          <KitList kits={preview ? list.slice(0, PAST_HAND_OUTS_PREVIEW) : list} go={go} />
          {preview ? <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)} data-testid="past-hand-outs-show-all">{tf("showAllHandOuts", { count: list.length })}</Button> : null}
        </>
      )}
    </div>
  );
}

const VIEW_LABELS = { handout: "viewHandOut", orders: "viewOrders", returns: "viewReturns" } as const satisfies Record<DistributionView, string>;

/** Hand out's second half: what earlier hand-overs gave, collapsed until asked for (or until a link or filter points at it). */
function PastHandOuts({ go, wantOpen }: { go: (path: string) => void; wantOpen: boolean }) {
  const t = useT(adminTagsFlowMessages);
  const [open, setOpen] = useState(wantOpen);
  useEffect(() => {
    if (wantOpen) setOpen(true);
  }, [wantOpen]);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group" data-testid="admin-tags-past-hand-outs">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white/80 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 text-white/40 transition-transform group-open:rotate-90" aria-hidden="true" />
        {t("pastHandOuts")}
      </summary>
      <div className="mt-2">{open ? <KitsView go={go} showAllFirst={wantOpen} /> : null}</div>
    </details>
  );
}

/**
 * Distribution (/admin/tags/kits): pieces from house stock to resellers and back. Views, kept in `?view=`: Hand out
 * (step by step, with the past hand-outs below), Stuscle orders (wholesale orders waiting for their pieces) and
 * Take back (a scan station). `?view=kits` is the old history view: it opens Hand out with the history expanded.
 */
export function KitsTab({ go }: { go: (path: string) => void }) {
  const t = useT(adminTagsFlowMessages);
  const url = useUrlFilters({ view: "handout", kitRep: "", org: "" });
  // Separating Stuscle orders is the platform's: an owner follows their team's in Team purchases.
  const isAdmin = useIsSuperAdmin();
  const requestedView = distributionView(url.values.view);
  const view = requestedView === "orders" && !isAdmin ? "handout" : requestedView;
  const historyWanted = pastHandOutsOpen(url.values.view, url.values.kitRep, url.values.org);
  const orders = useAcquisitions();
  const pendingOrders = pendingOf(orders.data).length;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-distribution">
      {/* The screen's title is the frame's (top bar, phone title): not said a second time here. */}
      {view === "handout" ? <p className="min-w-0 text-sm text-white/50">{t("distributionIntro")}</p> : null}
      {requestedView === "orders" && !isAdmin ? <InlineAlert tone="info">{t("ordersNotYours")}</InlineAlert> : null}
      <Segmented<DistributionView>
        items={(Object.keys(VIEW_LABELS) as DistributionView[]).filter((id) => id !== "orders" || isAdmin).map((id) => ({ id, label: t(VIEW_LABELS[id]), count: id === "orders" ? pendingOrders : undefined }))}
        value={view}
        onChange={(next) => url.set({ view: next, ...(next !== "handout" ? { batch: null } : {}) } as never)}
        accent="tags"
        ariaLabel={t("distributionTitle")}
        className="max-w-2xl"
      />
      {view === "handout" && (
        <>
          <HandOutFlow />
          <PastHandOuts go={go} wantOpen={historyWanted} />
        </>
      )}
      {view === "orders" && isAdmin && <AcquisitionInbox />}
      {view === "returns" && <ReturnsStation />}
    </div>
  );
}
