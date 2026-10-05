import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { Plus, Search, X } from "lucide-react";
import { TAG_STATUSES } from "@shared/tags";
import type { TagDetail, TagListItem } from "@shared/tagsApi";
import { tagFaceLabel } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS, withQuery } from "./api";
import { BTN, BTN_GHOST, CARD, Empty, INPUT, StatusPill, TD, TH } from "./ui";
import {
  destinationLabel,
  FACE_OPTIONS,
  Loading,
  LoadError,
  NFC_LABELS,
  PRODUCT_OPTIONS,
  productLabel,
  repOptionLabel,
  Select,
  STATUS_OPTIONS,
  useBatchOptions,
  useLeads,
  useReps,
} from "./pieces-shared";

const LIST_LIMIT = 500;

const METHOD_OPTIONS = [
  { value: "qr", label: "Has QR scans" },
  { value: "nfc", label: "Has NFC taps" },
];

/** Filters live in the URL (?status=…&rep=house…) so Overview links and the back button keep them. */
const FILTER_KEYS = ["status", "product", "rep", "lead", "batch", "method", "search"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Partial<Record<FilterKey, string>>;

function filtersFrom(params: URLSearchParams): Filters {
  const out: Filters = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const posInt = (v: string | undefined) => (v && /^\d+$/.test(v) && Number(v) > 0 ? v : undefined);

/** Translate the URL filters into the list endpoint's query (listQuerySchema), dropping junk. */
function listUrl(f: Filters): string {
  return withQuery("/api/xpot/tags", {
    status: f.status && (TAG_STATUSES as readonly string[]).includes(f.status) ? f.status : undefined,
    productType: PRODUCT_OPTIONS.some((o) => o.value === f.product) ? f.product : undefined,
    house: f.rep === "house" ? "1" : undefined,
    repId: f.rep !== "house" ? posInt(f.rep) : undefined,
    leadId: posInt(f.lead),
    batchId: f.batch && UUID.test(f.batch) ? f.batch : undefined,
    method: f.method === "qr" || f.method === "nfc" ? f.method : undefined,
    search: f.search?.slice(0, 100),
    limit: LIST_LIMIT,
  });
}

function NewPieceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
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
      toast({ title: `Piece ${tag.publicCode} created`, description: "It is in house stock." });
      onCreated(tag.id);
    },
    onError: (err) => toast({ title: "Could not create the piece", description: errorMessage(err), variant: "destructive" }),
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
            <DialogTitle>New single piece</DialogTitle>
            <DialogDescription className="text-white/50">For one-off pieces. Production runs go through Batches.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">Product type</span>
            <Select value={productType} onChange={setProductType} placeholder="Choose…" options={PRODUCT_OPTIONS} allowEmpty={false} testId="new-piece-product" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">Printed on the piece</span>
            <div className="flex items-center gap-2">
              <TagFaceIcon face={face ?? (productType === "google_review_sign" ? "google_review" : null)} size="md" />
              <Select value={face} onChange={setFace} placeholder="From the product (Google sign: Google)" options={FACE_OPTIONS} testId="new-piece-face" />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/60">Internal label (optional)</span>
            <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} data-testid="new-piece-label" />
          </label>
          <DialogFooter className="gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className={BTN} disabled={!productType || create.isPending} data-testid="new-piece-create">Create piece</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function chipTone(status: string): string {
  if (status === "failed") return "text-red-400";
  if (status === "verified" || status === "locked") return "text-emerald-400";
  if (status === "programmed") return "text-amber-300";
  return "text-white/30";
}

