import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Download, ExternalLink, Power, PowerOff, RotateCcw, Truck, Undo2, UserPlus } from "lucide-react";
import { defaultUtmEnabled, planTransition, type TagAction } from "@shared/tags";
import { validateChipContent } from "@shared/chipContent";
import { isReviewFormUrl } from "@shared/reviewLink";
import type { TagDetail } from "@shared/tagsApi";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { TagProductThumbnail } from "@/components/xpot/TagProductThumbnail";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AdminHttpError, ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS } from "./api";
import { BTN, BTN_DANGER, BTN_GHOST, CARD, INPUT, StatusPill } from "./ui";
import { CopyRow, Loading, LoadError, Select, useLeads, useReps } from "./pieces-shared";
import { useTagLabels } from "./labels";
import { AnalyticsPanel, RangePicker, type AnalyticsRange } from "./pieces-analytics";
import { NfcProvisioningCard } from "./pieces-NfcProvisioningCard";
import { ReviewLinkFinder } from "./pieces-ReviewLinkFinder";
import { JourneyPanel } from "./JourneyPanel";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";

type Go = (path: string) => void;

type PieceKey = keyof (typeof manageTagsPiecesMessages)["en"];

const URL_HINT_KEYS: Record<string, PieceKey> = {
  google_review: "urlHint_google_review",
  website: "urlHint_website",
  booking: "urlHint_booking",
  vcard: "urlHint_vcard",
  menu: "urlHint_menu",
  social: "urlHint_social",
  custom: "urlHint_custom",
};

/** validateDestinationUrl (shared) answers in English; its messages, by text. */
const URL_ERROR_KEYS: Record<string, PieceKey> = {
  "Destination URL is required": "urlErrorRequired",
  "Destination URL is too long": "urlErrorTooLong",
  "Destination must be a full URL starting with https://": "urlErrorNotFull",
  "Destination must use https://": "urlErrorHttps",
  "Destination URL is not valid": "urlErrorInvalid",
};

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-white/40";
const STEP_TITLE = "text-sm font-semibold text-white";

/** Every write on this screen answers with the fresh TagDetail. */
function usePieceMutation(id: string, successTitle: string) {
  const { toast } = useToast();
  const t = useT(manageTagsPiecesMessages);
  return useMutation({
    mutationFn: ({ url, method = "POST", body }: { url?: string; method?: "POST" | "PATCH"; body?: unknown }) =>
      sendJson<TagDetail>(method, url ?? `/api/xpot/admin/tags/${id}`, body ?? {}),
    onSuccess: () => {
      void invalidateAdminTags();
      toast({ title: successTitle });
    },
    onError: (err) => toast({ title: t("actionFailed"), description: errorMessage(err), variant: "destructive" }),
  });
}

// ─── Customer (lead) ──────────────────────────────────────────────────────────

