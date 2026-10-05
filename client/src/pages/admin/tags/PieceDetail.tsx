import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Download, ExternalLink, Power, PowerOff, RotateCcw, Truck, Undo2, UserPlus } from "lucide-react";
import { defaultUtmEnabled, planTransition, validateDestinationUrl, type TagAction } from "@shared/tags";
import { isReviewFormUrl } from "@shared/reviewLink";
import type { TagDetail } from "@shared/tagsApi";
import { tagFaceLabel } from "@shared/tagFace";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AdminHttpError, ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS } from "./api";
import { BTN, BTN_DANGER, BTN_GHOST, CARD, INPUT, StatusPill } from "./ui";
import {
  CopyRow,
  DESTINATION_OPTIONS,
  destinationLabel,
  Loading,
  LoadError,
  FACE_OPTIONS,
  PRODUCT_OPTIONS,
  productLabel,
  repOptionLabel,
  Select,
  useLeads,
  useReps,
} from "./pieces-shared";
import { AnalyticsPanel, RangePicker, type AnalyticsRange } from "./pieces-analytics";
import { NfcProvisioningCard } from "./pieces-NfcProvisioningCard";
import { ReviewLinkFinder } from "./pieces-ReviewLinkFinder";
import { JourneyPanel } from "./JourneyPanel";

type Go = (path: string) => void;

const URL_HINTS: Record<string, string> = {
  google_review: 'The Google "write a review" link. Find the business below, or paste the "Ask for reviews" link from Google Business Profile.',
  website: "Customer website, e.g. https://example.com",
  booking: "Booking page URL",
  vcard: "Digital business card URL",
  menu: "Menu URL",
  social: "Instagram / Facebook / TikTok profile URL",
  custom: "Any https:// URL",
};

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-white/40";
const STEP_TITLE = "text-sm font-semibold text-white";

/** Every write on this screen answers with the fresh TagDetail. */
function usePieceMutation(id: string, successTitle: string) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ url, method = "POST", body }: { url?: string; method?: "POST" | "PATCH"; body?: unknown }) =>
      sendJson<TagDetail>(method, url ?? `/api/xpot/admin/tags/${id}`, body ?? {}),
    onSuccess: () => {
      void invalidateAdminTags();
      toast({ title: successTitle });
    },
    onError: (err) => toast({ title: "Action failed", description: errorMessage(err), variant: "destructive" }),
  });
}

// ─── Customer (lead) ──────────────────────────────────────────────────────────

