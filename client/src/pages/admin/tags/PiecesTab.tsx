import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Layers, MapPin, Network, Nfc, Package, Plus, SlidersHorizontal, Users } from "lucide-react";
import { FilterBar, FilterChips, FilterSearch, FilterSelect, FilterToggle } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { TAG_PRODUCT_TYPES } from "@shared/tags";
import { parseTagIntakeScan } from "@shared/tagIntake";
import type { TagDetail, TagListItem, TagOverview } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { ADMIN_TAGS_KEY, errorMessage, getJson, invalidateAdminTags, sendJson, STALE_MS, withQuery } from "./api";
import { Loading, LoadError, organizationFilterOptions, uniqueOptions, useBatchOptions, useLeads, useOrganizations, useReps } from "./pieces-shared";
import { useViewerAccess } from "@/lib/adminMode";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { PieceTable, type PieceColumn } from "./piece-table";
import { PieceDetail } from "./PieceDetail";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { useTagLabels } from "./labels";
import { WHERE_CHIPS, whereQuery, whereSelection, type WhereChip } from "./where-model";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";

/** Pieces per server page; the next page loads as you reach the end. */
const PAGE = 100;

// Batch is in the piece and in the batch filter; the stock list keeps what a person asks of a piece: whose, with whom, chip, scans.
const ALL_COLUMNS: readonly PieceColumn[] = ["customer", "reseller", "chip", "scans"];

/** Whether a piece is open in the pane now (the next open replaces it in history). */
const current = () => new URLSearchParams(window.location.search).has("piece");

/**
 * Filters live in the URL (?where=house&product=…) so Overview links and the back button keep them. `where` is the one
 * "where is it" answer (where-model.ts); `status` and `stock` are the old two-filter URLs, still honoured.
 */