function CustomerStep({ tag }: { tag: TagDetail }) {
  const { toast } = useToast();
  const t = useT(manageTagsPiecesMessages);
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useLeads();
  const [leadId, setLeadId] = useState<string | undefined>(tag.leadId ? String(tag.leadId) : undefined);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const assign = usePieceMutation(tag.id, t("customerAssigned"));
  const locked = tag.status === "retired";

  const options = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const list = (term ? leads.filter((l) => l.name.toLowerCase().includes(term)) : leads).slice(0, 300);
    const opts = list.map((l) => ({ value: String(l.id), label: l.name }));
    // Keep the current / chosen lead visible even when filtered out.
    for (const keep of [leadId, tag.leadId ? String(tag.leadId) : undefined]) {
      if (keep && !opts.some((o) => o.value === keep)) {
        const lead = leads.find((l) => String(l.id) === keep);
        opts.unshift({ value: keep, label: lead?.name ?? (String(tag.leadId) === keep ? tag.leadName ?? t("customerNumber", { id: keep }) : t("customerNumber", { id: keep })) });
      }
    }
    return opts;
  }, [leads, filter, leadId, tag.leadId, tag.leadName, t]);

  const confirmMove = () =>
    !tag.leadId ||
    !(tag.destinationUrl || tag.destinationType) ||
    window.confirm(t("confirmMoveCustomer"));

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
      <p className={STEP_TITLE}>{t("stepCustomer")}</p>
      {tag.leadName || tag.leadId ? (
        <p className="text-sm text-white/70">
          {t("assignedTo")}{" "}
          <strong className="text-white">{tag.leadName ?? t("customerNumber", { id: tag.leadId ?? "" })}</strong>
        </p>
      ) : (
        <p className="text-sm text-white/40">{t("notAssigned")}</p>
      )}
      {liveWithCustomer ? (
        <p className="text-xs text-white/40">{t("disableBeforeMove")}</p>
      ) : null}
      {locked ? null : creating ? (
        <input className={INPUT} placeholder={t("businessNameRequired")} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} data-testid="admin-piece-new-lead" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
          <input className={INPUT} placeholder={t("filterCustomers")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select
            value={leadId}
            onChange={setLeadId}
            placeholder={leadsLoading ? t("loadingCustomers") : leadsError ? t("customersFailed") : options.length ? t("selectCustomer") : t("noCustomersMatch")}
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
            {creating ? t("createAndAssign") : t("assign")}
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => setCreating((v) => !v)}>
            <UserPlus className="h-3.5 w-3.5" />
            {creating ? t("pickExisting") : t("newCustomer")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Destination ──────────────────────────────────────────────────────────────

function DestinationStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const labels = useTagLabels();
  const [destinationType, setDestinationType] = useState<string | undefined>(tag.destinationType ?? undefined);
  const [destinationUrl, setDestinationUrl] = useState(tag.destinationUrl ?? "");
  const [utmEnabled, setUtmEnabled] = useState(tag.utmEnabled);
  const [utmTouched, setUtmTouched] = useState(false);
  const [utmCampaign, setUtmCampaign] = useState(tag.utmCampaign ?? "");
  const [reason, setReason] = useState("");
  const save = usePieceMutation(tag.id, t("destinationSaved"));
  const locked = tag.status === "retired";
  const trimmed = destinationUrl.trim();
  // A link, or an email/phone/vCard set from the phone app (shared/chipContent.ts).
  const check = trimmed ? validateChipContent(trimmed, { allowHttp: import.meta.env.DEV }) : null;
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
      <p className={STEP_TITLE}>{t("stepDestination")}</p>
      <Select
        value={destinationType}
        onChange={(v) => {
          setDestinationType(v);
          if (!utmTouched) setUtmEnabled(defaultUtmEnabled(v));
        }}
        placeholder={t("destinationTypePlaceholder")}
        options={labels.destinationOptions}
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
          {check && !check.ok ? (
            <span className="text-red-400">{URL_ERROR_KEYS[check.error] ? t(URL_ERROR_KEYS[check.error]) : check.error}</span>
          ) : (
            t(URL_HINT_KEYS[destinationType ?? ""] ?? "urlHintDefault")
          )}
        </p>
        {destinationType === "google_review" && check?.ok && !isReviewFormUrl(check.value) ? (
          <p className="text-xs text-amber-300">{t("reviewNotFormConvert")}</p>
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
          <label htmlFor={`utm-${tag.id}`} className="text-sm text-white/80">{t("utmLabel")}</label>
          <p className="text-xs text-white/40">{t("utmHint")}</p>
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
        <input className={INPUT} value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder={t("utmCampaignPlaceholder")} maxLength={80} disabled={locked} />
      ) : null}
      {tag.destinationUrl && !locked ? (
        <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("changeReasonPlaceholder")} maxLength={300} />
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
          {t("saveDestination")}
        </button>
      )}
    </div>
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

type LifecycleAction = Exclude<TagAction, "assign">;

/** Title, description and button are action_<action>_title / _description / _confirm. */
const DANGER_ACTIONS: ReadonlySet<LifecycleAction> = new Set<LifecycleAction>(["disable", "unassign", "retire"]);

/** Why a piece cannot go live yet (planTransition's reason, in the language in use). */
function activateBlockerKey(tag: TagDetail): PieceKey {
  if (tag.status === "inventory" || !tag.leadId) return "activateNeedsCustomer";
  if (!tag.destinationType) return "activateNeedsType";
  return "activateNeedsUrl";
}

/** Activate/disable live on the field API (managers may act on any piece); the rest on the admin API. */
function actionUrl(id: string, action: LifecycleAction): string {
  return action === "activate" || action === "disable" ? `/api/xpot/tags/${id}/${action}` : `/api/xpot/admin/tags/${id}/${action}`;
}

function ActionDialog({ action, onClose, onConfirm, pending }: { action: LifecycleAction | null; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const t = useT(manageTagsPiecesMessages);
  const tc = useT(commonMessages);
  const [reason, setReason] = useState("");
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
          <DialogTitle>{action ? t(`action_${action}_title`) : null}</DialogTitle>
          <DialogDescription className="text-white/50">{action ? t(`action_${action}_description`) : null}</DialogDescription>
        </DialogHeader>
        <input className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} maxLength={300} data-testid="admin-piece-action-reason" />
        <DialogFooter className="gap-2">
          <button type="button" className={BTN_GHOST} onClick={onClose}>{tc("cancel")}</button>
          <button
            type="button"
            className={action && DANGER_ACTIONS.has(action) ? BTN_DANGER : BTN}
            disabled={pending}
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
            data-testid="admin-piece-action-confirm"
          >
            {action ? t(`action_${action}_confirm`) : null}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const run = usePieceMutation(tag.id, t("pieceUpdated"));
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const can = (action: LifecycleAction) => planTransition(tag, action).ok;
  const activatePlan = planTransition(tag, "activate");

  const confirm = (reason: string) => {
    if (!pending) return;
    run.mutate({ url: actionUrl(tag.id, pending), body: { reason } }, { onSettled: () => setPending(null) });
  };

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>{t("stepLive")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN_GHOST}
          disabled={!tag.destinationUrl}
          onClick={() => tag.destinationUrl && window.open(tag.destinationUrl, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3.5 w-3.5" />{t("testDestination")}
        </button>
        {tag.status !== "active" && tag.status !== "retired" ? (
          <button type="button" className={BTN} disabled={!activatePlan.ok || run.isPending} onClick={() => setPending("activate")} data-testid="admin-piece-activate">
            <Power className="h-3.5 w-3.5" />{t("action_activate_confirm")}
          </button>
        ) : null}
        {can("disable") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("disable")} data-testid="admin-piece-disable">
            <PowerOff className="h-3.5 w-3.5" />{t("action_disable_confirm")}
          </button>
        ) : null}
        {can("unassign") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("unassign")}>
            <Undo2 className="h-3.5 w-3.5" />{t("action_unassign_confirm")}
          </button>
        ) : null}
        {can("retire") ? (
          <button type="button" className={BTN_DANGER} disabled={run.isPending} onClick={() => setPending("retire")}>
            <Archive className="h-3.5 w-3.5" />{t("action_retire_confirm")}
          </button>
        ) : null}
        {can("restore") ? (
          <button type="button" className={BTN_GHOST} disabled={run.isPending} onClick={() => setPending("restore")}>
            <RotateCcw className="h-3.5 w-3.5" />{t("action_restore_confirm")}
          </button>
        ) : null}
      </div>
      {tag.status !== "active" && tag.status !== "retired" && !activatePlan.ok ? <p className="text-xs text-white/40">{t(activateBlockerKey(tag))}</p> : null}
      {tag.status === "active" ? <p className="text-xs text-emerald-400">{t("liveExplain")}</p> : null}
      <ActionDialog action={pending} onClose={() => setPending(null)} onConfirm={confirm} pending={run.isPending} />
    </div>
  );
}

