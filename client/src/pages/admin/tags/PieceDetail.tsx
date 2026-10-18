import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Ban, BarChart3, Building2, ChevronRight, Download, ExternalLink, History, MapPin, Pencil, Plus, Power, PowerOff, RotateCcw, Truck, Undo2 } from "lucide-react";
import { defaultUtmEnabled, planTransition, type TagAction } from "@shared/tags";
import { contentKindOf, contentSummary, validateChipContent, type ChipContentKind } from "@shared/chipContent";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import type { TagDetail } from "@shared/tagsApi";
import { CODE_HEADING, TagModelChips, TagPieceVisual, tagPlaqueSpec } from "@/components/xpot/TagProductThumbnail";
import { useIsSuperAdmin } from "@/components/xpot/AdminBadge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_CLASS, MODULE_ACCENT } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import { AdminHttpError, ADMIN_TAGS_KEY, errorMessage, formatDateTime, getJson, invalidateAdminTags, sendJson, STALE_MS } from "./api";
import { PieceStatusPill } from "./ui";
import { CopyRow, Loading, LoadError, useLeads, useReps } from "./pieces-shared";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { useTagLabels } from "./labels";
import { AnalyticsPanel, RangePicker, type AnalyticsRange } from "./pieces-analytics";
import { NfcProvisioningCard } from "./pieces-NfcProvisioningCard";
import { ContentEditor, type ContentState } from "@/pages/tags/ContentEditor";
import { GenerateReviewButton, ReviewLinkAssist } from "@/pages/tags/ReviewLinkSheet";
import { FieldLabel, LinkInput } from "@/pages/tags/ui";
import { JourneyPanel } from "./JourneyPanel";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { tagsMessages } from "@/i18n/messages/tags";

type Go = (path: string) => void;

type PieceKey = keyof (typeof manageTagsPiecesMessages)["en"];

/** validateDestinationUrl (shared) answers in English; its messages, by text. */
const URL_ERROR_KEYS: Record<string, PieceKey> = {
  "Destination URL is required": "urlErrorRequired",
  "Destination URL is too long": "urlErrorTooLong",
  "Destination must be a full URL starting with https://": "urlErrorNotFull",
  "Destination must use https://": "urlErrorHttps",
  "Destination URL is not valid": "urlErrorInvalid",
};

const STEP_TITLE = "text-sm font-semibold text-white";
/** A piece's own card (the steps, the side panel). */
const CARD = `rounded-2xl ${GLASS_CLASS}`;

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

type CustomerPick = { leadId: number; name: string } | { leadId: null; name: string };

function CustomerStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useLeads();
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  // A pick that would wipe the current destination waits here for a confirm.
  const [pending, setPending] = useState<CustomerPick | null>(null);
  const assign = usePieceMutation(tag.id, t("customerAssigned"));
  const locked = tag.status === "retired" || tag.stockStatus === "damaged";
  // The server refuses to move a live piece; don't create a lead that would be left orphaned.
  const liveWithCustomer = tag.status === "active" && !!tag.leadId;
  const hasCustomer = !!(tag.leadName || tag.leadId);
  const current = tag.leadId ? leads.find((l) => l.id === tag.leadId) : undefined;

  const query = text.trim().toLowerCase();
  const matches = useMemo(
    // Nothing until someone searches: the list is not a menu to scroll through.
    () => (query ? leads.filter((l) => l.name.toLowerCase().includes(query) && l.id !== tag.leadId).slice(0, 8) : []),
    [leads, query, tag.leadId],
  );
  const exact = leads.some((l) => l.name.toLowerCase() === query);

  const reset = () => {
    setChanging(false);
    setText("");
    setPending(null);
  };

  const commit = (pick: CustomerPick) => {
    // The server creates a new lead, owned by the reseller holding the piece.
    const body = pick.leadId ? { leadId: pick.leadId } : { leadName: pick.name };
    assign.mutate({ url: `/api/xpot/admin/tags/${tag.id}/assign`, body }, { onSuccess: reset });
  };

  const choose = (pick: CustomerPick) => {
    if (tag.leadId && (tag.destinationUrl || tag.destinationType)) setPending(pick);
    else commit(pick);
  };

  const picking = !locked && !liveWithCustomer && (!hasCustomer || changing);

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>{t("stepCustomer")}</p>

      {hasCustomer ? (
        <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-3 pr-2" data-testid="admin-piece-customer">
          <Building2 className="h-4 w-4 shrink-0 text-white/40" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-white">{tag.leadName ?? t("customerNumber", { id: tag.leadId ?? "" })}</span>
            {current?.city ? <span className="block truncate text-xs text-white/40">{current.city}</span> : null}
          </span>
          {current?.googlePlaceId ? <GoogleBadge label={t("onGoogle")} /> : null}
          {!locked && !liveWithCustomer && !changing ? (
            <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => setChanging(true)} data-testid="admin-piece-change-customer">
              <Pencil className="h-3.5 w-3.5" />
              {t("changeCustomer")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-white/40">{t("notAssigned")}</p>
      )}
      {liveWithCustomer ? <p className="text-xs text-white/40">{t("disableBeforeMove")}</p> : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("moveCustomerTitle", { name: pending?.name ?? "" })}
        description={t("confirmMoveCustomer")}
        confirmLabel={t("confirmMove")}
        cancelLabel={t("cancelChange")}
        busy={assign.isPending}
        testId="admin-piece-confirm-move-yes"
        onConfirm={() => pending && commit(pending)}
      />

      {picking ? (
        <div>
          <div className="flex gap-2">
            <Input
              autoFocus={changing}
              aria-label={t("searchCustomers")}
              placeholder={leadsLoading ? t("loadingCustomers") : t("searchCustomers")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              disabled={assign.isPending}
              data-testid="admin-piece-lead-search"
            />
            {changing ? (
              <Button type="button" variant="ghost" onClick={reset}>
                {t("cancelChange")}
              </Button>
            ) : null}
          </div>
          {leadsError ? <p className="mt-1 text-xs text-red-300">{t("customersFailed")}</p> : null}
          {query ? (
            <ul className="mt-2 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {matches.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    disabled={assign.isPending}
                    onClick={() => choose({ leadId: lead.id, name: lead.name })}
                    className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05] disabled:opacity-50"
                    data-testid={`admin-piece-lead-${lead.id}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{lead.name}</span>
                    {lead.city ? <span className="shrink-0 text-xs text-white/40">{lead.city}</span> : null}
                    {lead.googlePlaceId ? <GoogleBadge label={t("onGoogle")} /> : null}
                  </button>
                </li>
              ))}
              {!exact ? (
                <li>
                  <button
                    type="button"
                    disabled={assign.isPending}
                    onClick={() => choose({ leadId: null, name: text.trim() })}
                    className={`flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${MODULE_ACCENT.tags.text} hover:bg-white/[0.05] disabled:opacity-50`}
                    data-testid="admin-piece-lead-create"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("createCustomer", { name: text.trim() })}</span>
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GoogleBadge({ label }: { label: string }) {
  return (
    <Pill tone="slate" bordered className="shrink-0 gap-1">
      <MapPin className="h-3 w-3" aria-hidden="true" />
      {label}
    </Pill>
  );
}

// ─── Destination ──────────────────────────────────────────────────────────────

function DestinationStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const tt = useT(tagsMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  const { data: leads = [] } = useLeads();
  const stored = tag.destinationUrl ?? "";
  const storedKind = contentKindOf(stored);
  // With a destination on file the step is a summary; "Change" opens the form.
  const [editing, setEditing] = useState(!stored);
  const [kind, setKind] = useState<ChipContentKind>(storedKind);
  const [link, setLink] = useState(storedKind === "url" ? stored : "");
  const [content, setContent] = useState<ContentState>({ value: null, error: null });
  const [utmEnabled, setUtmEnabled] = useState(tag.utmEnabled);
  const [utmTouched, setUtmTouched] = useState(false);
  const [utmCampaign, setUtmCampaign] = useState(tag.utmCampaign ?? "");
  const [reason, setReason] = useState("");
  const save = usePieceMutation(tag.id, t("destinationSaved"));
  const locked = tag.status === "retired" || tag.stockStatus === "damaged";
  const customer = tag.leadId ? leads.find((l) => l.id === tag.leadId) : undefined;

  // A link, or an email/phone/vCard from the kind tabs (shared/chipContent.ts).
  const raw = kind === "url" ? normalizeUrlInput(link) : content.value ?? "";
  const check = raw ? validateChipContent(raw, { allowHttp: import.meta.env.DEV }) : null;
  const value = check?.ok ? check.value : null;
  const destinationType = value ? (kind === "url" ? guessDestinationType(value) : kind) : null;
  const utm = utmTouched ? utmEnabled : destinationType ? defaultUtmEnabled(destinationType) : utmEnabled;
  const dirty = value !== (tag.destinationUrl ?? null) || utm !== tag.utmEnabled || utmCampaign.trim() !== (tag.utmCampaign ?? "");
  // Why the button is off, said out loud instead of a silent grey button.
  const blocker = !value
    ? kind === "url" && check && !check.ok
      ? URL_ERROR_KEYS[check.error] ? t(URL_ERROR_KEYS[check.error]) : check.error
      : kind !== "url"
        ? content.error ?? t("saveNeedsContent")
        : t("saveNeedsContent")
    : !dirty
      ? t("saveNoChanges")
      : null;

  if (!stored && !tag.leadId && tag.status === "inventory") {
    return (
      <div className="space-y-2">
        <p className={STEP_TITLE}>{t("stepDestination")}</p>
        <p className="text-sm text-white/40">{t("destinationNeedsCustomer")}</p>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <p className={STEP_TITLE}>{t("stepDestination")}</p>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-3 pr-2" data-testid="admin-piece-destination">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-white/40">
              {t("destinationOpens")} · {storedKind === "url" ? labels.destination(tag.destinationType) : tt(`contentKind_${storedKind}`)}
            </span>
            {storedKind === "url" ? (
              <a href={stored} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold text-white hover:underline">
                {stored.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : (
              <span className="block truncate font-semibold text-white">{contentSummary(stored)}</span>
            )}
          </span>
          {!locked ? (
            <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => setEditing(true)} data-testid="admin-piece-change-destination">
              <Pencil className="h-3.5 w-3.5" />
              {t("changeDestination")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>{t("stepDestination")}</p>
      {tag.leadName && (customer?.googlePlaceId || tag.face === "google_review") ? (
        <GenerateReviewButton
          name={tag.leadName}
          placeId={customer?.googlePlaceId}
          currentLink={link}
          onLink={(url) => {
            setKind("url");
            setLink(url);
          }}
        />
      ) : null}
      <ContentEditor
        kind={kind}
        onKind={setKind}
        initial={storedKind === "url" ? null : stored}
        onChange={setContent}
        urlField={
          <div>
            <FieldLabel>{tt("linkField")}</FieldLabel>
            <LinkInput
              value={link}
              onChange={setLink}
              face={tag.face}
              placeholder={tt("linkPlaceholder")}
              onPasteFailed={() => toast({ title: tc("pasteFailed"), variant: "destructive" })}
            />
            <ReviewLinkAssist link={link} onPick={(place) => setLink(place.reviewUrl)} />
          </div>
        }
      />
      {kind === "url" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
          <div>
            <label htmlFor={`utm-${tag.id}`} className="text-sm text-white/80">{t("utmLabel")}</label>
            <p className="text-xs text-white/40">{t("utmHint")}</p>
          </div>
          <Switch
            id={`utm-${tag.id}`}
            checked={utm}
            onCheckedChange={(v) => {
              setUtmEnabled(v);
              setUtmTouched(true);
            }}
          />
        </div>
      ) : null}
      {kind === "url" && utm ? (
        <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder={t("utmCampaignPlaceholder")} aria-label={t("utmCampaignPlaceholder")} maxLength={80} />
      ) : null}
      {stored ? <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("changeReasonPlaceholder")} aria-label={t("changeReasonPlaceholder")} maxLength={300} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="brand"
          accent="tags"
          disabled={!!blocker}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { method: "PATCH", body: { destinationType, destinationUrl: value, utmEnabled: kind === "url" ? utm : false, utmCampaign, reason } },
              { onSuccess: () => setEditing(false) },
            )
          }
          data-testid="admin-piece-save-destination"
        >
          {t("saveDestination")}
        </Button>
        {stored ? (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            {tc("cancel")}
          </Button>
        ) : null}
        {blocker ? <span className="text-xs text-white/40" data-testid="admin-piece-save-hint">{blocker}</span> : null}
      </div>
    </div>
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

type LifecycleAction = Exclude<TagAction, "assign">;
type PieceAction = LifecycleAction | "damage";

/** Title, description and button are action_<action>_title / _description / _confirm. */
const DANGER_ACTIONS: ReadonlySet<PieceAction> = new Set<PieceAction>(["disable", "unassign", "retire", "damage"]);

/** Why a piece cannot go live yet (planTransition's reason, in the language in use). */
function activateBlockerKey(tag: TagDetail): PieceKey {
  if (tag.status === "inventory" || !tag.leadId) return "activateNeedsCustomer";
  if (!tag.destinationType) return "activateNeedsType";
  return "activateNeedsUrl";
}

/** Activate/disable live on the field API (managers may act on any piece); the rest on the admin API. */
function actionUrl(id: string, action: PieceAction): string {
  if (action === "damage") return `/api/xpot/admin/tags/${id}/damage`;
  return action === "activate" || action === "disable" ? `/api/xpot/tags/${id}/${action}` : `/api/xpot/admin/tags/${id}/${action}`;
}

function ActionDialog({ action, note, onClose, onConfirm, pending }: { action: PieceAction | null; note?: string | null; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const t = useT(manageTagsPiecesMessages);
  return (
    <ConfirmDialog
      open={!!action}
      onOpenChange={(open) => !open && onClose()}
      title={action ? t(`action_${action}_title`) : ""}
      description={action ? t(`action_${action}_description`) : null}
      confirmLabel={action ? t(`action_${action}_confirm`) : null}
      tone={action && DANGER_ACTIONS.has(action) ? "danger" : "default"}
      reason={action === "damage" ? "required" : "optional"}
      reasonPlaceholder={t("reasonPlaceholder")}
      busy={pending}
      testId="admin-piece-action-confirm"
      onConfirm={onConfirm}
    >
      {note ? <p className="text-sm text-white/70" data-testid="admin-piece-action-note">{note}</p> : null}
    </ConfirmDialog>
  );
}

function LifecycleStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const run = usePieceMutation(tag.id, t("pieceUpdated"));
  const [pending, setPending] = useState<PieceAction | null>(null);
  const can = (action: LifecycleAction) => planTransition(tag, action).ok;
  const activatePlan = planTransition(tag, "activate");
  const damaged = tag.stockStatus === "damaged";
  const canDamage = tag.status === "inventory" && tag.repId === null && tag.leadId === null && (tag.stockStatus === "available" || tag.stockStatus === "pending");

  // Going live never moves stock: a rep's piece stays theirs, a house piece stays house stock (shared/tagAccess.ts).
  const holderNote = tag.repId !== null
    ? t("activateHolderRep", { name: tag.repName ?? t("resellerNumber", { id: tag.repId }) })
    : t("activateHolderHouse");

  const confirm = (reason: string) => {
    if (!pending) return;
    run.mutate({ url: actionUrl(tag.id, pending), body: { reason } }, { onSettled: () => setPending(null) });
  };

  return (
    <div className="space-y-3">
      <p className={STEP_TITLE}>{t("stepLive")}</p>
      {damaged ? (
        <div data-testid="admin-piece-damaged-banner">
          <InlineAlert tone="error" icon={Ban}>{t("damagedExplain")}</InlineAlert>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {tag.destinationUrl ? (
          <Button type="button" variant="secondary" onClick={() => tag.destinationUrl && window.open(tag.destinationUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-3.5 w-3.5" />{t("testDestination")}
          </Button>
        ) : null}
        {!damaged && tag.status !== "active" && tag.status !== "retired" ? (
          <Button type="button" variant="brand" accent="tags" disabled={!activatePlan.ok || run.isPending} onClick={() => setPending("activate")} data-testid="admin-piece-activate">
            <Power className="h-3.5 w-3.5" />{t("action_activate_confirm")}
          </Button>
        ) : null}
        {!damaged && can("disable") ? (
          <Button type="button" variant="secondary" disabled={run.isPending} onClick={() => setPending("disable")} data-testid="admin-piece-disable">
            <PowerOff className="h-3.5 w-3.5" />{t("action_disable_confirm")}
          </Button>
        ) : null}
        {/* "Clear customer": the piece keeps its holder. A sold piece keeps its customer (the server refuses). */}
        {!damaged && can("unassign") && tag.saleId === null ? (
          <Button type="button" variant="secondary" disabled={run.isPending} onClick={() => setPending("unassign")} data-testid="admin-piece-clear-customer">
            <Undo2 className="h-3.5 w-3.5" />{t("action_unassign_confirm")}
          </Button>
        ) : null}
        {!damaged && can("retire") ? (
          <Button type="button" variant="danger" disabled={run.isPending} onClick={() => setPending("retire")}>
            <Archive className="h-3.5 w-3.5" />{t("action_retire_confirm")}
          </Button>
        ) : null}
        {!damaged && can("restore") ? (
          <Button type="button" variant="secondary" disabled={run.isPending} onClick={() => setPending("restore")}>
            <RotateCcw className="h-3.5 w-3.5" />{t("action_restore_confirm")}
          </Button>
        ) : null}
        {canDamage ? (
          <Button type="button" variant="danger" disabled={run.isPending} onClick={() => setPending("damage")} data-testid="admin-piece-damage">
            <Ban className="h-3.5 w-3.5" />{t("action_damage_confirm")}
          </Button>
        ) : null}
      </div>
      {!damaged && tag.status !== "active" && tag.status !== "retired" && !activatePlan.ok ? <p className="text-xs text-white/40">{t(activateBlockerKey(tag))}</p> : null}
      {tag.status === "active" ? <p className="text-xs text-emerald-400">{t("liveExplain")}</p> : null}
      {!damaged && can("unassign") && tag.saleId !== null ? <p className="text-xs text-white/40" data-testid="admin-piece-clear-customer-sold">{t("clearCustomerSold")}</p> : null}
      <ActionDialog action={pending} note={pending === "activate" ? holderNote : null} onClose={() => setPending(null)} onConfirm={confirm} pending={run.isPending} />
    </div>
  );
}

// ─── Label / product ──────────────────────────────────────────────────────────

function DetailsStep({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const tb = useT(manageTagsBatchesMessages);
  const labels = useTagLabels();
  const isAdmin = useIsSuperAdmin();
  const [label, setLabel] = useState(tag.label ?? "");
  const [productType, setProductType] = useState<string>(tag.productType);
  const [face, setFace] = useState<string>(tag.ownFace ?? "");
  // A piece with no catalog product (its own or its batch's) can never be sold: the admin can map it here.
  const missingProduct = isAdmin && tag.salesProductId === null;
  const [salesProductId, setSalesProductId] = useState("");
  const { data: catalog = [] } = useTagCatalog();
  const save = usePieceMutation(tag.id, t("pieceSaved"));
  const dirty = label.trim() !== (tag.label ?? "") || productType !== tag.productType || (face || null) !== tag.ownFace || !!salesProductId;
  if (tag.status === "retired" || tag.stockStatus === "damaged") return null;
  return (
    <details className="group space-y-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        {t("pieceSettings")}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {missingProduct ? (
          <Field label={tb("fieldCatalogProduct")} hint={<span className="text-amber-300/80">{t("noCatalogProduct")}</span>} className="sm:col-span-2">
            <Select value={salesProductId} onChange={(e) => setSalesProductId(e.target.value)} placeholder={tb("chooseCatalogProduct")} options={catalogOptions(catalog)} data-testid="admin-piece-catalog" />
          </Field>
        ) : null}
        <Field label={t("productType")}>
          <Select value={productType} onChange={(e) => setProductType(e.target.value)} options={labels.productOptions} />
        </Field>
        <Field label={t("internalLabel")}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={t("optional")} />
        </Field>
        <Field label={tg("printedOnPiece")} className="sm:col-span-2">
          <Select value={face} onChange={(e) => setFace(e.target.value)} placeholder={tag.batchCode ? t("sameAsBatch") : t("fromProduct")} options={labels.faceOptions} />
        </Field>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!dirty || !productType}
        loading={save.isPending}
        onClick={() => save.mutate({ method: "PATCH", body: { label, productType, face: face || null, ...(salesProductId ? { salesProductId: Number(salesProductId) } : {}) } })}
      >
        {t("saveDetails")}
      </Button>
    </details>
  );
}

// ─── Reseller ─────────────────────────────────────────────────────────────────

const HOUSE = "house";

/**
 * Move an unsold piece in stock to another reseller (a stock transfer: they become its custodian of company stock)
 * or back to house stock (a return). Server: setTagRep. Sold and set-up pieces cannot move from here.
 */
function ResellerField({ tag }: { tag: TagDetail }) {
  const t = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const labels = useTagLabels();
  const { data: reps = [], error } = useReps();
  const current = tag.repId ? String(tag.repId) : HOUSE;
  const [choice, setChoice] = useState<string>(current);
  const [confirming, setConfirming] = useState(false);
  const move = usePieceMutation(tag.id, t("resellerUpdated"));
  const options = [{ value: HOUSE, label: t("houseStockNoReseller") }, ...reps.map((r) => ({ value: String(r.id), label: labels.repOption(r) }))];
  if (tag.repId && !options.some((o) => o.value === current)) options.push({ value: current, label: tag.repName ?? t("resellerNumber", { id: tag.repId }) });
  const target = choice === HOUSE ? t("houseStockTarget") : options.find((o) => o.value === choice)?.label ?? t("thisReseller");
  // The server's rules (repository setTagRep), said before the click.
  const blocker = tag.saleId !== null ? t("moveBlockedSold")
    : tag.stockStatus !== "available" ? t("moveBlockedStock")
    : tag.status !== "inventory" ? t("moveBlockedSetUp")
    : null;
  const consequences = [
    choice === HOUSE ? t("moveToHouseConsequence") : t("moveToRepConsequence", { target }),
    tag.kitId ? t("moveLeavesKit") : null,
  ].filter(Boolean).join(" ");

  const submit = () => {
    if (choice === current || blocker) return;
    setConfirming(true);
  };

  return (
    <div className="space-y-1.5">
      <p className={EYEBROW}>{tg("colReseller")}</p>
      <p className="text-sm text-white/80">
        {tag.repName ?? (tag.repId ? t("resellerNumber", { id: tag.repId }) : t("houseStock"))}
        {tag.kitId ? <span className="text-xs text-white/40"> · {t("inKit")}</span> : null}
      </p>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select value={choice} onChange={(e) => setChoice(e.target.value || HOUSE)} options={options} aria-label={tg("colReseller")} data-testid="admin-piece-rep" />
        </div>
        <Button type="button" variant="secondary" className="shrink-0" disabled={!!blocker || choice === current} loading={move.isPending} onClick={submit} data-testid="admin-piece-rep-move">
          <Truck className="h-3.5 w-3.5" />{t("move")}
        </Button>
      </div>
      {blocker ? <p className="text-xs text-white/40" data-testid="admin-piece-move-blocked">{blocker}</p> : null}
      {error ? <p className="text-xs text-red-300">{t("resellersFailed")}</p> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("moveTitle", { code: tag.publicCode, target })}
        description={consequences}
        confirmLabel={t("move")}
        busy={move.isPending}
        onConfirm={() =>
          move.mutate(
            { url: `/api/xpot/admin/tags/${tag.id}/rep`, method: "PATCH", body: { repId: choice === HOUSE ? null : Number(choice) } },
            { onSettled: () => setConfirming(false) },
          )
        }
      />
      {tag.soldAt ? <p className="text-xs text-white/40">{t("saleCounted", { date: formatDateTime(tag.soldAt) })}</p> : null}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Back({ go }: { go: Go }) {
  const ts = useT(shellMessages);
  return (
    <span data-testid="admin-piece-back">
      <BackLink onBack={() => go("/pieces")}>{ts("managePieces")}</BackLink>
    </span>
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
  const { data: tag, isLoading, error, refetch } = useQuery<TagDetail>({
    queryKey: [ADMIN_TAGS_KEY, "piece", id],
    queryFn: () => getJson(`/api/xpot/tags/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
    retry: (count, err) => !(err instanceof AdminHttpError && err.status < 500) && count < 2,
  });

  if (isLoading) return <Loading rows={5} />;
  if (error || !tag) {
    const notFound = error instanceof AdminHttpError && error.status === 404;
    return (
      <div className="space-y-3">
        <Back go={go} />
        {notFound ? (
          <EmptyState tone="tags" icon={Ban} title={t("notFound")} />
        ) : (
          <LoadError what={t("whatThisPiece")} error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const qrBase = `/api/xpot/admin/tags/${tag.id}`;

  return (
    <div className="min-w-0 space-y-4" data-testid="admin-piece-detail">
      <Back go={go} />

      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <TagPieceVisual productType={tag.productType} face={tag.face} size="md" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={CODE_HEADING} data-testid="admin-piece-code">{tag.publicCode}</h2>
            <PieceStatusPill status={tag.status} stockStatus={tag.stockStatus} saleId={tag.saleId} />
          </div>
          <div className="flex flex-wrap items-center gap-y-1 text-sm text-white/50">
            {tagPlaqueSpec(tag.productType, tag.face, tag.batchCode).model ? (
              <TagModelChips productType={tag.productType} face={tag.face} batchCode={tag.batchCode} className="mr-2" />
            ) : (
              <span className="mr-2">{labels.product(tag.productType)}</span>
            )}
            <span>{labels.face(tag.face)}</span>
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

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* key: re-seed the forms whenever the saved piece changes */}
        <section className={`${CARD} min-w-0 space-y-6 p-4`} key={`${tag.id}-${tag.updatedAt}`}>
          <CustomerStep tag={tag} />
          <div className="border-t border-white/10" />
          <DestinationStep tag={tag} />
          <div className="border-t border-white/10" />
          <LifecycleStep tag={tag} />
          <div className="border-t border-white/10" />
          <DetailsStep tag={tag} />
        </section>

        <section className={`${CARD} min-w-0 space-y-4 p-4`} key={`side-${tag.id}-${tag.updatedAt}`}>
          <div className="mx-auto w-44 rounded-xl bg-white p-2">
            <img src={`${qrBase}/qr.svg?v=${encodeURIComponent(tag.publicCode)}`} alt={t("qrAlt", { code: tag.publicCode })} className="h-full w-full" />
          </div>
          <Dl>
            <Row label={t("rowScans")} value={`QR ${tag.qrInteractions} · NFC ${tag.nfcInteractions}`} />
            <Row label={t("colLastInteraction")} value={formatDateTime(tag.lastInteractionAt)} />
          </Dl>
          <div className="border-t border-white/10" />
          <ResellerField tag={tag} />
          <div className="border-t border-white/10" />
          {/* Rarely needed: the QR is printed and the chip is written by the NFC tools. */}
          <details className="group" data-testid="admin-piece-technical">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              {t("technicalDetails")}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <CopyRow label={t("qrUrlLabel")} value={tag.qrUrl} />
                <p className="mt-1 text-xs text-white/40">{t("qrUrlHint")}</p>
              </div>
              <div>
                <CopyRow label={t("nfcUrlLabel")} value={tag.nfcUrl} />
                <p className="mt-1 text-xs text-white/40">{t("nfcUrlHint")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/40">{t("downloadQr")}</span>
                <Button asChild variant="secondary" size="sm" className="min-h-10">
                  <a href={`${qrBase}/qr.svg?download=1`} download={`${tag.publicCode}.svg`}>
                    <Download className="h-3.5 w-3.5" />SVG
                  </a>
                </Button>
                <Button asChild variant="secondary" size="sm" className="min-h-10">
                  <a href={`${qrBase}/qr.png?download=1`} download={`${tag.publicCode}.png`}>
                    <Download className="h-3.5 w-3.5" />PNG
                  </a>
                </Button>
              </div>
              {/* Only the dates that happened. */}
              <Dl>
                {tag.assignedAt ? <Row label={t("rowAssigned")} value={formatDateTime(tag.assignedAt)} /> : null}
                {tag.activatedAt ? <Row label={t("rowActivated")} value={formatDateTime(tag.activatedAt)} /> : null}
                {tag.disabledAt ? <Row label={t("rowDisabled")} value={formatDateTime(tag.disabledAt)} /> : null}
                <Row label={t("rowCreated")} value={formatDateTime(tag.createdAt)} />
              </Dl>
            </div>
          </details>
        </section>
      </div>

      {/* Writing the chip is the global admin's (NFC writers); managers don't get the card. */}
      {isAdmin && (
        <NfcProvisioningCard tagId={tag.id} publicCode={tag.publicCode} nfcUrl={tag.nfcUrl} retired={tag.status === "retired" || tag.stockStatus === "damaged"} onOpenWriters={() => go("/provisioners")} />
      )}

      {/* Admin only: renders nothing (and sends no request) for managers. */}
      <JourneyPanel scope={{ tagId: tag.id }} title={t("journeyTitle")} />

      <SectionCard accent="tags" icon={History} title={t("destinationHistory")} bodyClassName="px-4 py-2">
        {tag.history.length === 0 ? (
          <EmptyState compact dense tone="tags" icon={History} title={t("noDestinationYet")} cardStyle={{}} />
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
      </SectionCard>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <BarChart3 className={`h-4 w-4 ${MODULE_ACCENT.tags.text}`} aria-hidden="true" />
            {t("analytics")}
          </h2>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <AnalyticsPanel scopeUrl={`/api/xpot/admin/tags/${tag.id}/analytics`} range={range} />
      </div>
    </div>
  );
}