function CustomerStep({ tag }: { tag: TagDetail }) {
  const { toast } = useToast();
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useLeads();
  const [leadId, setLeadId] = useState<string | undefined>(tag.leadId ? String(tag.leadId) : undefined);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const assign = usePieceMutation(tag.id, "Customer assigned");
  const locked = tag.status === "retired";

  const options = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const list = (term ? leads.filter((l) => l.name.toLowerCase().includes(term)) : leads).slice(0, 300);
    const opts = list.map((l) => ({ value: String(l.id), label: l.name }));
    // Keep the current / chosen lead visible even when filtered out.
    for (const keep of [leadId, tag.leadId ? String(tag.leadId) : undefined]) {
      if (keep && !opts.some((o) => o.value === keep)) {
        const lead = leads.find((l) => String(l.id) === keep);
        opts.unshift({ value: keep, label: lead?.name ?? (String(tag.leadId) === keep ? tag.leadName ?? `Customer #${keep}` : `Customer #${keep}`) });
      }
    }
    return opts;
  }, [leads, filter, leadId, tag.leadId, tag.leadName]);

  const confirmMove = () =>
    !tag.leadId ||
    !(tag.destinationUrl || tag.destinationType) ||
    window.confirm("Moving this piece to another customer clears its current destination. Continue?");

  const submit = async () => {
    if (creating) {
      const name = newName.trim();
      if (!name || !confirmMove()) return;
      // The server creates the lead, owned by the reseller holding the piece.
      setNewName("");
      setCreating(false);
      assign.mutate({ url: `/api/xpot/admin/tags/${tag.id}/assign`, body: { leadName: name } });
      return;
    }
    if (!leadId || Number(leadId) === tag.leadId) return;
    if (!confirmMove()) return;
    assign.mutate({ url: `/api/xpot/admin/tags/${tag.id}/assign`, body: { leadId: Number(leadId) } });
  };

  // The server refuses to move a live piece; don't create a lead that would be left orphaned.
  const liveWithCustomer = tag.status === "active" && !!tag.leadId;
  const busy = assign.isPending;

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>1. Customer</p>
      {tag.leadName || tag.leadId ? (
        <p className="text-sm text-white/70">
          Assigned to <strong className="text-white">{tag.leadName ?? `Customer #${tag.leadId}`}</strong>
        </p>
      ) : (
        <p className="text-sm text-white/40">Not assigned yet.</p>
      )}
      {liveWithCustomer ? (
        <p className="text-xs text-white/40">Disable the piece before moving it to another customer.</p>
      ) : null}
      {locked ? null : creating ? (
        <input className={INPUT} placeholder="Business name *" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} data-testid="admin-piece-new-lead" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
          <input className={INPUT} placeholder="Filter customers…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select
            value={leadId}
            onChange={setLeadId}
            placeholder={leadsLoading ? "Loading customers…" : leadsError ? "Could not load customers" : options.length ? "Select customer…" : "No customers match"}
            options={options}
            testId="admin-piece-lead-select"
          />
        </div>
      )}
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN}
            onClick={() => void submit()}
            disabled={busy || liveWithCustomer || (creating ? !newName.trim() : !leadId || Number(leadId) === tag.leadId)}
            data-testid="admin-piece-assign"
          >
            {creating ? "Create & assign" : "Assign"}
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => setCreating((v) => !v)}>
            <UserPlus className="h-3.5 w-3.5" />
            {creating ? "Pick existing" : "New customer"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Destination ──────────────────────────────────────────────────────────────

function DestinationStep({ tag }: { tag: TagDetail }) {
  const [destinationType, setDestinationType] = useState<string | undefined>(tag.destinationType ?? undefined);
  const [destinationUrl, setDestinationUrl] = useState(tag.destinationUrl ?? "");
  const [utmEnabled, setUtmEnabled] = useState(tag.utmEnabled);
  const [utmTouched, setUtmTouched] = useState(false);
  const [utmCampaign, setUtmCampaign] = useState(tag.utmCampaign ?? "");
  const [reason, setReason] = useState("");
  const save = usePieceMutation(tag.id, "Destination saved");
  const locked = tag.status === "retired";
  const trimmed = destinationUrl.trim();
  const check = trimmed ? validateDestinationUrl(trimmed, { allowHttp: import.meta.env.DEV }) : null;
  const dirty =
    destinationType !== (tag.destinationType ?? undefined) ||
    trimmed !== (tag.destinationUrl ?? "") ||
    utmEnabled !== tag.utmEnabled ||
    utmCampaign.trim() !== (tag.utmCampaign ?? "");
  // Clearing both is allowed (server accepts null); half-set is not.
  const clearing = !trimmed && !destinationType;
  const valid = clearing ? !!tag.destinationUrl && tag.status !== "active" : !!destinationType && !!check?.ok;

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>2. Destination</p>
      <Select
        value={destinationType}
        onChange={(v) => {
          setDestinationType(v);
          if (!utmTouched) setUtmEnabled(defaultUtmEnabled(v));
        }}
        placeholder="Destination type…"
        options={DESTINATION_OPTIONS}
        disabled={locked}
        testId="admin-piece-destination-type"
      />
      <div className="space-y-1">
        <input
          className={INPUT}
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          disabled={locked}
          data-testid="admin-piece-destination-url"
        />
        <p className="text-xs text-white/40">
          {check && !check.ok ? <span className="text-red-400">{check.error}</span> : URL_HINTS[destinationType ?? ""] ?? "Paste the full URL."}
        </p>
        {destinationType === "google_review" && check?.ok && !isReviewFormUrl(check.url) ? (
          <p className="text-xs text-amber-300">This link opens the business on Maps, not the review form. Use the finder below to convert it.</p>
        ) : null}
      </div>
      {destinationType === "google_review" && !locked ? (
        <ReviewLinkFinder
          key={tag.id}
          initialQuery={trimmed && !isReviewFormUrl(trimmed) ? trimmed : tag.leadName ?? ""}
          onPick={(place) => setDestinationUrl(place.reviewUrl)}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
        <div>
          <label htmlFor={`utm-${tag.id}`} className="text-sm text-white/80">Add tracking parameters (UTM)</label>
          <p className="text-xs text-white/40">utm_medium=qr or nfc. Off by default for Google Review links.</p>
        </div>
        <Switch
          id={`utm-${tag.id}`}
          checked={utmEnabled}
          onCheckedChange={(v) => {
            setUtmEnabled(v);
            setUtmTouched(true);
          }}
          disabled={locked}
        />
      </div>
      {utmEnabled ? (
        <input className={INPUT} value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="Campaign (optional), e.g. johns-barber" maxLength={80} disabled={locked} />
      ) : null}
      {tag.destinationUrl && !locked ? (
        <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for change (optional, kept in history)" maxLength={300} />
      ) : null}
      {locked ? null : (
        <button
          type="button"
          className={BTN}
          disabled={!dirty || save.isPending || !valid}
          onClick={() =>
            save.mutate({
              method: "PATCH",
              body: clearing
                ? { destinationType: null, destinationUrl: null, reason }
                : { destinationType, destinationUrl: trimmed, utmEnabled, utmCampaign, reason },
            })
          }
          data-testid="admin-piece-save-destination"
        >
          Save destination
        </button>
      )}
    </div>
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

type LifecycleAction = Exclude<TagAction, "assign">;

const ACTION_COPY: Record<LifecycleAction, { title: string; description: string; confirm: string; danger?: boolean }> = {
  activate: { title: "Activate this piece?", description: "Both the QR and the NFC URL start redirecting to the destination. The sale is credited to the reseller holding it.", confirm: "Activate" },
  disable: { title: "Disable this piece?", description: 'Scans will show an "unavailable" page. The customer and destination are kept.', confirm: "Disable", danger: true },
  unassign: { title: "Return to inventory?", description: "The customer and destination are cleared (history is kept). The piece stays with its current reseller.", confirm: "Unassign", danger: true },
  retire: { title: "Retire this piece permanently?", description: "It stops redirecting. Analytics and history are kept; it can be restored later.", confirm: "Retire", danger: true },
  restore: { title: "Restore this retired piece?", description: "It comes back as not live (assigned if it still has a customer, otherwise inventory).", confirm: "Restore" },
};

/** Activate/disable live on the field API (managers may act on any piece); the rest on the admin API. */
function actionUrl(id: string, action: LifecycleAction): string {
  return action === "activate" || action === "disable" ? `/api/xpot/tags/${id}/${action}` : `/api/xpot/admin/tags/${id}/${action}`;
}

function ActionDialog({ action, onClose, onConfirm, pending }: { action: LifecycleAction | null; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  const copy = action ? ACTION_COPY[action] : null;
  return (
    <Dialog
      open={!!action}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="border-white/10 bg-[#0d1326] text-white">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription className="text-white/50">{copy?.description}</DialogDescription>
        </DialogHeader>
        <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, kept in the log)" maxLength={300} data-testid="admin-piece-action-reason" />
        <DialogFooter className="gap-2">
          <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={copy?.danger ? BTN_DANGER : BTN}
            disabled={pending}
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
            data-testid="admin-piece-action-confirm"
          >
            {copy?.confirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleStep({ tag }: { tag: TagDetail }) {
  const run = usePieceMutation(tag.id, "Piece updated");
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const can = (action: LifecycleAction) => planTransition(tag, action).ok;
  const activatePlan = planTransition(tag, "activate");

  const confirm = (reason: string) => {
    if (!pending) return;
    run.mutate({ url: actionUrl(tag.id, pending), body: { reason } }, { onSettled: () => setPending(null) });
  };

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>3. Test & go live</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN_GHOST}
          disabled={!tag.destinationUrl}
          onClick={() => tag.destinationUrl && window.open(tag.destinationUrl, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3.5 w-3.5" />Test destination
        </button>
        {tag.status !== "active" && tag.status !== "retired" ? (
          <button type="button" className={BTN} disabled={!activatePlan.ok || run.isPending} onClick={() => setPending("activate")} data-testid="admin-piece-activate">
            <Power className="h-3.5 w-3.5" />Activate
          </button>
        ) : null}
        {can("disable") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("disable")} data-testid="admin-piece-disable">
            <PowerOff className="h-3.5 w-3.5" />Disable
          </button>
        ) : null}
        {can("unassign") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("unassign")}>
            <Undo2 className="h-3.5 w-3.5" />Unassign
          </button>
        ) : null}
        {can("retire") ? (
          <button type="button" className={BTN_DANGER} disabled={run.isPending} onClick={() => setPending("retire")}>
            <Archive className="h-3.5 w-3.5" />Retire
          </button>
        ) : null}
        {can("restore") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("restore")}>
            <RotateCcw className="h-3.5 w-3.5" />Restore
          </button>
        ) : null}
      </div>
      {tag.status !== "active" && tag.status !== "retired" && !activatePlan.ok ? <p className="text-xs text-white/40">{activatePlan.error}.</p> : null}
      {tag.status === "active" ? <p className="text-xs text-emerald-400">Live — both the QR and the NFC URL redirect to the destination.</p> : null}
      <ActionDialog action={pending} onClose={() => setPending(null)} onConfirm={confirm} pending={run.isPending} />
    </div>
  );
}

// ─── Label / product ──────────────────────────────────────────────────────────

function DetailsStep({ tag }: { tag: TagDetail }) {
  const [label, setLabel] = useState(tag.label ?? "");
  const [productType, setProductType] = useState<string | undefined>(tag.productType);
  const [face, setFace] = useState<string | undefined>(tag.ownFace ?? undefined);
  const save = usePieceMutation(tag.id, "Piece saved");
  const dirty = label.trim() !== (tag.label ?? "") || productType !== tag.productType || (face ?? null) !== tag.ownFace;
  if (tag.status === "retired") return null;
  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>Piece details</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL}>Product type</span>
          <Select value={productType} onChange={setProductType} placeholder="Product…" options={PRODUCT_OPTIONS} allowEmpty={false} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={LABEL}>Printed on the piece</span>
          <Select value={face} onChange={setFace} placeholder={tag.batchCode ? "Same as the batch" : "From the product"} options={FACE_OPTIONS} />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Internal label</span>
          <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Optional" />
        </label>
      </div>
      <button type="button" className={BTN_GHOST} disabled={!dirty || !productType || save.isPending} onClick={() => save.mutate({ method: "PATCH", body: { label, productType, face: face ?? null } })}>
        Save details
      </button>
    </div>
  );
}

