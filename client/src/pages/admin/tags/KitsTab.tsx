import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Inbox, Network, PackageCheck, PackageOpen, Users } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagKitItem } from "@shared/tagsApi";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Textarea } from "@/components/xpot/Field";
import { Segmented } from "@/components/xpot/Segmented";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { hasTagsModule, useResellers } from "./batches-shared";
import { Loading, LoadError, organizationFilterOptions, useOrganizations } from "./pieces-shared";
import { useViewerAccess } from "@/lib/adminMode";
import { HandOutFlow, parseCodes } from "./kits-give-form";
import { KitList } from "./kits-list";
import { ReturnsStation } from "./returns-station";
import { CameraButton, CodeEntry, ContinuousCamera, feedback } from "./scan-station";
import { readCode } from "./batches-model";
import { PAST_HAND_OUTS_PREVIEW, addCodes, distributionView, pastHandOutsOpen, type DistributionView } from "./distribution-model";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { useToast } from "@/hooks/use-toast";

type AcquisitionInboxItem = {
  acquisition: {
    id: string;
    repId: number;
    source: string;
    externalRef: string | null;
    currency: string;
    status: string;
    purchasedAt: string;
  };
  repName: string | null;
  lines: Array<{
    id: string;
    externalSku: string | null;
    quantity: number;
    subtotalCents: number;
    fulfilledUnits: number;
  }>;
};

/** Wholesale orders (Stuscle) waiting for their physical pieces; shared by the inbox and its tab's count. */
function useAcquisitions() {
  return useQuery<AcquisitionInboxItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
}
const pendingOf = (list: AcquisitionInboxItem[] | undefined) => (list ?? []).filter((item) => item.acquisition.status === "pending");

function AcquisitionInbox() {
  const t = useT(manageTagsBatchesMessages);
  const tf = useT(adminTagsFlowMessages);
  const { toast } = useToast();
  const [codesById, setCodesById] = useState<Record<string, string>>({});
  // One camera at a time (it reads into the order it was opened on); a note for what the last read did not add.
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const query = useAcquisitions();
  const fulfill = useMutation({
    mutationFn: ({ id, codes }: { id: string; codes: string[] }) =>
      sendJson("POST", `/api/xpot/admin/tag-acquisitions/${id}/fulfill`, { codes }),
    onSuccess: async () => {
      toast({ title: t("acquisitionFulfilled") });
      await invalidateAdminTags();
    },
    onError: (err) => toast({ title: t("acquisitionFulfillFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const pending = pendingOf(query.data);

  /** Camera or hand-scanner reads join the order's list (the textarea stays the source of truth), once each; non-codes are refused. */
  const addReads = (id: string, reads: string[], fromCamera = false) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const raw of reads) {
      const code = readCode(raw, [window.location.hostname]);
      if (code) valid.push(code);
      else invalid.push(raw);
    }
    const text = codesById[id] ?? "";
    const result = addCodes(parseCodes(text).codes, valid);
    if (result.added.length) setCodesById((current) => ({ ...current, [id]: `${text}${text && !/\s$/.test(text) ? "\n" : ""}${result.added.join("\n")}` }));
    setNoteById((current) => ({ ...current, [id]: invalid.length ? t("notACode", { codes: invalid.slice(0, 6).join(", ") }) : result.repeated.length ? tf("alreadyOnList", { codes: result.repeated.slice(0, 6).join(", ") }) : "" }));
    if (invalid.length) feedback("error");
    else if (!result.added.length && (fromCamera || reads.length === 1)) feedback("warn");
    else if (result.added.length) feedback("ok");
  };

  if (query.isLoading) return <Loading rows={2} />;
  if (query.isError) return <LoadError compact what={t("acquisitionsLoadFailed")} error={query.error} onRetry={() => void query.refetch()} />;
  if (!pending.length) return <EmptyState compact dense tone="tags" icon={Inbox} title={t("noPendingAcquisitions")} cardStyle={{}} />;
  return (
    <div className="space-y-3" data-testid="admin-tags-stuscle-orders">
      {pending.map((item) => {
        const expected = item.lines.reduce((sum, line) => sum + line.quantity, 0);
        const total = item.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
        const parsed = parseCodes(codesById[item.acquisition.id] ?? "");
        const valid = parsed.invalid.length === 0 && parsed.codes.length === expected;
        return (
          <div key={item.acquisition.id} className={`rounded-2xl ${GLASS_CLASS} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{item.repName ?? `#${item.acquisition.repId}`}</p>
                <p className="mt-0.5 text-xs text-white/40">{item.acquisition.externalRef ?? item.acquisition.source} · {formatMoney(total, item.acquisition.currency)}</p>
              </div>
              <Pill tone="amber">{t.plural("acquisitionPiecesExpected", expected)}</Pill>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.lines.map((line) => <span key={line.id} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-white/55">{line.externalSku ?? t("catalogProduct")} · {line.quantity}</span>)}
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 basis-56">
                <CodeEntry onReads={(reads) => addReads(item.acquisition.id, reads)} autoFocus={false} testId={`stuscle-code-entry-${item.acquisition.id}`} />
              </div>
              <CameraButton on={cameraId === item.acquisition.id} onToggle={() => setCameraId((current) => (current === item.acquisition.id ? null : item.acquisition.id))} />
            </div>
            {cameraId === item.acquisition.id ? (
              <div className="mt-2"><ContinuousCamera onRead={(text) => addReads(item.acquisition.id, [text], true)} onClose={() => setCameraId(null)} /></div>
            ) : null}
            <Textarea value={codesById[item.acquisition.id] ?? ""}
              onChange={(event) => setCodesById((current) => ({ ...current, [item.acquisition.id]: event.target.value }))}
              rows={3} className="mt-2 font-mono" placeholder={t("acquisitionCodesPlaceholder")} aria-label={t("acquisitionCodesPlaceholder")} />
            {noteById[item.acquisition.id] ? <p className="mt-1.5 text-xs text-amber-300" role="status">{noteById[item.acquisition.id]}</p> : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-xs ${parsed.invalid.length ? "text-red-300" : "text-white/40"}`}>
                {parsed.invalid.length ? t("notACode", { codes: parsed.invalid.slice(0, 6).join(", ") }) : t("acquisitionCodesProgress", { count: parsed.codes.length, expected })}
              </p>
              <Button type="button" variant="brand" accent="tags" disabled={!valid || fulfill.isPending} loading={fulfill.isPending && fulfill.variables?.id === item.acquisition.id}
                onClick={() => fulfill.mutate({ id: item.acquisition.id, codes: parsed.codes })}>
                <PackageCheck className="h-4 w-4" /> {t("fulfillAcquisition")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const view = distributionView(url.values.view);
  const historyWanted = pastHandOutsOpen(url.values.view, url.values.kitRep, url.values.org);
  const orders = useAcquisitions();
  const pendingOrders = pendingOf(orders.data).length;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-tags-distribution">
      <div className="min-w-0 space-y-1">
        <h1 className="text-lg font-semibold text-white">{t("distributionTitle")}</h1>
        <p className="text-sm text-white/50">{t("distributionIntro")}</p>
      </div>
      <Segmented<DistributionView>
        items={(Object.keys(VIEW_LABELS) as DistributionView[]).map((id) => ({ id, label: t(VIEW_LABELS[id]), count: id === "orders" ? pendingOrders : undefined }))}
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
      {view === "orders" && <AcquisitionInbox />}
      {view === "returns" && <ReturnsStation />}
    </div>
  );
}
