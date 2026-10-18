import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Contact, ExternalLink, Link2, Mail, Pencil, Phone, Power, Settings2, Unlink, UserRound } from "lucide-react";
import { defaultUtmEnabled, planTransition, stockBlock, TAG_DESTINATION_TYPES, type TagDestinationType } from "@shared/tags";
import { contentKindOf, contentSummary, validateChipContent, type ChipContentKind } from "@shared/chipContent";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { buildReviewUrl } from "@shared/reviewLink";
import type { FullSalesLead } from "@/pages/xpot/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Field, Input } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { SwitchRow } from "@/components/xpot/SwitchRow";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import LeadPicker, { leadPayload, type LeadChoice } from "@/pages/tags/LeadPicker";
import { GenerateReviewButton, ReviewLinkAssist } from "@/pages/tags/ReviewLinkSheet";
import { ContentEditor, type ContentState } from "@/pages/tags/ContentEditor";
import { errorText, getSellTo, haptic, shortUrl } from "@/pages/tags/lib";
import { BottomSheet, CARD_ACCENT, CopyButton, EYEBROW, FieldLabel, INPUT_ACCENT, LinkInput, SheetActions } from "@/pages/tags/ui";
import { usePiece, usePieceWrite } from "./PieceContext";
import { pieceActionUrl, type PieceAction } from "./pieceView";

// Customer & destination: whose piece it is, where a scan or tap sends people,
// and whether it is live. One editor and one save for both screens: the reseller
// saves and goes live in one step (quick-activate); management saves the customer
// and the destination (with tracking and a reason) and puts it live on its own.

const isDestinationType = (value: string | null): value is TagDestinationType =>
  !!value && (TAG_DESTINATION_TYPES as readonly string[]).includes(value);

const KIND_ICON = { url: Link2, email: Mail, phone: Phone, vcard: Contact } as const;

/** Lifecycle confirms: title, description and button are manageTagsPieces action_<action>_*. */
type ConfirmAction = Extract<PieceAction, "activate" | "disable" | "unassign">;