function PiecesTable({ tags, onOpen }: { tags: TagListItem[]; onOpen: (id: string) => void }) {
  return (
    <>
      {/* Phones: tappable cards */}
      <ul className="space-y-2 md:hidden">
        {tags.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t.id)} className={`${CARD} w-full p-3 text-left active:bg-white/[0.06]`} data-testid={`admin-piece-card-${t.publicCode}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TagFaceIcon face={t.face} size="sm" />
                  <span className="font-mono font-semibold text-white">{t.publicCode}</span>
                </span>
                <StatusPill status={t.status} />
              </div>
              <div className="mt-1 text-xs text-white/50">
                {productLabel(t.productType)}
                {t.face ? ` · ${tagFaceLabel(t.face)}` : ""}
                {t.leadName ? ` · ${t.leadName}` : ""}
                {` · ${t.repName ?? "House stock"}`}
                {t.batchCode ? ` · ${t.batchCode}` : ""}
              </div>
              <div className="mt-1 text-xs tabular-nums text-white/40">
                QR {t.qrInteractions} · NFC {t.nfcInteractions} · chip {NFC_LABELS[t.nfcStatus] ?? t.nfcStatus} · last {formatDateTime(t.lastInteractionAt)}
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
              <th className={`${TH} w-12 pr-0`}><span className="sr-only">Printed on the piece</span></th>
              <th className={TH}>Code</th>
              <th className={TH}>Product</th>
              <th className={TH}>Status</th>
              <th className={TH}>Customer</th>
              <th className={TH}>Reseller</th>
              <th className={TH}>Destination</th>
              <th className={TH}>Chip</th>
              <th className={`${TH} text-right`}>QR</th>
              <th className={`${TH} text-right`}>NFC</th>
              <th className={TH}>Last interaction</th>
              <th className={TH}>Batch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tags.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-white/[0.04]" onClick={() => onOpen(t.id)} data-testid={`admin-piece-row-${t.publicCode}`}>
                <td className={`${TD} pr-0`}><TagFaceIcon face={t.face} size="md" /></td>
                <td className={`${TD} whitespace-nowrap font-mono font-semibold text-white`}>
                  {t.publicCode}
                  {t.serialNumber ? <span className="ml-1 font-sans text-xs font-normal text-white/40">#{t.serialNumber}</span> : null}
                  {t.label ? <span className="block max-w-[160px] truncate font-sans text-xs font-normal text-white/40">{t.label}</span> : null}
                </td>
                <td className={TD}>
                  {productLabel(t.productType)}
                  {t.face ? <span className="block text-xs text-white/40">{tagFaceLabel(t.face)}</span> : null}
                </td>
                <td className={TD}><StatusPill status={t.status} /></td>
                <td className={`${TD} max-w-[180px] truncate`}>{t.leadName ?? <span className="text-white/30">—</span>}</td>
                <td className={`${TD} max-w-[160px] truncate`}>{t.repName ?? <span className="text-white/40">House</span>}</td>
                <td className={TD}>{destinationLabel(t.destinationType)}</td>
                <td className={`${TD} text-xs ${chipTone(t.nfcStatus)}`}>{NFC_LABELS[t.nfcStatus] ?? t.nfcStatus}</td>
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
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFrom(params), [params]);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const [creating, setCreating] = useState(false);
  const { data: reps = [] } = useReps();
  const { data: leads = [] } = useLeads();
  const { data: batches = [] } = useBatchOptions();

  // Keep the search box in step when the URL changes from outside (back button, Overview link).
  useEffect(() => setSearchDraft(filters.search ?? ""), [filters.search]);

  const set = (patch: Filters) => {
    const next = { ...filters, ...patch };
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) if (next[key]) search.set(key, next[key]!);
    setParams(search, { replace: true });
  };

  const url = listUrl(filters);
  const { data: tags = [], isLoading, error } = useQuery<TagListItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tags) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }, [tags]);
  const houseCount = useMemo(() => tags.filter((t) => t.repId === null).length, [tags]);
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  const repOptions = [{ value: "house", label: "House stock (no reseller)" }, ...reps.map((r) => ({ value: String(r.id), label: repOptionLabel(r) }))];
  // A rep/lead/batch in the URL that isn't in the pickers (e.g. still loading) still shows as selected.
  if (filters.rep && !repOptions.some((o) => o.value === filters.rep)) repOptions.push({ value: filters.rep, label: `Reseller #${filters.rep}` });
  const leadOptions = leads.map((l) => ({ value: String(l.id), label: l.name }));
  if (filters.lead && !leadOptions.some((o) => o.value === filters.lead)) leadOptions.push({ value: filters.lead, label: `Customer #${filters.lead}` });
  const batchOptions = batches.map((b) => ({ value: b.id, label: b.batchCode }));
  if (filters.batch && !batchOptions.some((o) => o.value === filters.batch)) batchOptions.push({ value: filters.batch, label: "Selected batch" });

  return (
    <div className="space-y-4" data-testid="admin-tags-pieces">
      <div className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              set({ search: searchDraft.trim() || undefined });
            }}
          >
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search code, customer, label or batch"
              className={INPUT}
              maxLength={100}
              data-testid="admin-pieces-search"
            />
            <button type="submit" className={BTN_GHOST} aria-label="Search"><Search className="h-4 w-4" /></button>
          </form>
          <button type="button" className={BTN} onClick={() => setCreating(true)} data-testid="admin-pieces-new">
            <Plus className="h-4 w-4" />New piece
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Select value={filters.status} onChange={(v) => set({ status: v })} placeholder="All statuses" options={STATUS_OPTIONS} testId="admin-pieces-status" />
          <Select value={filters.product} onChange={(v) => set({ product: v })} placeholder="All products" options={PRODUCT_OPTIONS} />
          <Select value={filters.rep} onChange={(v) => set({ rep: v })} placeholder="All resellers" options={repOptions} testId="admin-pieces-rep" />
          <Select value={filters.lead} onChange={(v) => set({ lead: v })} placeholder="All customers" options={leadOptions} />
          <Select value={filters.batch} onChange={(v) => set({ batch: v })} placeholder="All batches" options={batchOptions} />
          <Select value={filters.method} onChange={(v) => set({ method: v })} placeholder="Any method" options={METHOD_OPTIONS} />
        </div>
        {hasFilters ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"
            onClick={() => {
              setSearchDraft("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            <X className="h-3 w-3" />Clear filters
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <LoadError what="pieces" error={error} />
      ) : tags.length === 0 ? (
        <Empty>{hasFilters ? "No pieces match these filters." : "No pieces yet. Create a batch, or a single piece above."}</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50" data-testid="admin-pieces-counts">
            <span className="font-semibold text-white/80">
              {tags.length >= LIST_LIMIT ? `${LIST_LIMIT}+` : tags.length} piece{tags.length === 1 ? "" : "s"}
            </span>
            {TAG_STATUSES.filter((s) => statusCounts[s]).map((s) => (
              <span key={s} className="tabular-nums">
                {statusCounts[s]} {s}
              </span>
            ))}
            <span className="tabular-nums">{houseCount} in house</span>
          </div>
          <PiecesTable tags={tags} onOpen={(id) => go(`/pieces/${id}`)} />
          {tags.length >= LIST_LIMIT ? (
            <p className="text-xs text-white/40">Showing the first {LIST_LIMIT} — narrow the filters to see more.</p>
          ) : null}
        </>
      )}

      <NewPieceDialog open={creating} onOpenChange={setCreating} onCreated={(id) => go(`/pieces/${id}`)} />
    </div>
  );
}