const PIECE_FILTERS = { where: "", status: "", stock: "", product: "", rep: "", lead: "", batch: "", method: "", search: "", org: "" };
type Filters = Record<keyof typeof PIECE_FILTERS, string>;
/** The filters behind "More filters" (`method` has no control any more; an old ?method= link still filters). */
const MORE_FILTERS = ["org", "rep", "lead", "batch"] as const;
/** Everything that narrows the list besides the status: a chip count is a whole-stock number, so it hides under any of these. */
const NARROWING = ["product", "rep", "lead", "batch", "method", "search", "org"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const posInt = (v: string | undefined) => (v && /^\d+$/.test(v) && Number(v) > 0 ? v : undefined);

/**
 * The stock list leaves out the pieces not in stock yet until someone asks for them (the "Not in stock yet" chip, a
 * status, or a search or batch, which find any piece). They are most of a new system's rows and nobody's shelf.
 */
export const hidesNotInStock = (f: Pick<Filters, "where" | "status" | "stock" | "search" | "batch">): boolean =>
  !f.where && !f.status && !f.stock && !f.search.trim() && !f.batch;

/** Translate the URL filters into the list endpoint's query (listQuerySchema), dropping junk. */
function listUrl(f: Filters, limit: number, offset: number): string {
  return withQuery("/api/xpot/tags", {
    ...whereQuery(f),
    hidePending: hidesNotInStock(f) ? "1" : undefined,
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
          <Field label={t("newPieceProduct")} hint={t("newPieceProductHint")}>
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
  const tc = useT(commonMessages);
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
  // On a computer a piece opens in a pop-up over the list (?piece=<id>, so the link is shareable); its own page,
  // /admin/tags/pieces/:id, stays for phones and "Open full page". Moving between pieces and closing
  // replace history; only the first open pushes.
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const paneId = params.get("piece") || null;
  const setPane = useCallback(
    (id: string | null) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (id) next.set("piece", id);
        else next.delete("piece");
        return next;
      }, { replace: !id || current() }),
    [setParams],
  );
  const openPiece = (id: string) => (isDesktop ? setPane(id) : go(`/pieces/${id}`));
  // The one search box also takes a piece's code or what its QR / chip holds (a scanned link): Enter opens that piece.
  const openByCode = async (typed: string): Promise<boolean> => {
    const scan = parseTagIntakeScan(typed, [window.location.hostname]);
    if (!scan.ok) return false;
    try {
      const { id } = await getJson<{ id: string }>(`/api/xpot/tags/lookup/${scan.publicCode}`);
      // The code did its job: the list behind the pop-up is the list again, not one row.
      if (!isDesktop) go(`/pieces/${id}`);
      else {
        setParams((now) => {
          const next = new URLSearchParams(now);
          next.delete("search");
          next.set("piece", id);
          return next;
        }, { replace: current() });
      }
      return true;
    } catch {
      // Not a piece we know: the list below already shows that nothing matches.
      return false;
    }
  };
  const closePiece = useCallback(() => setPane(null), [setPane]);

  const pieces = useOffsetPages<TagListItem>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", listUrl(filters, PAGE, 0)],
    url: (offset, limit) => listUrl(filters, limit, offset),
    pageSize: PAGE,
    staleTime: STALE_MS,
    fetchPage: (pageUrl) => getJson<TagListItem[]>(pageUrl),
  });
  const { items: tags, isLoading, error, refetch } = pieces;

  // The stock summary's totals: the same query as Overview (shared cache), so a chip reads what Overview counts and
  // not the loaded page. A fleet-wide number, so it is left out while one organization is picked.
  const { data: overview } = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "overview"],
    queryFn: () => getJson(`/api/xpot/admin/tags/overview?timezoneOffset=${new Date().getTimezoneOffset()}`),
    staleTime: STALE_MS,
  });
  const hasFilters = urlFilters.activeCount() > 0;
  const where = whereSelection(filters);
  // A chip counts the whole stock: under another filter it would say one thing while the list shows another.
  const narrowed = urlFilters.activeCount([...NARROWING]) > 0;
  const chipCount = (id: WhereChip) => (narrowed ? undefined : overview?.funnel[id]);
  const hidingPending = hidesNotInStock(filters);
  // How many pieces the list holds: counted by the server when nothing narrows it, else what has loaded (unknown while more are coming).
  const total = !pieces.hasMore ? tags.length : !narrowed && overview ? (hidingPending ? overview.counts.total - overview.funnel.notReceived : where === "" ? overview.counts.total : undefined) : undefined;
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  useLayoutEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    // Below the top bar, which is fixed from lg up (h-16).
    const measure = () => setStickyHeight(el.offsetHeight + (window.matchMedia("(min-width: 1024px)").matches ? 64 : 0));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // "More filters" opens by itself whenever one of them narrows the list (a link, the back button), so it never hides one.
  const moreActive = urlFilters.activeCount([...MORE_FILTERS]);
  const [moreOpen, setMoreOpen] = useState(moreActive > 0);
  useEffect(() => {
    if (moreActive > 0) setMoreOpen(true);
  }, [moreActive]);

  const repOptions = uniqueOptions([{ value: "house", label: tm("noReseller") }, ...reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))]);
  // A rep/lead/batch in the URL that isn't in the pickers (e.g. still loading) still shows as selected.
  if (filters.rep && !repOptions.some((o) => o.value === filters.rep)) repOptions.push({ value: filters.rep, label: tm("resellerNumber", { id: filters.rep }) });
  const leadOptions = uniqueOptions(leads.map((l) => ({ value: String(l.id), label: l.name })));
  if (filters.lead && !leadOptions.some((o) => o.value === filters.lead)) leadOptions.push({ value: filters.lead, label: tm("customerNumber", { id: filters.lead }) });
  const batchOptions = uniqueOptions(batches.map((b) => ({ value: b.id, label: b.batchCode })));
  if (filters.batch && !batchOptions.some((o) => o.value === filters.batch)) batchOptions.push({ value: filters.batch, label: tm("selectedBatch") });
  // An old ?status= / ?stock= value with no bucket of its own (e.g. "Set up, not live") still shows as chosen.
  const whereOptions = [...labels.whereOptions];
  if (where && !whereOptions.some((o) => o.value === where)) {
    const [kind, raw] = where.split(":");
    whereOptions.push({ value: where, label: kind === "status" ? labels.status(raw) : labels.stock(raw) });
  }
  const orgOptions = organizationFilterOptions(organizations, filters.org, (id) => tg("organizationNumber", { id }));

  // A phone has no pane: a shared ?piece= link shows the piece's page.
  if (!isDesktop && paneId) return <PieceDetail id={paneId} go={go} />;

  const list = isLoading ? (
    <Loading rows={6} />
  ) : error ? (
    <LoadError what={tm("whatPieces")} error={error} onRetry={() => void refetch()} />
  ) : tags.length === 0 ? (
    <EmptyState
      tone="tags"
      icon={Nfc}
      title={!hasFilters ? tm("noPiecesYet") : WHERE_CHIPS.some((id) => id === where) && !narrowed ? tm(`emptyWhere_${where}` as "emptyWhere_house") : tm("noMatch")}
      action={hasFilters ? <Button type="button" variant="secondary" onClick={() => urlFilters.reset()} data-testid="admin-pieces-see-all">{tm("seeAllPieces")}</Button> : undefined}
    />
  ) : (
    <>
      <PieceTable
        pieces={tags}
        onOpen={openPiece}
        columns={ALL_COLUMNS}
        selectedId={paneId}
        testId="admin-pieces-table"
        headTop={isDesktop ? stickyHeight : undefined}
      />
      <ListPager shown={tags.length} hasMore={pieces.hasMore} onMore={pieces.loadMore} loading={pieces.loadingMore} pageSize={PAGE} />
    </>
  );

  return (
    <div className="space-y-4" data-testid="admin-tags-pieces">
      {/* On a computer the chips and the filters stay in view while the list scrolls. */}
      <div ref={stickyRef} className="space-y-3 md:sticky md:top-0 md:z-20 md:-mx-1 md:bg-[#05080f]/90 md:px-1 md:pb-3 md:pt-1 md:backdrop-blur-md lg:top-16" data-testid="admin-pieces-sticky">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FilterChips<WhereChip | "">
          ariaLabel={tg("stockSummary")}
          accent="tags"
          value={WHERE_CHIPS.find((id) => id === where) ?? ""}
          onChange={(id) => set({ where: id === where ? "" : id, status: "", stock: "" })}
          items={WHERE_CHIPS.map((id) => ({ id, label: labels.where(id), count: chipCount(id), testId: `admin-pieces-chip-${id}` }))}
        />
        {total !== undefined && !isLoading && !error ? <span className="text-sm tabular-nums text-white/55" data-testid="admin-pieces-total">{tm.plural("totalPieces", total)}</span> : null}
      </div>
      <FilterBar
        testId="admin-pieces-filters"
        search={<FilterSearch value={filters.search} onChange={(search) => set({ search })} onEnter={openByCode} placeholder={tm("searchPlaceholder")} debounceMs={350} testId="admin-pieces-search" />}
        actions={
          isAdmin ? (
            // Quiet on purpose: a loose piece outside any production is the exception, not the way to add stock.
            <Button type="button" variant="ghost" className="min-h-10" onClick={() => setCreating(true)} data-testid="admin-pieces-new">
              <Plus className="h-4 w-4" />{tm("newPiece")}
            </Button>
          ) : undefined
        }
        controls={
          <>
            <FilterSelect value={where} onChange={(next) => set({ where: next, status: "", stock: "" })} placeholder={tg("allWhere")} options={whereOptions} icon={MapPin} testId="admin-pieces-where" />
            <FilterSelect value={filters.product} onChange={(product) => set({ product })} placeholder={tm("allProducts")} options={labels.productOptions} icon={Package} />
            <FilterToggle pressed={moreOpen} onChange={setMoreOpen} icon={SlidersHorizontal} label={moreActive ? tg("moreFiltersCount", { count: moreActive }) : tg("moreFilters")} testId="admin-pieces-more" />
          </>
        }
        secondary={
          moreOpen ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="admin-pieces-more-filters">
              {canManage ? (
                <FilterSelect value={filters.org} onChange={(org) => set({ org })} placeholder={tg("allOrganizations")} options={orgOptions} icon={Network} testId="admin-pieces-org" />
              ) : null}
              <FilterSelect value={filters.rep} onChange={(rep) => set({ rep })} placeholder={tg("allResellers")} options={repOptions} icon={Users} testId="admin-pieces-rep" />
              <FilterSelect value={filters.lead} onChange={(lead) => set({ lead })} placeholder={tm("allCustomers")} options={leadOptions} icon={Building2} />
              <FilterSelect value={filters.batch} onChange={(batch) => set({ batch })} placeholder={tm("allBatches")} options={batchOptions} icon={Layers} />
            </div>
          ) : undefined
        }
        summary={{ shown: pieces.hasMore ? undefined : tags.length, active: hasFilters, onClear: () => urlFilters.reset() }}
      />
      </div>

      {isDesktop ? (
        // The pop-up stays mounted whatever the list shows (loading, empty, error).
        <MasterDetail
          popup
          closeLabel={tc("close")}
          onClose={closePiece}
          list={list}
          detail={paneId ? <PieceDetail key={paneId} id={paneId} go={go} onClose={closePiece} /> : null}
        />
      ) : (
        list
      )}

      {isAdmin ? <NewPieceDialog open={creating} onOpenChange={setCreating} onCreated={openPiece} /> : null}
    </div>
  );
}