export function CustomerDestinationSection() {
  const { tag, viewer, notify, banner, refresh } = usePiece();
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tm = useT(manageTagsPiecesMessages);
  const qc = useQueryClient();
  const write = usePieceWrite();
  const manage = viewer.surface === "admin";
  const { data: leads } = useQuery<FullSalesLead[]>({ queryKey: ["/api/xpot/leads"], staleTime: 60_000 });

  // The editor (a pop-up), seeded from the piece each time it opens.
  const [editing, setEditing] = useState(false);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [lead, setLead] = useState<LeadChoice>(null);
  const [kind, setKind] = useState<ChipContentKind>("url");
  const [link, setLink] = useState("");
  const [content, setContent] = useState<ContentState>({ value: null, error: null });
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [utmEnabled, setUtmEnabled] = useState(tag.utmEnabled);
  const [utmTouched, setUtmTouched] = useState(false);
  const [utmCampaign, setUtmCampaign] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toggling, setToggling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const seed = (clearForNewCustomer: boolean) => {
    const stored = clearForNewCustomer ? null : tag.destinationUrl;
    const storedKind = contentKindOf(stored);
    setKind(storedKind);
    setLink(storedKind === "url" ? stored ?? "" : "");
    setInitialContent(storedKind === "url" ? null : stored);
    setLabel(tag.label ?? "");
    setUtmEnabled(tag.utmEnabled);
    setUtmTouched(false);
    setUtmCampaign(tag.utmCampaign ?? "");
    setReason("");
  };

  const openEditor = (changeCustomer = false) => {
    setRenameOpen(false);
    setChangingCustomer(changeCustomer);
    setLead(null);
    // Another company: the old one's link must not carry over to the new one.
    seed(changeCustomer);
    setEditing(true);
  };

  // Selling during a visit (field app): an unsold piece goes straight to set-up for the visit's customer.
  useEffect(() => {
    if (manage || tag.leadId) return;
    const sellTo = getSellTo();
    if (!sellTo) return;
    seed(false);
    setLead({ leadId: sellTo.leadId, name: sellTo.name, placeId: sellTo.placeId });
    if (sellTo.placeId && !tag.destinationUrl) setLink(buildReviewUrl(sellTo.placeId));
    setEditing(true);
  }, [tag.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeEditor = () => {
    setEditing(false);
    setChangingCustomer(false);
    setLead(null);
  };

  const needsLead = !tag.leadId || changingCustomer;
  const ownLead = tag.leadId ? leads?.find((l) => l.id === tag.leadId) : undefined;
  const leadPlace = needsLead ? lead?.placeId ?? null : ownLead?.googlePlaceId ?? null;
  const leadPlaceName = needsLead ? lead?.name ?? "" : tag.leadName ?? "";
  const live = tag.status === "active";
  const paused = tag.status === "disabled";
  const retired = tag.status === "retired" || tag.stockStatus === "damaged";
  const stock = stockBlock(tag.stockStatus);
  // The server refuses moving a live piece to another customer (pause it first).
  const blockedByLive = live && changingCustomer && !!tag.leadId;

  // What the piece will open: a link, or an email / phone / contact from the kind tabs.
  const raw = kind === "url" ? normalizeUrlInput(link) : content.value ?? "";
  const check = raw ? validateChipContent(raw, { allowHttp: manage ? import.meta.env.DEV : true }) : null;
  const value = check?.ok ? check.value : null;
  const destinationType = value ? (kind === "url" ? guessDestinationType(value) : kind) : null;
  const utm = utmTouched ? utmEnabled : destinationType && destinationType !== tag.destinationType ? defaultUtmEnabled(destinationType) : utmEnabled;

  const save = async () => {
    if (!value || !destinationType) return notify({ tone: "error", text: kind === "url" ? t("invalidLink") : content.error ?? t("invalidLink") });
    if (needsLead && !lead) return notify({ tone: "error", text: t("chooseCustomer") });
    setSaving(true);
    try {
      if (manage) {
        // Management: the customer first (a new name becomes a company of the piece's holder), then the destination.
        if (needsLead && lead) await write("POST", `/api/xpot/admin/tags/${tag.id}/assign`, leadPayload(lead));
        await write("PATCH", `/api/xpot/admin/tags/${tag.id}`, {
          destinationType,
          destinationUrl: value,
          utmEnabled: kind === "url" ? utm : false,
          utmCampaign: kind === "url" ? utmCampaign : "",
          label,
          reason,
        });
        notify({ tone: "ok", text: tm("destinationSaved") });
      } else {
        await write("POST", `/api/xpot/tags/${tag.id}/quick-activate`, {
          destinationUrl: value,
          destinationType,
          // Empty clears the label (the server turns "" into null).
          label,
          ...(needsLead ? leadPayload(lead) : {}),
        });
        haptic([40, 30, 40]);
        notify({ tone: "ok", text: t("savedLive") });
      }
      if (lead && !lead.leadId) void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      closeEditor();
    } catch (err) {
      notify({ tone: "error", text: errorText(err, tc("requestFailed")) });
      // A customer may have been saved before the destination failed.
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    const name = newName.trim();
    if (!name || !tag.leadId) return;
    setRenaming(true);
    try {
      await apiRequest("PATCH", `/api/xpot/leads/${tag.leadId}`, { name });
      refresh();
      void qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      setRenameOpen(false);
      notify({ tone: "ok", text: t("customerRenamed") });
    } catch (err) {
      notify({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setRenaming(false);
    }
  };

  const run = async (action: ConfirmAction, actionReason?: string) => {
    setActionError(null);
    try {
      await write("POST", pieceActionUrl(viewer.surface, action, tag.id), actionReason ? { reason: actionReason } : {});
      if (action === "unassign") void qc.invalidateQueries({ queryKey: ["tags", "lead-pieces"] });
      notify({
        tone: "ok",
        text: action === "unassign" ? t("customerUnlinked") : action === "disable" ? t("switchedOff") : t("switchedOn"),
      });
    } catch (err) {
      const text = errorText(err, tc("requestFailed"));
      setActionError(text);
      throw err;
    }
  };

  // Pause / Put live again is one tap on the reseller screen; management confirms with a reason.
  // The first time live always confirms: going live is not a sale, and it says who keeps the piece.
  const toggle = async () => {
    const action: ConfirmAction = live ? "disable" : "activate";
    if (manage || tag.status === "assigned") {
      setActionError(null);
      return setConfirm(action);
    }
    setToggling(true);
    try {
      await run(action);
    } catch (err) {
      notify({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setToggling(false);
    }
  };

  const activatePlan = planTransition(tag, "activate");
  const canToggle = !retired && (live || (activatePlan.ok && (paused || tag.status === "assigned")));
  const canClearCustomer = !retired && !!tag.leadId && planTransition(tag, "unassign").ok;
  const holderNote = tag.repId !== null
    ? tm("activateHolderRep", { name: tag.repName ?? tm("resellerNumber", { id: tag.repId }) })
    : tm("activateHolderHouse");

  const dest = tag.destinationUrl;
  const destKind = contentKindOf(dest);
  const KindIcon = KIND_ICON[destKind];
  const destDisplay = !dest ? null : destKind === "url" ? shortUrl(dest) : contentSummary(dest);
  const destType = destKind === "url"
    ? (isDestinationType(tag.destinationType) ? t(`dest_${tag.destinationType}`) : tag.destinationType)
    : t(`contentKind_${destKind}`);

  return (
    <section className={`${CARD_ACCENT} p-4`} data-testid="destination-hero">
      <div className="flex items-center justify-between gap-2">
        <p className={EYEBROW}>{t("setupTitle")}</p>
        {dest && !retired && (
          <Button type="button" variant="outline" size="sm" onClick={() => openEditor(false)} data-testid="button-change-destination">
            <Pencil />
            {t("changeDestination")}
          </Button>
        )}
      </div>

      {tag.leadId ? (
        <div className="mt-2 flex items-center gap-1">
          <Building2 className="h-4 w-4 shrink-0 text-white/40" />
          <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-white/80" data-testid="text-tag-lead">
            {tag.leadName ?? tm("customerNumber", { id: tag.leadId })}
          </p>
          {!retired && (
            <>
              <button
                type="button"
                onClick={() => {
                  setNewName(tag.leadName ?? "");
                  setRenameOpen(true);
                }}
                aria-label={t("renameCustomer")}
                title={t("renameCustomer")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/45 hover:bg-white/10 hover:text-white active:bg-white/10"
                data-testid="button-edit-customer"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => openEditor(true)} className="min-h-10" data-testid="button-change-customer">
                <UserRound />
                {t("changeCustomerShort")}
              </Button>
            </>
          )}
        </div>
      ) : dest ? (
        // Set up without a customer (made before the picker was required): Change customer links one.
        <p className="mt-2 flex items-center gap-2 text-sm text-white/45" data-testid="text-tag-lead">
          <Building2 className="h-4 w-4 shrink-0 text-white/30" />
          {t("noCustomer")}
        </p>
      ) : null}

      {dest ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
            <KindIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            {destKind === "vcard" ? (
              <p className="truncate text-lg font-bold text-white">{destDisplay}</p>
            ) : (
              <a href={dest} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-lg font-bold text-white underline-offset-2 hover:underline active:underline" data-testid="link-destination">
                <span className="truncate">{destDisplay}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-violet-300" />
              </a>
            )}
            {destType && <p className="truncate text-xs text-white/50">{destType}{manage && tag.utmEnabled && destKind === "url" ? " · UTM" : ""}</p>}
          </div>
          {destKind !== "vcard" && <CopyButton text={dest} label={t("copyLink")} />}
        </div>
      ) : (
        <>
          <p className="mt-2 text-lg font-bold text-white/55">{t("notYetWritten")}</p>
          {/* The server refuses setting up a piece that is not in stock (shared/tags.ts planTransition). */}
          {stock && (
            <div className="mt-2" data-testid="text-stock-blocked">
              <InlineAlert tone="warning">{t(`stockBlocked_${stock}`)}</InlineAlert>
            </div>
          )}
          {!retired && (
            <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => openEditor(false)} disabled={!!stock} className="mt-3 w-full" data-testid="button-setup-piece">
              <Settings2 className="!size-5" />
              {t("configurePiece")}
            </Button>
          )}
        </>
      )}

      {/* Live or not, and the customer: the same verbs on both screens. */}
      {(canToggle || canClearCustomer || (tag.leadId && tag.saleId !== null)) && (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.08] pt-3 sm:flex-row sm:flex-wrap">
          {canToggle && (
            <Button type="button" variant="secondary" onClick={() => void toggle()} loading={toggling} disabled={toggling} className="w-full sm:w-auto" data-testid="button-toggle">
              <Power className={`!size-4 ${live ? "text-red-400" : "text-emerald-400"}`} />
              {live ? t("switchOff") : paused ? t("switchOn") : tm("action_activate_confirm")}
            </Button>
          )}
          {canClearCustomer && tag.saleId === null && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setActionError(null);
                setConfirm("unassign");
              }}
              className="w-full sm:w-auto"
              data-testid="button-unlink-piece"
            >
              <Unlink className="!size-4 text-red-400" />
              {t("unlinkFromCustomer")}
            </Button>
          )}
          {tag.leadId && tag.saleId !== null && <p className="text-xs text-white/40 sm:self-center" data-testid="admin-piece-clear-customer-sold">{tm("clearCustomerSold")}</p>}
        </div>
      )}
      {live && <p className="mt-2 text-xs text-emerald-400/90">{tm("liveExplain")}</p>}
      {!live && !retired && tag.status !== "inventory" && !activatePlan.ok && tag.status !== "disabled" ? (
        <p className="mt-2 text-xs text-white/40">{tm(!tag.leadId ? "activateNeedsCustomer" : !tag.destinationType ? "activateNeedsType" : "activateNeedsUrl")}</p>
      ) : null}

      {/* The editor: the customer first (when choosing one), then what the piece opens. */}
      <BottomSheet open={editing} onClose={closeEditor} title={changingCustomer ? t("changeCustomer") : dest ? t("editDestination") : t("configurePiece")} banner={banner}>
        <div className="space-y-4" data-testid="destination-editor">
          {!needsLead && tag.leadName && (
            <p className="flex items-center gap-2 text-sm text-white/60">
              <Building2 className="h-4 w-4 shrink-0 text-white/40" />
              <span className="truncate">{tag.leadName}</span>
            </p>
          )}
          {needsLead && (
            <div>
              <FieldLabel>{t("customerField")}</FieldLabel>
              <LeadPicker value={lead} onChange={setLead} />
              {changingCustomer && tag.destinationUrl ? <p className="mt-1.5 text-xs text-amber-200/80">{t("linkClearedForNewCustomer")}</p> : null}
            </div>
          )}
          {blockedByLive && <InlineAlert tone="warning">{tm("disableBeforeMove")}</InlineAlert>}
          {/* Only where a review link makes sense: a Google review piece, or a customer matched to their Google place. */}
          {(needsLead ? lead : tag.leadId) && leadPlaceName && (leadPlace || tag.face === "google_review") && (
            <GenerateReviewButton
              name={leadPlaceName}
              placeId={leadPlace}
              currentLink={link}
              onLink={(url, place) => {
                setKind("url");
                setLink(url);
                notify({ tone: "ok", text: place?.name || leadPlaceName ? t("reviewReady", { name: place?.name || leadPlaceName }) : t("reviewReadyNoName") });
              }}
            />
          )}
          <ContentEditor
            kind={kind}
            onKind={setKind}
            initial={initialContent}
            onChange={setContent}
            urlField={
              <div>
                <FieldLabel>{t("linkField")}</FieldLabel>
                <LinkInput value={link} onChange={setLink} face={tag.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => notify({ tone: "error", text: tc("pasteFailed") })} />
                <ReviewLinkAssist
                  link={link}
                  onPick={(place) => {
                    setLink(place.reviewUrl);
                    notify({ tone: "ok", text: place.name ? t("reviewReady", { name: place.name }) : t("reviewReadyNoName") });
                  }}
                />
              </div>
            }
          />
          <Field label={t("labelField")}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} maxLength={120} className={INPUT_ACCENT} />
          </Field>
          {manage && kind === "url" && (
            <div className="space-y-2">
              <SwitchRow
                checked={utm}
                onCheckedChange={(v) => {
                  setUtmEnabled(v);
                  setUtmTouched(true);
                }}
                label={tm("utmLabel")}
                hint={tm("utmHint")}
              />
              {utm && (
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder={tm("utmCampaignPlaceholder")} aria-label={tm("utmCampaignPlaceholder")} maxLength={80} className={INPUT_ACCENT} />
              )}
            </div>
          )}
          {manage && tag.destinationUrl && (
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tm("changeReasonPlaceholder")} aria-label={tm("changeReasonPlaceholder")} maxLength={300} className={INPUT_ACCENT} />
          )}
          <SheetActions>
            <Button
              type="button"
              variant="brand"
              accent="tags"
              size="lg"
              onClick={() => void save()}
              loading={saving}
              disabled={saving || blockedByLive || !value || (needsLead && !lead)}
              className="w-full"
              data-testid="button-save-activate"
            >
              <Check className="!size-5" />
              {manage ? tm("saveDestination") : live ? t("saveLink") : t("saveAndGoLive")}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={closeEditor} className="w-full">
              {tc("cancel")}
            </Button>
          </SheetActions>
        </div>
      </BottomSheet>

      {/* Fix the customer's name, or give the piece to another customer. */}
      <BottomSheet open={renameOpen} onClose={() => setRenameOpen(false)} title={t("renameCustomer")} banner={banner}>
        <div className="space-y-4">
          <Field label={t("customerName")} hint={t("renameHint")}>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} autoCapitalize="words" className={INPUT_ACCENT} data-testid="input-customer-name" />
          </Field>
          <SheetActions>
            <Button
              type="button"
              variant="brand"
              accent="tags"
              size="lg"
              onClick={() => void rename()}
              loading={renaming}
              disabled={renaming || !newName.trim() || newName.trim() === tag.leadName}
              className="w-full"
            >
              <Check className="!size-5" />
              {t("saveName")}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => openEditor(true)} className="w-full" data-testid="button-rename-change-instead">
              <UserRound className="!size-5" />
              {t("changeCustomer")}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setRenameOpen(false)} className="w-full">
              {tc("cancel")}
            </Button>
          </SheetActions>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        tone={confirm === "activate" ? "default" : "danger"}
        title={confirm === "unassign" ? t("customerUnlinkTitle", { code: tag.publicCode }) : confirm ? tm(`action_${confirm}_title`) : ""}
        description={confirm === "unassign" ? (manage ? tm("action_unassign_description") : t("customerUnlinkHint")) : confirm ? tm(`action_${confirm}_description`) : null}
        confirmLabel={confirm === "unassign" ? t("customerUnlink") : confirm === "disable" ? t("switchOff") : confirm === "activate" ? (paused ? t("switchOn") : tm("action_activate_confirm")) : null}
        reason={manage ? "optional" : undefined}
        reasonPlaceholder={tm("reasonPlaceholder")}
        error={actionError}
        testId={confirm === "unassign" ? "button-unlink-confirm" : "admin-piece-action-confirm"}
        onConfirm={(text?: string) => (confirm ? run(confirm, text) : undefined)}
      >
        {confirm === "activate" ? <p className="text-sm text-white/70" data-testid="admin-piece-action-note">{holderNote}</p> : null}
        {confirm === "unassign" && tag.leadName ? (
          <p className="flex items-center gap-2 text-sm text-white/70">
            <Building2 className="h-4 w-4 shrink-0 text-white/40" />
            <span className="truncate">{tag.leadName}</span>
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