// ─── Label / product ──────────────────────────────────────────────────────────

function DetailsStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  const [label, setLabel] = useState(tag.label ?? "");
  const [productType, setProductType] = useState<string | undefined>(tag.productType);
  const [face, setFace] = useState<string | undefined>(tag.ownFace ?? undefined);
  const save = usePieceMutation(tag.id, t("pieceSaved"));
  const dirty = label.trim() !== (tag.label ?? "") || productType !== tag.productType || (face ?? null) !== tag.ownFace;
  if (tag.status === "retired") return null;
  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>{t("pieceDetails")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL}>{t("productType")}</span>
          <Select value={productType} onChange={setProductType} placeholder={t("productPlaceholder")} options={labels.productOptions} allowEmpty={false} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={LABEL}>{tg("printedOnPiece")}</span>
          <Select value={face} onChange={setFace} placeholder={tag.batchCode ? t("sameAsBatch") : t("fromProduct")} options={labels.faceOptions} />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>{t("internalLabel")}</span>
          <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t("optional")} />
        </label>
      </div>
      <button type="button" className={BTN_GHOST} disabled={!dirty || !productType || save.isPending} onClick={() => save.mutate({ method: "PATCH", body: { label, productType, face: face ?? null } })}>
        {t("saveDetails")}
      </button>
    </div>
  );
}

