import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { CHIP_STATUS_TONE, Pill } from "@/components/xpot/StatusPill";
import { Building2, CircleDot, Layers, Package, Plus, ScanLine, Users } from "lucide-react";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ListPager, useOffsetPages } from "@/components/xpot/pagination";
import { TAG_PRODUCT_TYPES, TAG_STATUSES } from "@shared/tags";
import type { TagDetail, TagListItem } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS, withQuery } from "./api";
import { BTN, BTN_GHOST, CARD, Empty, INPUT, PieceStatusPill, TD, TH } from "./ui";
import { Loading, LoadError, Select, useBatchOptions, useLeads, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";

/** Pieces per server page; the next page loads as you reach the end. */
const PAGE = 100;

const METHOD_KEYS = [
  { value: "qr", key: "methodQr" },
  { value: "nfc", key: "methodNfc" },
] as const;

/** Filters live in the URL (?status=…&rep=house…) so Overview links and the back button keep them. */
const PIECE_FILTERS = { status: "", product: "", rep: "", lead: "", batch: "", method: "", search: "" };
type Filters = Record<keyof typeof PIECE_FILTERS, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const posInt = (v: string | undefined) => (v && /^\d+$/.test(v) && Number(v) > 0 ? v : undefined);

/** Translate the URL filters into the list endpoint's query (listQuerySchema), dropping junk. */
function listUrl(f: Filters, limit: number, offset: number): string {
  return withQuery("/api/xpot/tags", {
    status: f.status && (TAG_STATUSES as readonly string[]).includes(f.status) ? f.status : undefined,
    stockStatus: f.status === "damaged" ? "damaged" : f.status === "inventory" ? "available" : undefined,
    productType: f.product && (TAG_PRODUCT_TYPES as readonly string[]).includes(f.product) ? f.product : undefined,
    house: f.rep === "house" ? "1" : undefined,
    repId: f.rep !== "house" ? posInt(f.rep) : undefined,
    leadId: posInt(f.lead),
    batchId: f.batch && UUID.test(f.batch) ? f.batch : undefined,
    method: f.method === "qr" || f.method === "nfc" ? f.method : undefined,
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
  const labels = useTagLabels();
  const [productType, setProductType] = useState<string | undefined>("google_review_sign");
  const [face, setFace] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState("");
  const create = useMutation({
    mutationFn: () => sendJson<TagDetail>("POST", "/api/xpot/admin/tags", { productType, face: face ?? null, label }),
    onSuccess: (tag) => {
      void invalidateAdminTags();
      onOpenChange(false);
      setLabel("");
      setFace(undefined);
      toast({ title: t("pieceCreated", { code: tag.publicCode }), description: t("pieceCreatedHint") });
      onCreated(tag.id);
    },
    onError: (err) => toast({ title: t("createFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (productType && !create.isPending) create.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0d1326] text-white">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("newPieceTitle")}</DialogTitle>
            <DialogDescription className="text-white/50">{t("newPieceDescription", { batches: ts("manageBatches") })}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">{t("productType")}</span>
            <Select value={productType} onChange={setProductType} placeholder={t("choose")} options={labels.productOptions} allowEmpty={false} testId="new-piece-product" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">{tg("printedOnPiece")}</span>
            <div className="flex items-center gap-2">
              <TagFaceIcon face={face ?? (productType === "google_review_sign" ? "google_review" : null)} size="md" />
              <Select value={face} onChange={setFace} placeholder={t("faceFromProductGoogle")} options={labels.faceOptions} testId="new-piece-face" />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">{t("internalLabelOptional")}</span>
            <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} data-testid="new-piece-label" />
          </label>
          <DialogFooter className="gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>{tc("cancel")}</button>
            <button type="submit" className={BTN} disabled={!productType || create.isPending} data-testid="new-piece-create">{t("createPiece")}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChipStatusPill({ status, label }: { status: string; label: string }) {
  return <Pill tone={CHIP_STATUS_TONE[status] ?? "slate"}>{label}</Pill>;
}

function PiecesTable({ tags, onOpen }: { tags: TagListItem[]; onOpen: (id: string) => void }) {
  const tm = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  return (
    <>
      {/* Phones: tappable cards */}
      <ul className="space-y-2 md:hidden">
        {tags.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t.id)} className={`${CARD} w-full p-3 text-left active:bg-white/[0.06]`} data-testid={`admin-piece-card-${t.publicCode}`}>
              <div className="flex items-center justify-between gap-2">
                <TagPieceMention
                  publicCode={t.publicCode}
                  productType={t.productType}
                  face={t.face}
                  batchCode={t.batchCode}
                  customer={t.leadName}
                  className="min-w-0 flex-1"
                />
                <PieceStatusPill status={t.status} stockStatus={t.stockStatus} />
              </div>
              <div className="mt-2 truncate text-xs text-white/50">
                {[t.repName ?? tm("houseStock"), t.batchCode].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-white/40">
                {tm("cardStats", { qr: t.qrInteractions, nfc: t.nfcInteractions, chip: labels.chip(t.nfcStatus), last: formatDateTime(t.lastInteractionAt) })}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className={`${CARD} hidden overflow-x-auto md:block`}>
        <table className="w-full min-w-[960px]">
          <thead className="border-b border-white/10">
            <tr>
              <th className={TH}>{tg("colCode")}</th>
              <th className={`${TH} text-center`}>{tg("colStatus")}</th>
              <th className={TH}>{tg("colCustomer")}</th>
              <th className={TH}>{tg("colReseller")}</th>
              <th className={TH}>{tm("colDestination")}</th>
              <th className={TH}>{tm("colChip")}</th>
              <th className={`${TH} text-right`}>QR</th>
              <th className={`${TH} text-right`}>NFC</th>
              <th className={TH}>{tm("colLastInteraction")}</th>
              <th className={TH}>{tg("colBatch")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tags.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-white/[0.04]" onClick={() => onOpen(t.id)} data-testid={`admin-piece-row-${t.publicCode}`}>
                <td className={`${TD} max-w-[260px]`}>
                  <TagPieceMention
                    publicCode={t.publicCode}
                    productType={t.productType}
                    face={t.face}
                    batchCode={t.batchCode}
                    details={[t.serialNumber ? `#${t.serialNumber}` : null, t.label].filter(Boolean).join(" · ") || undefined}
                    className="max-w-full"
                  />
                </td>
                <td className={`${TD} text-center`}><PieceStatusPill status={t.status} stockStatus={t.stockStatus} /></td>
                <td className={`${TD} max-w-[180px] truncate`}>{t.leadName ?? <span className="text-white/30">—</span>}</td>
                <td className={`${TD} max-w-[160px] truncate`}>{t.repName ?? <span className="text-white/40">{tg("house")}</span>}</td>
                <td className={TD}>{labels.destination(t.destinationType)}</td>
                <td className={TD}><ChipStatusPill status={t.nfcStatus} label={labels.chip(t.nfcStatus)} /></td>
                <td className={`${TD} text-right tabular-nums`}>{t.qrInteractions}</td>
                <td className={`${TD} text-right tabular-nums`}>{t.nfcInteractions}</td>
                <td className={`${TD} whitespace-nowrap text-xs`}>{formatDateTime(t.lastInteractionAt)}</td>
                <td className={`${TD} font-mono text-xs`}>{t.batchCode ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();

  const pieces = useOffsetPages<TagListItem>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", listUrl(filters, PAGE, 0)],
    url: (offset, limit) => listUrl(filters, limit, offset),
    pageSize: PAGE,
    staleTime: STALE_MS,
    fetchPage: (pageUrl) => getJson<TagListItem[]>(pageUrl),
  });
  const { items: tags, isLoading, error } = pieces;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tags) {
      const status = t.stockStatus === "damaged" ? "damaged" : t.status;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [tags]);
  const houseCount = useMemo(() => tags.filter((t) => t.repId === null).length, [tags]);
  const hasFilters = urlFilters.activeCount() > 0;

  const repOptions = [{ value: "house", label: tm("houseStockNoReseller") }, ...reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))];
  // A rep/lead/batch in the URL that isn't in the pickers (e.g. still loading) still shows as selected.
  if (filters.rep && !repOptions.some((o) => o.value === filters.rep)) repOptions.push({ value: filters.rep, label: tm("resellerNumber", { id: filters.rep }) });
  const leadOptions = leads.map((l) => ({ value: String(l.id), label: l.name }));
  if (filters.lead && !leadOptions.some((o) => o.value === filters.lead)) leadOptions.push({ value: filters.lead, label: tm("customerNumber", { id: filters.lead }) });
  const batchOptions = batches.map((b) => ({ value: b.id, label: b.batchCode }));
  if (filters.batch && !batchOptions.some((o) => o.value === filters.batch)) batchOptions.push({ value: filters.batch, label: tm("selectedBatch") });
  const methodOptions = METHOD_KEYS.map((m) => ({ value: m.value, label: tm(m.key) }));

  return (
    <div className="space-y-4" data-testid="admin-tags-pieces">
      <FilterBar
        testId="admin-pieces-filters"
        search={<FilterSearch value={filters.search} onChange={(search) => set({ search })} placeholder={tm("searchPlaceholder")} debounceMs={350} testId="admin-pieces-search" />}
        actions={
          <button type="button" className={`${BTN} h-10 rounded-xl`} onClick={() => setCreating(true)} data-testid="admin-pieces-new">
            <Plus className="h-4 w-4" />{tm("newPiece")}
          </button>
        }
        controls={
          <>
            <FilterSelect value={filters.status} onChange={(status) => set({ status })} placeholder={tm("allStatuses")} options={labels.statusOptions} icon={CircleDot} testId="admin-pieces-status" />
            <FilterSelect value={filters.product} onChange={(product) => set({ product })} placeholder={tm("allProducts")} options={labels.productOptions} icon={Package} />
            <FilterSelect value={filters.rep} onChange={(rep) => set({ rep })} placeholder={tg("allResellers")} options={repOptions} icon={Users} testId="admin-pieces-rep" />
            <FilterSelect value={filters.lead} onChange={(lead) => set({ lead })} placeholder={tm("allCustomers")} options={leadOptions} icon={Building2} />
            <FilterSelect value={filters.batch} onChange={(batch) => set({ batch })} placeholder={tm("allBatches")} options={batchOptions} icon={Layers} />
            <FilterSelect value={filters.method} onChange={(method) => set({ method })} placeholder={tm("anyMethod")} options={methodOptions} icon={ScanLine} />
          </>
        }
        summary={{ shown: tags.length, active: hasFilters, onClear: () => urlFilters.reset() }}
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <LoadError what={tm("whatPieces")} error={error} />
      ) : tags.length === 0 ? (
        <Empty>{hasFilters ? tm("noMatch") : tm("noPiecesYet")}</Empty>
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
          <PiecesTable tags={tags} onOpen={(id) => go(`/pieces/${id}`)} />
          <ListPager shown={tags.length} hasMore={pieces.hasMore} onMore={pieces.loadMore} loading={pieces.loadingMore} pageSize={PAGE} />
        </>
      )}

      <NewPieceDialog open={creating} onOpenChange={setCreating} onCreated={(id) => go(`/pieces/${id}`)} />
    </div>
  );
}
