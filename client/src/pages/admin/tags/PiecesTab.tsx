import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Boxes, Building2, CircleDot, Layers, Network, Nfc, Package, Plus, ScanLine, Users } from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { TAG_PRODUCT_TYPES, TAG_STATUSES, TAG_STOCK_STATUSES } from "@shared/tags";
import { countStockMetric, type TagStockMetric } from "@shared/tagMetrics";
import type { TagDetail, TagListItem } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { ADMIN_TAGS_KEY, errorMessage, getJson, invalidateAdminTags, sendJson, STALE_MS, withQuery } from "./api";
import { Loading, LoadError, organizationFilterOptions, useBatchOptions, useLeads, useOrganizations, useReps } from "./pieces-shared";
import { useViewerAccess } from "@/lib/adminMode";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { PieceTable } from "./piece-table";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

/** Pieces per server page; the next page loads as you reach the end. */
const PAGE = 100;

const METHOD_KEYS = [
  { value: "qr", key: "methodQr" },
  { value: "nfc", key: "methodNfc" },
] as const;

/**
 * Filters live in the URL (?status=…&stock=house…) so Overview links and the back button keep them. `status` is the
 * digital status (the link) and `stock` the physical piece, separately: nothing is added behind the user's back.
 */
const PIECE_FILTERS = { status: "", stock: "", product: "", rep: "", lead: "", batch: "", method: "", search: "", org: "" };
type Filters = Record<keyof typeof PIECE_FILTERS, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const posInt = (v: string | undefined) => (v && /^\d+$/.test(v) && Number(v) > 0 ? v : undefined);

/** Stock filter values that are a shared stock number (shared/tagMetrics.ts) rather than one stock status. */
const STOCK_METRIC_FILTERS: Record<string, TagStockMetric> = { house: "house", reps: "withResellers", sold: "sold" };

/** Translate the URL filters into the list endpoint's query (listQuerySchema), dropping junk. */
function listUrl(f: Filters, limit: number, offset: number): string {
  return withQuery("/api/xpot/tags", {
    status: f.status && (TAG_STATUSES as readonly string[]).includes(f.status) ? f.status : undefined,
    metric: STOCK_METRIC_FILTERS[f.stock],
    stockStatus: !STOCK_METRIC_FILTERS[f.stock] && (TAG_STOCK_STATUSES as readonly string[]).includes(f.stock) ? f.stock : undefined,
    productType: f.product && (TAG_PRODUCT_TYPES as readonly string[]).includes(f.product) ? f.product : undefined,
    house: f.rep === "house" ? "1" : undefined,
    repId: f.rep !== "house" ? posInt(f.rep) : undefined,
    leadId: posInt(f.lead),
    batchId: f.batch && UUID.test(f.batch) ? f.batch : undefined,
    method: f.method === "qr" || f.method === "nfc" ? f.method : undefined,
    // Platform management only: the server ignores it for anyone else.
    organizationId: posInt(f.org),
    search: f.search.trim().slice(0, 100),
    limit,
    offset: offset || undefined,
  });
}

function NewPieceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const t = useT(manageTagsPiecesMessages);
  const tc = useT(commonMessages);
  const ts = useT(shellMessages);
  const tg = useT(manageTagsMessages);
  const tb = useT(manageTagsBatchesMessages);
  const labels = useTagLabels();
  const [productType, setProductType] = useState("google_review_sign");
  const [face, setFace] = useState("");
  const [label, setLabel] = useState("");
  // Required: without a catalog product the piece could never be sold (server/tags/sales.ts).
  const [salesProductId, setSalesProductId] = useState("");
  const { data: catalog = [] } = useTagCatalog();
  const create = useMutation({
    mutationFn: () => sendJson<TagDetail>("POST", "/api/xpot/admin/tags", { productType, salesProductId: Number(salesProductId), face: face || null, label }),
    onSuccess: (tag) => {
      void invalidateAdminTags();
      onOpenChange(false);
      setLabel("");
      setFace("");
      toast({ title: t("pieceCreated", { code: tag.publicCode }), description: t("pieceCreatedHint") });
      onCreated(tag.id);
    },
    onError: (err) => toast({ title: t("createFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (productType && salesProductId && !create.isPending) create.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("newPieceTitle")}</DialogTitle>
            <DialogDescription>{t("newPieceDescription", { batches: ts("manageBatches") })}</DialogDescription>
          </DialogHeader>
          <Field label={t("productType")}>
            <Select value={productType} onChange={(e) => setProductType(e.target.value)} options={labels.productOptions} data-testid="new-piece-product" />
          </Field>
          <Field label={tb("fieldCatalogProduct")} hint={tb("catalogProductHint")}>
            <Select value={salesProductId} onChange={(e) => setSalesProductId(e.target.value)} placeholder={tb("chooseCatalogProduct")} options={catalogOptions(catalog)} data-testid="new-piece-catalog" />
          </Field>
          <Field label={tg("printedOnPiece")} id="new-piece-face">
            <div className="flex items-center gap-2">
              <TagFaceIcon face={face || (productType === "google_review_sign" ? "google_review" : null)} size="md" />
              <div className="min-w-0 flex-1">
                <Select id="new-piece-face" value={face} onChange={(e) => setFace(e.target.value)} placeholder={t("faceFromProductGoogle")} options={labels.faceOptions} data-testid="new-piece-face" />
              </div>
            </div>
          </Field>
          <Field label={t("internalLabelOptional")}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} data-testid="new-piece-label" />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
            <Button type="submit" variant="brand" accent="tags" disabled={!productType || !salesProductId} loading={create.isPending} data-testid="new-piece-create">{t("createPiece")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PiecesTab({ go }: { go: (path: string) => void }) {
  const tm = useT(manageTagsPiecesMessages);
  const tt = useT(tagsMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  const urlFilters = useUrlFilters(PIECE_FILTERS);
  const filters = urlFilters.values;
  const set = urlFilters.set;
  const [creating, setCreating] = useState(false);
  // A piece outside a batch is production, the global admin's (POST /api/xpot/admin/tags is admin-only).
  const isAdmin = useIsSuperAdmin();
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();
  // The organization filter is platform management's (?org=, also the Organizations page's "See all in Inventory").
  const { canManage } = useViewerAccess();
  const { data: organizations = [] } = useOrganizations(canManage);

  const pieces = useOffsetPages<TagListItem>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", listUrl(filters, PAGE, 0)],
    url: (offset, limit) => listUrl(filters, limit, offset),
    pageSize: PAGE,
    staleTime: STALE_MS,
    fetchPage: (pageUrl) => getJson<TagListItem[]>(pageUrl),
  });
  const { items: tags, isLoading, error, refetch } = pieces;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tags) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }, [tags]);
  // Of the loaded pieces, the company stock as Overview counts it.
  const houseCount = useMemo(() => countStockMetric(tags, "house"), [tags]);
  const hasFilters = urlFilters.activeCount() > 0;

  const repOptions = [{ value: "house", label: tm("houseStockNoReseller") }, ...reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))];
  // A rep/lead/batch in the URL that isn't in the pickers (e.g. still loading) still shows as selected.
  if (filters.rep && !repOptions.some((o) => o.value === filters.rep)) repOptions.push({ value: filters.rep, label: tm("resellerNumber", { id: filters.rep }) });
  const leadOptions = leads.map((l) => ({ value: String(l.id), label: l.name }));
  if (filters.lead && !leadOptions.some((o) => o.value === filters.lead)) leadOptions.push({ value: filters.lead, label: tm("customerNumber", { id: filters.lead }) });
  const batchOptions = batches.map((b) => ({ value: b.id, label: b.batchCode }));
  if (filters.batch && !batchOptions.some((o) => o.value === filters.batch)) batchOptions.push({ value: filters.batch, label: tm("selectedBatch") });
  const methodOptions = METHOD_KEYS.map((m) => ({ value: m.value, label: tm(m.key) }));
  const orgOptions = organizationFilterOptions(organizations, filters.org, (id) => tg("organizationNumber", { id }));

  return (
    <div className="space-y-4" data-testid="admin-tags-pieces">
      <FilterBar
        testId="admin-pieces-filters"
        search={<FilterSearch value={filters.search} onChange={(search) => set({ search })} placeholder={tm("searchPlaceholder")} debounceMs={350} testId="admin-pieces-search" />}
        actions={
          isAdmin ? (
            <Button type="button" variant="brand" accent="tags" className="min-h-10" onClick={() => setCreating(true)} data-testid="admin-pieces-new">
              <Plus className="h-4 w-4" />{tm("newPiece")}
            </Button>
          ) : undefined
        }
        controls={
          <>
            <FilterSelect value={filters.status} onChange={(status) => set({ status })} placeholder={tm("allStatuses")} options={labels.statusOptions} icon={CircleDot} testId="admin-pieces-status" />
            <FilterSelect value={filters.stock} onChange={(stock) => set({ stock })} placeholder={tm("allStock")} options={labels.stockOptions} icon={Boxes} testId="admin-pieces-stock" />
            <FilterSelect value={filters.product} onChange={(product) => set({ product })} placeholder={tm("allProducts")} options={labels.productOptions} icon={Package} />
            <FilterSelect value={filters.rep} onChange={(rep) => set({ rep })} placeholder={tg("allResellers")} options={repOptions} icon={Users} testId="admin-pieces-rep" />
            <FilterSelect value={filters.lead} onChange={(lead) => set({ lead })} placeholder={tm("allCustomers")} options={leadOptions} icon={Building2} />
            <FilterSelect value={filters.batch} onChange={(batch) => set({ batch })} placeholder={tm("allBatches")} options={batchOptions} icon={Layers} />
            <FilterSelect value={filters.method} onChange={(method) => set({ method })} placeholder={tm("anyMethod")} options={methodOptions} icon={ScanLine} />
            {canManage ? (
              <FilterSelect value={filters.org} onChange={(org) => set({ org })} placeholder={tg("allOrganizations")} options={orgOptions} icon={Network} testId="admin-pieces-org" />
            ) : null}
          </>
        }
        summary={{ shown: tags.length, active: hasFilters, onClear: () => urlFilters.reset() }}
      />

      {isLoading ? (
        <Loading rows={6} />
      ) : error ? (
        <LoadError what={tm("whatPieces")} error={error} onRetry={() => void refetch()} />
      ) : tags.length === 0 ? (
        <EmptyState tone="tags" icon={Nfc} title={hasFilters ? tm("noMatch") : tm("noPiecesYet")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50" data-testid="admin-pieces-counts">
            <span className="font-semibold text-white/80">
              {tt.plural("pieces", tags.length, pieces.hasMore ? { count: `${tags.length}+` } : undefined)}
            </span>
            {TAG_STATUSES.filter((s) => statusCounts[s]).map((s) => (
              <span key={s} className="tabular-nums">
                {tm("statusCount", { label: labels.status(s), count: statusCounts[s] })}
              </span>
            ))}
            <span className="tabular-nums">{tm("inHouse", { count: houseCount })}</span>
          </div>
          <PieceTable
            pieces={tags}
            onOpen={(id) => go(`/pieces/${id}`)}
            columns={["customer", "destination", "reseller", "chip", "scans", "lastInteraction", "batch"]}
            testId="admin-pieces-table"
          />
          <ListPager shown={tags.length} hasMore={pieces.hasMore} onMore={pieces.loadMore} loading={pieces.loadingMore} pageSize={PAGE} />
        </>
      )}

      {isAdmin ? <NewPieceDialog open={creating} onOpenChange={setCreating} onCreated={(id) => go(`/pieces/${id}`)} /> : null}
    </div>
  );
}