// ─── Reseller ─────────────────────────────────────────────────────────────────

const HOUSE = "house";

/** Move the piece (and, if sold, its sale credit) to another reseller or back to house stock. */
function ResellerField({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  const { data: reps = [], error } = useReps();
  const current = tag.repId ? String(tag.repId) : HOUSE;
  const [choice, setChoice] = useState<string>(current);
  const move = usePieceMutation(tag.id, t("resellerUpdated"));
  const options = [{ value: HOUSE, label: t("houseStockNoReseller") }, ...reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))];
  if (tag.repId && !options.some((o) => o.value === current)) options.push({ value: current, label: tag.repName ?? t("resellerNumber", { id: tag.repId }) });

  const submit = () => {
    if (choice === current) return;
    const target = choice === HOUSE ? t("houseStockTarget") : options.find((o) => o.value === choice)?.label ?? t("thisReseller");
    if (!window.confirm(t(tag.soldAt ? "moveConfirmSold" : "moveConfirm", { code: tag.publicCode, target }))) return;
    move.mutate({ url: `/api/xpot/admin/tags/${tag.id}/rep`, method: "PATCH", body: { repId: choice === HOUSE ? null : Number(choice) } });
  };

  return (
    <div className="space-y-1.5">
      <p className={LABEL}>{tg("colReseller")}</p>
      <p className="text-sm text-white/80">
        {tag.repName ?? (tag.repId ? t("resellerNumber", { id: tag.repId }) : t("houseStock"))}
        {tag.kitId ? <span className="text-xs text-white/40"> · {t("inKit")}</span> : null}
      </p>
      <div className="flex gap-2">
        <Select value={choice} onChange={(v) => setChoice(v ?? HOUSE)} placeholder={t("houseStock")} options={options} allowEmpty={false} testId="admin-piece-rep" />
        <button type="button" className={`${BTN_GHOST} shrink-0`} disabled={choice === current || move.isPending} onClick={submit} data-testid="admin-piece-rep-move">
          <Truck className="h-3.5 w-3.5" />{t("move")}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{t("resellersFailed")}</p> : null}
      {tag.soldAt ? <p className="text-xs text-white/40">{t("saleCounted", { date: formatDateTime(tag.soldAt) })}</p> : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Back({ go }: { go: Go }) {
  const ts = useT(shellMessages);
  return (
    <button type="button" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white" onClick={() => go("/pieces")} data-testid="admin-piece-back">
      <ArrowLeft className="h-4 w-4" />{ts("managePieces")}
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
  const t = useT(manageTagsPiecesMessages);
  const labels = useTagLabels();
  const isAdmin = useIsSuperAdmin();
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
        {notFound ? <p className="text-sm text-red-400">{t("notFound")}</p> : <LoadError what={t("whatThisPiece")} error={error} />}
      </div>
    );
  }

  const qrBase = `/api/xpot/admin/tags/${tag.id}`;

  return (
    <div className="space-y-4" data-testid="admin-piece-detail">
      <Back go={go} />

      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-2">
          <TagFaceIcon face={tag.face} size="lg" />
          <span className="h-10 w-px bg-white/10" aria-hidden="true" />
          <TagProductThumbnail productType={tag.productType} face={tag.face} batchCode={tag.batchCode} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-mono text-xl font-bold tracking-wider text-white sm:text-2xl" data-testid="admin-piece-code">{tag.publicCode}</h2>
            <StatusPill status={tag.status} />
          </div>
          <div className="flex flex-wrap items-center gap-y-1 text-sm text-white/50">
            <span>{labels.product(tag.productType)}</span>
            <span className="before:mx-2 before:text-white/20 before:content-['·']">{labels.face(tag.face)}</span>
            {tag.batchCode ? (
              /* Batches are the global admin's; a manager sees the code without the link. */
              isAdmin ? (
                <button type="button" className="font-mono before:mx-2 before:text-white/20 before:content-['·'] hover:text-white hover:underline" onClick={() => tag.batchId && go(`/batches/${tag.batchId}`)}>
                  {tag.batchCode}
                  {tag.serialNumber ? ` #${tag.serialNumber}` : ""}
                </button>
              ) : (
                <span className="font-mono before:mx-2 before:text-white/20 before:content-['·']">
                  {tag.batchCode}
                  {tag.serialNumber ? ` #${tag.serialNumber}` : ""}
                </span>
              )
            ) : null}
            {tag.label ? <span className="before:mx-2 before:text-white/20 before:content-['·']">{tag.label}</span> : null}
          </div>
        </div>
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
            <img src={`${qrBase}/qr.svg?v=${encodeURIComponent(tag.publicCode)}`} alt={t("qrAlt", { code: tag.publicCode })} className="h-full w-full" />
          </div>
          <div className="flex justify-center gap-2">
            <a className={BTN_GHOST} href={`${qrBase}/qr.svg?download=1`} download={`${tag.publicCode}.svg`}>
              <Download className="h-3.5 w-3.5" />SVG
            </a>
            <a className={BTN_GHOST} href={`${qrBase}/qr.png?download=1`} download={`${tag.publicCode}.png`}>
              <Download className="h-3.5 w-3.5" />PNG
            </a>
          </div>
          <CopyRow label={t("qrUrlLabel")} value={tag.qrUrl} />
          <CopyRow label={t("nfcUrlLabel")} value={tag.nfcUrl} />
          <Dl>
            <Row label={t("colDestination")} value={labels.destination(tag.destinationType)} />
            <Row label={t("rowAssigned")} value={formatDateTime(tag.assignedAt)} />
            <Row label={t("rowActivated")} value={formatDateTime(tag.activatedAt)} />
            <Row label={t("rowDisabled")} value={formatDateTime(tag.disabledAt)} />
            <Row label={t("colLastInteraction")} value={formatDateTime(tag.lastInteractionAt)} />
            <Row label={t("rowScans")} value={`QR ${tag.qrInteractions} · NFC ${tag.nfcInteractions}`} />
            <Row label={t("rowCreated")} value={formatDateTime(tag.createdAt)} />
          </Dl>
          <div className="border-t border-white/10" />
          <ResellerField tag={tag} />
        </section>
      </div>

      {/* Writing the chip is the global admin's (NFC writers); managers don't get the card. */}
      {isAdmin && (
        <NfcProvisioningCard tagId={tag.id} publicCode={tag.publicCode} nfcUrl={tag.nfcUrl} retired={tag.status === "retired"} onOpenWriters={() => go("/provisioners")} />
      )}

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ tagId: tag.id }} title={t("journeyTitle")} />

      <section className={`${CARD} p-4`}>
        <p className="mb-3 text-sm font-semibold text-white">{t("destinationHistory")}</p>
        {tag.history.length === 0 ? (
          <p className="text-sm text-white/40">{t("noDestinationYet")}</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {tag.history.map((h) => (
              <li key={h.id} className="space-y-0.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
                  <span>
                    {formatDateTime(h.createdAt)} · {h.changedByEmail ?? t("historyByAdmin")}
                  </span>
                  {h.reason ? <span className="italic">“{h.reason}”</span> : null}
                </div>
                <p className="break-all">
                  <span className="text-white/40">
                    {labels.destination(h.previousDestinationType)}: {h.previousUrl ?? "—"}
                  </span>
                  <span className="mx-1 text-white/30">→</span>
                  <span className="text-white/80">
                    {labels.destination(h.newDestinationType)}: {h.newUrl ?? t("historyCleared")}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/60">{t("analytics")}</p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <AnalyticsPanel scopeUrl={`/api/xpot/admin/tags/${tag.id}/analytics`} range={range} />
      </div>
    </div>
  );
}