// ─── Reseller ─────────────────────────────────────────────────────────────────

const HOUSE = "house";

/** Move the piece (and, if sold, its sale credit) to another reseller or back to house stock. */
function ResellerField({ tag }: { tag: TagDetail }) {
  const { data: reps = [], error } = useReps();
  const current = tag.repId ? String(tag.repId) : HOUSE;
  const [choice, setChoice] = useState<string>(current);
  const move = usePieceMutation(tag.id, "Reseller updated");
  const options = [{ value: HOUSE, label: "House stock (no reseller)" }, ...reps.map((r) => ({ value: String(r.id), label: repOptionLabel(r) }))];
  if (tag.repId && !options.some((o) => o.value === current)) options.push({ value: current, label: tag.repName ?? `Reseller #${tag.repId}` });

  const submit = () => {
    if (choice === current) return;
    const target = choice === HOUSE ? "house stock" : options.find((o) => o.value === choice)?.label ?? "this reseller";
    const note = tag.soldAt ? " The sale credit moves with it." : "";
    if (!window.confirm(`Move ${tag.publicCode} to ${target}?${note}`)) return;
    move.mutate({ url: `/api/xpot/admin/tags/${tag.id}/rep`, method: "PATCH", body: { repId: choice === HOUSE ? null : Number(choice) } });
  };

  return (
    <div className="space-y-1.5">
      <p className={LABEL}>Reseller</p>
      <p className="text-sm text-white/80">
        {tag.repName ?? (tag.repId ? `Reseller #${tag.repId}` : "House stock")}
        {tag.kitId ? <span className="text-xs text-white/40"> · in a kit</span> : null}
      </p>
      <div className="flex gap-2">
        <Select value={choice} onChange={(v) => setChoice(v ?? HOUSE)} placeholder="House stock" options={options} allowEmpty={false} testId="admin-piece-rep" />
        <button type="button" className={`${BTN_GHOST} shrink-0`} disabled={choice === current || move.isPending} onClick={submit} data-testid="admin-piece-rep-move">
          <Truck className="h-3.5 w-3.5" />Move
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">Could not load resellers.</p> : null}
      {tag.soldAt ? <p className="text-xs text-white/40">Sale counted {formatDateTime(tag.soldAt)}</p> : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Back({ go }: { go: Go }) {
  return (
    <button type="button" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white" onClick={() => go("/pieces")} data-testid="admin-piece-back">
      <ArrowLeft className="h-4 w-4" />All pieces
    </button>
  );
}

function Dl({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">{children}</dl>;
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-white/40">{label}</dt>
      <dd className="truncate text-right text-white/80">{value}</dd>
    </>
  );
}

export function PieceDetail({ id, go }: { id: string; go: Go }) {
  const [range, setRange] = useState<AnalyticsRange>({ preset: "30d" });
  const { data: tag, isLoading, error } = useQuery<TagDetail>({
    queryKey: [ADMIN_TAGS_KEY, "piece", id],
    queryFn: () => getJson(`/api/xpot/tags/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
    retry: (count, err) => !(err instanceof AdminHttpError && err.status < 500) && count < 2,
  });

  if (isLoading) return <Loading />;
  if (error || !tag) {
    const notFound = error instanceof AdminHttpError && error.status === 404;
    return (
      <div className="space-y-3">
        <Back go={go} />
        {notFound ? <p className="text-sm text-red-400">Piece not found.</p> : <LoadError what="this piece" error={error} />}
      </div>
    );
  }

  const qrBase = `/api/xpot/admin/tags/${tag.id}`;

  return (
    <div className="space-y-4" data-testid="admin-piece-detail">
      <Back go={go} />

      <div className="flex flex-wrap items-center gap-3">
        <TagFaceIcon face={tag.face} size="lg" />
        <h2 className="font-mono text-2xl font-bold tracking-wider text-white" data-testid="admin-piece-code">{tag.publicCode}</h2>
        <StatusPill status={tag.status} />
        <span className="text-sm text-white/50">
          {productLabel(tag.productType)}
          {` · ${tag.face ? tagFaceLabel(tag.face) : "print not recorded"}`}
          {tag.batchCode ? (
            <>
              {" · "}
              <button type="button" className="font-mono hover:text-white hover:underline" onClick={() => tag.batchId && go(`/batches/${tag.batchId}`)}>
                {tag.batchCode}
                {tag.serialNumber ? ` #${tag.serialNumber}` : ""}
              </button>
            </>
          ) : null}
          {tag.label ? ` · ${tag.label}` : ""}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* key: re-seed the forms whenever the saved piece changes */}
        <section className={`${CARD} space-y-6 p-4`} key={`${tag.id}-${tag.updatedAt}`}>
          <CustomerStep tag={tag} />
          <div className="border-t border-white/10" />
          <DestinationStep tag={tag} />
          <div className="border-t border-white/10" />
          <LifecycleStep tag={tag} />
          <div className="border-t border-white/10" />
          <DetailsStep tag={tag} />
        </section>

        <section className={`${CARD} space-y-4 p-4`} key={`side-${tag.id}-${tag.updatedAt}`}>
          <div className="mx-auto w-44 rounded-xl bg-white p-2">
            <img src={`${qrBase}/qr.svg?v=${encodeURIComponent(tag.publicCode)}`} alt={`QR code for ${tag.publicCode}`} className="h-full w-full" />
          </div>
          <div className="flex justify-center gap-2">
            <a className={BTN_GHOST} href={`${qrBase}/qr.svg?download=1`} download={`${tag.publicCode}.svg`}>
              <Download className="h-3.5 w-3.5" />SVG
            </a>
            <a className={BTN_GHOST} href={`${qrBase}/qr.png?download=1`} download={`${tag.publicCode}.png`}>
              <Download className="h-3.5 w-3.5" />PNG
            </a>
          </div>
          <CopyRow label="QR URL (printed)" value={tag.qrUrl} />
          <CopyRow label="NFC URL (program the chip)" value={tag.nfcUrl} />
          <Dl>
            <Row label="Destination" value={destinationLabel(tag.destinationType)} />
            <Row label="Assigned" value={formatDateTime(tag.assignedAt)} />
            <Row label="Activated" value={formatDateTime(tag.activatedAt)} />
            <Row label="Disabled" value={formatDateTime(tag.disabledAt)} />
            <Row label="Last interaction" value={formatDateTime(tag.lastInteractionAt)} />
            <Row label="Scans" value={`QR ${tag.qrInteractions} · NFC ${tag.nfcInteractions}`} />
            <Row label="Created" value={formatDateTime(tag.createdAt)} />
          </Dl>
          <div className="border-t border-white/10" />
          <ResellerField tag={tag} />
        </section>
      </div>

      <NfcProvisioningCard tagId={tag.id} publicCode={tag.publicCode} nfcUrl={tag.nfcUrl} retired={tag.status === "retired"} onOpenWriters={() => go("/provisioners")} />

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ tagId: tag.id }} title="Piece journey" />

      <section className={`${CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white">Destination history</p>
        {tag.history.length === 0 ? (
          <p className="text-sm text-white/40">No destination set yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {tag.history.map((h) => (
              <li key={h.id} className="space-y-0.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
                  <span>
                    {formatDateTime(h.createdAt)} · {h.changedByEmail ?? "admin"}
                  </span>
                  {h.reason ? <span className="italic">“{h.reason}”</span> : null}
                </div>
                <p className="break-all">
                  <span className="text-white/40">
                    {destinationLabel(h.previousDestinationType)}: {h.previousUrl ?? "—"}
                  </span>
                  <span className="mx-1 text-white/30">→</span>
                  <span className="text-white/80">
                    {destinationLabel(h.newDestinationType)}: {h.newUrl ?? "cleared"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/60">Analytics</p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <AnalyticsPanel scopeUrl={`/api/xpot/admin/tags/${tag.id}/analytics`} range={range} />
      </div>
    </div>
  );
}
