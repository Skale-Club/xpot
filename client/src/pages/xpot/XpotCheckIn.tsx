import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  MapPinned,
  Timer,
  Phone,
  Globe,
  Mail,
  Pencil,
  Nfc,
  DollarSign,
  Mic2,
  CircleCheck,
  MapPinOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { useXpotModules } from "@/components/ModuleSwitch";
import { setSellTo } from "@/pages/tags/lib";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useXpotShared } from "./hooks/useXpotShared";
import { Pill } from "@/components/xpot/StatusPill";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useLeads } from "./hooks/useLeads";
import { useCheckIn } from "./hooks/useCheckIn";
import { useVisits } from "./hooks/useVisits";
import { ConfirmSlider } from "./ConfirmSlider";
import { displayPhone, phoneHref } from "./utils";
import { formatTime } from "@/lib/format";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { visitsUiMessages } from "@/i18n/messages/visitsUi";
import { useToast } from "@/hooks/use-toast";
import { GoogleLogo } from "@/components/ui/google-logo";
import { CompanyInlineEditor } from "./components/leads/CompanyInlineEditor";
import { SocialLinks } from "./components/leads/socials";
import { InlineField } from "./components/InlineField";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { VisitRow } from "./components/VisitRow";
import { LiveMap } from "./components/LiveMap";
import { StatusPicker } from "./components/VisitStatus";
import type { VisitStatus } from "./components/VisitStatus";
import type { FullSalesLead, GoogleBusinessProfile, SalesLead } from "./types";
import { LeadSalesPanel } from "./components/sales/LeadSalesPanel";
import { VisitActionsPanel } from "./components/sales/VisitActions";
import { EYEBROW, GLASS_RAISED, GLASS_CLASS } from "@/components/xpot/surface";
import { useIsComputer } from "@/hooks/use-is-desktop";
import { PlaceLeadSearch } from "./components/PlaceLeadSearch";
import { CreateLeadDialog } from "./components/CreateLeadDialog";
import { CheckInOverrideDialog } from "./components/CheckInOverrideDialog";
import { placeUrl } from "./prospectingMaps";

type VisitLead = SalesLead & Partial<Pick<FullSalesLead, "locations" | "openOpportunities" | "unitsOnShelf">>;

/** Recordings bigger than this are refused by the server (same check as the visit summary). */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/**
 * The company editor of check-in: its name plus the same inline editor the
 * company page and the visit summary use (it saves each field as it is
 * left), shown in place instead of a separate modal form.
 */
function CheckInCompanyEditor({ lead, onDone }: { lead: VisitLead; onDone: () => void }) {
  const tu = useT(visitsUiMessages);
  const tl = useT(leadsMessages);
  const { toast } = useToast();
  function saveName(name: string) {
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { name: name || undefined })
      .then(() => {
        toast({ title: tl("leadUpdated"), variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      })
      .catch((error: Error) => toast({ title: tl("leadUpdateFailed"), description: error.message, variant: "destructive" }));
  }
  return (
    <div className="space-y-4" data-testid="check-in-company-editor">
      <div className="flex items-center justify-between gap-2">
        <div className={EYEBROW}>{tu("editCompany")}</div>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>{tu("doneEditing")}</Button>
      </div>
      <InlineField label={tu("businessName")} value={lead.name} onSave={saveName} />
      <CompanyInlineEditor lead={lead} />
    </div>
  );
}

function EditCompanyButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const tu = useT(visitsUiMessages);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={tu("editCompany")}
      title={tu("editCompany")}
      className={`text-white/45 ${className}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <Pencil aria-hidden="true" />
    </Button>
  );
}

function BriefMetric({ label, value, google }: { label: string; value: string; google?: boolean }) {
  return (
    <div className="min-w-0 px-1.5 py-2.5 text-center">
      <div className="flex min-h-5 items-center justify-center gap-1 text-base font-extrabold tabular-nums text-white">
        {google && <GoogleLogo className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{value}</span>
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-white/40">{label}</div>
    </div>
  );
}

function VisitAction({ icon: Icon, title, hint, onClick, tone = "indigo", testId }: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onClick: () => void;
  /** emerald = money (selling), violet = the Tags module, indigo = everything else. */
  tone?: "indigo" | "violet" | "emerald";
  testId?: string;
}) {
  const palette = tone === "violet"
    ? "border-violet-400/20 bg-violet-400/[0.07] text-violet-300"
    : tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
      : "border-blue-400/20 bg-blue-400/[0.07] text-blue-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[66px] min-w-0 items-center gap-2.5 rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] ${palette}`}
      data-testid={testId}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-sm font-bold text-white">{title}</strong>
        <span className="mt-0.5 block truncate text-[10px] text-white/40">{hint}</span>
      </span>
    </button>
  );
}

function ActiveLeadInfo({ lead, profile, profileLoading }: { lead: VisitLead; profile?: GoogleBusinessProfile; profileLoading: boolean }) {
  const t = useT(checkinMessages);
  const tl = useT(leadsMessages);
  const location = lead.locations?.[0];
  const address = location ? [location.addressLine1, location.city, location.state].filter(Boolean).join(", ") : "";
  const number = new Intl.NumberFormat(t.locale);
  const unknown = profileLoading ? "..." : t("notAvailable");
  const rating = profile?.rating != null ? profile.rating.toFixed(1) : unknown;
  const reviews = profile?.reviewCount != null ? number.format(profile.reviewCount) : unknown;
  const shelf = lead.unitsOnShelf != null ? number.format(lead.unitsOnShelf) : t("notAvailable");
  const deals = lead.openOpportunities != null ? number.format(lead.openOpportunities) : t("notAvailable");
  const websiteHref = lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : null;
  const mapsHref = profile?.mapsUrl || (address ? placeUrl(address) : null);

  return (
    <div>
      <div className="pr-9">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight text-white">{lead.name}</h2>
          {lead.industry && <Pill tone="slate">{lead.industry}</Pill>}
          {profile?.openNow != null && (
            <Pill tone={profile.openNow ? "green" : "amber"}>
              {profile.openNow ? t("businessOpen") : t("businessClosed")}
            </Pill>
          )}
        </div>
        {address && mapsHref && (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-blue-300/85 hover:text-blue-200">
            <MapPinned className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{address}</span>
          </a>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 divide-x divide-white/[0.07] rounded-xl bg-black/15" data-testid="visit-brief-metrics">
        <BriefMetric label={t("briefRating")} value={rating} google />
        <BriefMetric label={t("briefReviews")} value={reviews} google />
        <BriefMetric label={t("briefOnShelf")} value={shelf} />
        <BriefMetric label={t("briefOpenDeals")} value={deals} />
      </div>

      {(lead.phone || lead.email || websiteHref) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {lead.phone && (
            <a href={phoneHref(lead.phone)} className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-white/75">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{displayPhone(lead.phone)}</span>
            </a>
          )}
          {websiteHref && (
            <a href={websiteHref} target="_blank" rel="noreferrer" className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-white/75">
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{lead.website}</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="col-span-2 flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-white/75">
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
        </div>
      )}

      <div className="mt-3">
        <SocialLinks socials={lead.socialUrls} otherLabel={tl("socialOther")} />
      </div>
    </div>
  );
}

// Check-in is GPS-validated: without a fix there is nothing to validate
// against, so the page asks for location instead of pretending to work.
function LocationGate({
  permission,
  isLocating,
  error,
  onRetry,
  onContinueWithout,
}: {
  permission: string;
  isLocating: boolean;
  error?: string;
  onRetry: () => void;
  /** Computers only, when the organization allows overrides. */
  onContinueWithout?: () => void;
}) {
  const t = useT(checkinMessages);
  const blocked = permission === "denied";

  return (
    <div className="space-y-4">
      <div className={`px-1 ${EYEBROW}`}>{t("gateHeading")}</div>
      <div className={`space-y-4 rounded-2xl p-6 text-center ${GLASS_CLASS}`}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-500/15">
          <MapPinned className="h-6 w-6 text-blue-300" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <div className="text-lg font-bold text-white">{t("locationRequired")}</div>
          <p className="text-sm leading-relaxed text-white/50">
            {blocked
              ? t("locationBlocked")
              : t("locationNeeded")}
          </p>
        </div>

        {blocked ? (
          <div className={`rounded-2xl px-4 py-3 text-left text-xs leading-relaxed text-white/60 ${GLASS_CLASS}`}>
            {t("iphoneStep1")} <span className="text-white/80">{t("iphonePath")}</span>{t("iphoneStep2")}{" "}
            <span className="text-white/80">{t("iphoneOption")}</span>{t("iphoneStep3")}
          </div>
        ) : null}

        {error && !blocked ? <InlineAlert tone="error" className="text-left">{error}</InlineAlert> : null}

        <Button type="button" variant="brand" size="lg" onClick={onRetry} loading={isLocating} className="w-full" style={{ WebkitTapHighlightColor: "transparent" }}>
          <MapPinned aria-hidden="true" />
          {blocked ? t("enabledRetry") : t("shareLocation")}
        </Button>

        {onContinueWithout ? (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onContinueWithout}
              className="w-full"
              data-testid="check-in-without-location"
            >
              <MapPinOff aria-hidden="true" />
              {t("continueWithoutLocation")}
            </Button>
            <p className="text-xs leading-relaxed text-white/35">{t("continueWithoutLocationHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function XpotCheckIn() {
  const t = useT(checkinMessages);
  const tv = useT(visitsMessages);
  const { toast } = useToast();
  const tl = useT(leadsMessages);
  const { geoState, loadCurrentLocation, invalidateXpotData, permission, isLocating, hasLocation, setLiveTracking } = useXpotShared();
  const {
    selectedLeadId,
    setSelectedLeadId,
    selectedLead,
    checkInSearch,
    setCheckInSearch,
    checkInDropdownOpen,
    setCheckInDropdownOpen,
    checkInMutation,
    createLeadMutation,
    pickLocalLeadForCheckIn,
    pickGooglePlaceForCheckIn,
    overridePrompt,
    setOverridePrompt,
    confirmOverride,
    visitNoteForm,
    setVisitNoteForm,
    isRecording,
    recordingTime,
    audioBlob,
    setAudioBlob,
    setRecordingTime,
    startRecording,
    stopRecording,
    uploadAudioMutation,
    saveNoteMutation,
  } = useCheckIn();
  const { leadsQuery } = useLeads();
  const { activeVisit, checkOutMutation, cancelVisitMutation, visitsQuery } = useVisits();
  const [, navigate] = useLocation();
  const canSellTags = useXpotModules().includes("tags");
  const isComputer = useIsComputer();
  const { xpotMeQuery } = useXpotQueries();
  const checkInRules = xpotMeQuery.data?.checkInRules;
  // A computer that cannot get a fix may still check in, with a reason, when
  // the organization allows overrides. Phones keep the location gate.
  const [withoutLocation, setWithoutLocation] = useState(false);
  const canSkipLocation = isComputer && checkInRules?.allowManualOverride !== false;

  // Follow the rep while this screen is open on phones and computers. Modern
  // desktop browsers can provide location too, and the same geofence validation
  // decides whether the check-in is valid.
  useEffect(() => {
    setLiveTracking(true);
    return () => setLiveTracking(false);
  }, [setLiveTracking]);

  // Only a lead with real coordinates can be pinned on the map.
  const selectedLeadLocation = (() => {
    const loc = selectedLead?.locations?.[0];
    if (!loc?.lat || !loc?.lng) return null;
    return Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)) ? loc : null;
  })();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editLeadOpen, setEditLeadOpen] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<VisitStatus>("completed");
  const [createLeadDialogOpen, setCreateLeadDialogOpen] = useState(false);
  const [activeVisitPanel, setActiveVisitPanel] = useState<"sales" | "note" | "checkout" | "cancel" | null>(null);
  const activeLeadDetails: VisitLead | null = activeVisit?.lead
    ? (leadsQuery.data?.find((lead) => lead.id === activeVisit.lead!.id) ?? activeVisit.lead)
    : null;
  const googleProfileQuery = useQuery<GoogleBusinessProfile>({
    queryKey: ["/api/xpot/leads", activeLeadDetails?.id, "google-profile"],
    enabled: Boolean(activeLeadDetails?.id && activeLeadDetails.googlePlaceId),
    staleTime: 15 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!activeVisit?.checkedInAt) {
      setElapsedSeconds(0);
      return;
    }
    const checkedInAt = new Date(activeVisit.checkedInAt).getTime();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - checkedInAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeVisit?.checkedInAt]);

  const elapsedHours = Math.floor(elapsedSeconds / 3600);
  const elapsedMins = Math.floor((elapsedSeconds % 3600) / 60);
  const elapsedSecs = elapsedSeconds % 60;
  const elapsedDisplay = elapsedHours > 0
    ? `${elapsedHours}:${String(elapsedMins).padStart(2, "0")}:${String(elapsedSecs).padStart(2, "0")}`
    : `${elapsedMins}:${String(elapsedSecs).padStart(2, "0")}`;

  const uploadVisitNote = async ({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) => {
    // The same limit and message as the visit summary, before anything is sent.
    if (audioBlob.size > MAX_AUDIO_BYTES) {
      toast({ title: tv("recordingTooLarge"), description: tv("recordingTooLargeDesc"), variant: "destructive" });
      return;
    }
    const result = await uploadAudioMutation.mutateAsync({ audioBlob, durationSeconds });
    const heard = (result as { visitStatus?: string | null } | undefined)?.visitStatus;
    if (heard && heard !== "completed") setCheckoutStatus(heard as VisitStatus);
  };

  // A visit already in progress stays reachable even if the fix drops — the rep
  // must always be able to check out. The gate only guards starting one.
  if (!activeVisit && !hasLocation && !withoutLocation) {
    return (
      <LocationGate
        permission={permission}
        isLocating={isLocating}
        error={geoState.error}
        onRetry={() => void loadCurrentLocation()}
        onContinueWithout={canSkipLocation ? () => setWithoutLocation(true) : undefined}
      />
    );
  }

  if (activeVisit) return (
    <div className="space-y-4">
      {/* Active visit brief: customer context first, visit controls after it. */}
      <div
        className="relative space-y-3 overflow-hidden rounded-3xl p-4"
        style={{
          background: "linear-gradient(160deg, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.08) 100%)",
          border: "1px solid rgba(99,102,241,0.25)",
          boxShadow: "0 0 40px rgba(99,102,241,0.12), 0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* background glow blob */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
        />

        {/* The timer stays visible but no longer consumes the customer's briefing area. */}
        <div className="relative flex items-center justify-between gap-4 rounded-2xl bg-black/10 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" aria-hidden="true" />
              <span className={`truncate ${EYEBROW} !text-blue-200`}>{t("visitInProgress")}</span>
            </div>
            {activeVisit.checkedInAt && (
              <div className="mt-1 truncate text-[11px] text-white/40">{t("startedAt", { time: formatTime(activeVisit.checkedInAt) })}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Timer className="h-4 w-4 text-blue-300/60" aria-hidden="true" />
            <div className="font-mono text-2xl font-bold tabular-nums text-white" style={{ textShadow: "0 0 24px rgba(99,102,241,0.45)" }}>
              {elapsedDisplay}
            </div>
          </div>
        </div>

        {/* Company info */}
        <div
          className="relative rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {activeVisit.lead && !editLeadOpen && (
            <EditCompanyButton onClick={() => setEditLeadOpen(true)} className="absolute right-1.5 top-1.5" />
          )}
          {activeLeadDetails && editLeadOpen ? (
            <CheckInCompanyEditor lead={activeLeadDetails} onDone={() => { setEditLeadOpen(false); void invalidateXpotData(); }} />
          ) : activeLeadDetails ? (
            <ActiveLeadInfo
              lead={activeLeadDetails}
              profile={googleProfileQuery.data}
              profileLoading={googleProfileQuery.isLoading && Boolean(activeLeadDetails.googlePlaceId)}
            />
          ) : (
            <div className="text-center text-base font-semibold text-white">{t("leadNumber", { id: activeVisit.leadId })}</div>
          )}
        </div>

        {/* Actions are one tap away, while the visit brief remains fully visible. */}
        <div className="relative grid grid-cols-2 gap-2">
          {activeVisit.lead && (
            <VisitAction icon={DollarSign} title={t("visitSales")} hint={t("visitSalesHint")} tone="emerald" onClick={() => setActiveVisitPanel("sales")} />
          )}
          <VisitAction icon={Mic2} title={t("visitNote")} hint={t("visitNoteHint")} onClick={() => setActiveVisitPanel("note")} />
          {canSellTags && activeVisit.lead && (
            <VisitAction
              icon={Nfc}
              title={t("visitTags")}
              hint={t("visitTagsHint")}
              tone="violet"
              testId="button-sell-piece"
              onClick={() => {
                const lead = activeVisit.lead!;
                setSellTo({ leadId: lead.id, name: lead.name, placeId: lead.googlePlaceId ?? null });
                navigate("/tags");
              }}
            />
          )}
          <VisitAction icon={CircleCheck} title={t("finishVisit")} hint={t("finishVisitHint")} tone="emerald" onClick={() => setActiveVisitPanel("checkout")} />
        </div>

        {/* Secondary on purpose: a mistaken check-in is discarded, not checked out with an outcome. */}
        <div className="relative flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveVisitPanel("cancel")}
            disabled={cancelVisitMutation.isPending || checkOutMutation.isPending}
            className="text-white/50"
            data-testid="button-cancel-visit"
          >
            <XCircle aria-hidden="true" />
            {t("cancelVisit")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={activeVisitPanel === "cancel"}
        onOpenChange={(open) => { if (!open) setActiveVisitPanel(null); }}
        tone="danger"
        title={t("cancelVisitTitle")}
        description={t("cancelVisitDesc")}
        confirmLabel={t("cancelVisit")}
        cancelLabel={t("keepVisit")}
        testId="button-confirm-cancel-visit"
        // Stays open with the loader until the server answers; the hook leaves the screen on success.
        pending={cancelVisitMutation.isPending}
        onConfirm={() => cancelVisitMutation.mutate(undefined, { onSettled: () => setActiveVisitPanel(null) })}
      />

      {activeVisit.lead && (
        <Dialog open={activeVisitPanel === "sales"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pr-8"><DialogTitle className="text-base">{t("visitSales")}</DialogTitle></DialogHeader>
            <LeadSalesPanel leadId={activeVisit.lead.id} leadName={activeVisit.lead.name} visitId={activeVisit.id} compact />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={activeVisitPanel === "note"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pr-8"><DialogTitle className="text-base">{t("visitNote")}</DialogTitle></DialogHeader>
          <VoiceRecorder onUpload={uploadVisitNote} />
          <VisitActionsPanel visitId={activeVisit.id} onApplied={() => invalidateXpotData()} />
        </DialogContent>
      </Dialog>

      <Dialog open={activeVisitPanel === "checkout"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pr-8"><DialogTitle className="text-base">{t("finishVisit")}</DialogTitle></DialogHeader>
          <StatusPicker value={checkoutStatus} onChange={setCheckoutStatus} />
          <ConfirmSlider
            label={uploadAudioMutation.isPending ? t("uploadInProgress") : t("slideToCheckOut")}
            helperText=""
            loading={checkOutMutation.isPending || uploadAudioMutation.isPending}
            disabled={uploadAudioMutation.isPending || cancelVisitMutation.isPending}
            onConfirm={() => checkOutMutation.mutate({ status: checkoutStatus })}
            mode="check-out"
          />
        </DialogContent>
      </Dialog>

    </div>
  );

  return (
    <>
    <div className="space-y-4">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start lg:gap-6">
      <div className="space-y-4">
      <div className={`px-1 ${EYEBROW}`}>{t("checkInHeading")}</div>
      <div className="rounded-2xl" style={GLASS_RAISED}>
        <div className="px-4 py-5 space-y-5 sm:px-6">
          <PlaceLeadSearch
            value={checkInSearch}
            onChange={(next) => { setCheckInSearch(next); if (!next) setSelectedLeadId(""); }}
            leads={leadsQuery.data || []}
            geoState={geoState}
            placeholder={t("searchPlaceholder")}
            busy={createLeadMutation.isPending}
            onOpenChange={setCheckInDropdownOpen}
            onPickLead={(lead) => pickLocalLeadForCheckIn(lead)}
            onPickPlace={(place) => { void pickGooglePlaceForCheckIn(place).catch(() => {}); }}
            onCreate={() => setCreateLeadDialogOpen(true)}
            onNearby={() => { void loadCurrentLocation(); setCheckInSearch(t("nearbyQuery")); }}
          />

          {withoutLocation && !hasLocation ? (
            <InlineAlert
              tone="warning"
              icon={MapPinOff}
              action={(
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadCurrentLocation()} loading={isLocating} className="text-amber-200">
                  {t("useLocationInstead")}
                </Button>
              )}
            >
              {t("noLocationBanner")}
            </InlineAlert>
          ) : null}

          {/* GPS error */}
          {geoState.error && !withoutLocation ? (
            <InlineAlert tone="error">{t("gpsUnavailable")}</InlineAlert>
          ) : null}

          {/* Selected lead preview */}
          {selectedLead ? (
            <>
              <div className="group relative w-full rounded-2xl border border-blue-400/25 bg-blue-500/[0.1] p-4 text-left">
                {editLeadOpen ? (
                  <CheckInCompanyEditor lead={selectedLead} onDone={() => { setEditLeadOpen(false); void invalidateXpotData(); }} />
                ) : (
                <>
                <EditCompanyButton onClick={() => setEditLeadOpen(true)} className="absolute right-2 top-2" />
                <div className={`mb-2 ${EYEBROW} !text-blue-200/80`}>{t("selectedLead")}</div>
                <div className="pr-10 text-lg font-bold text-white">{selectedLead.name}</div>
                {selectedLead.locations?.[0]?.addressLine1 ? (
                  <a href={placeUrl(selectedLead.locations[0].addressLine1)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="mt-1 flex w-fit max-w-full items-center gap-1.5 text-sm text-blue-300/85 transition-colors hover:text-blue-200">
                    <MapPinned className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{selectedLead.locations[0].addressLine1}</span>
                  </a>
                ) : (
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-white/40">
                    <MapPinned className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t("noAddress")}</span>
                  </div>
                )}
                
                <div className="mt-3 flex flex-col gap-2">
                  {selectedLead.phone && (
                    <a href={phoneHref(selectedLead.phone)} onClick={e => e.stopPropagation()} className="flex min-h-8 w-fit items-center gap-1.5 text-xs text-white/70 transition-colors hover:text-white">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{displayPhone(selectedLead.phone)}</span>
                    </a>
                  )}
                  {selectedLead.email && (
                    <a href={`mailto:${selectedLead.email}`} onClick={e => e.stopPropagation()} className="flex min-h-8 w-fit max-w-full items-center gap-1.5 text-xs text-white/70 transition-colors hover:text-white">
                      <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{selectedLead.email}</span>
                    </a>
                  )}
                  {selectedLead.website && (
                    <a href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex min-h-8 max-w-full items-center gap-1.5 text-xs text-white/70 transition-colors hover:text-white">
                      <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{selectedLead.website}</span>
                    </a>
                  )}
                  {selectedLead.industry && (
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{selectedLead.industry}</span>
                    </div>
                  )}
                  <SocialLinks socials={selectedLead.socialUrls} otherLabel={tl("socialOther")} />
                </div>
                </>
                )}
              </div>
            </>
          ) : null}

          {/* Slider */}
          <div className={checkInDropdownOpen ? "pointer-events-none" : ""}>
            <ConfirmSlider
              label={selectedLead ? t("slideToCheckIn") : t("selectLeadFirst")}
              helperText={selectedLead ? t("confirmVisitStart", { name: selectedLead.name }) : t("chooseLeadHint")}
              loading={checkInMutation.isPending || createLeadMutation.isPending}
              disabled={!selectedLeadId || createLeadMutation.isPending}
              onConfirm={() => {
                const input = { leadId: Number(selectedLeadId), lat: geoState.lat, lng: geoState.lng, gpsAccuracyMeters: geoState.accuracy };
                if (!hasLocation) setOverridePrompt({ input, miss: null });
                else checkInMutation.mutate(input);
              }}
            />
          </div>
        </div>
      </div>

      </div>

      <div className="mt-4 space-y-4 lg:sticky lg:top-6 lg:mt-0">
      {/* Live position — with the selected lead's pin once there is one, so the
          rep can see how far they still are from the door. */}
      {geoState.lat != null && geoState.lng != null ? (
        <LiveMap
          lat={geoState.lat}
          lng={geoState.lng}
          accuracy={geoState.accuracy}
          leadLat={selectedLeadLocation ? Number(selectedLeadLocation.lat) : null}
          leadLng={selectedLeadLocation ? Number(selectedLeadLocation.lng) : null}
          leadName={selectedLeadLocation ? selectedLead?.name : undefined}
        />
      ) : null}

      {/* Recent visits */}
      {(() => {
        const recent = (visitsQuery.data || []).filter((v) => v.checkedOutAt).slice(0, 5);
        if (!recent.length) return null;
        return (
          <div className="space-y-2">
            <div className={`px-1 ${EYEBROW}`}>{t("recentVisits")}</div>
            {recent.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
          </div>
        );
      })()}
      </div>
      </div>
    </div>

    <CheckInOverrideDialog
      open={Boolean(overridePrompt)}
      onOpenChange={(open) => { if (!open) setOverridePrompt(null); }}
      miss={overridePrompt?.miss ?? null}
      leadName={selectedLead?.name ?? ""}
      loading={checkInMutation.isPending}
      onConfirm={confirmOverride}
    />

    <CreateLeadDialog
      open={createLeadDialogOpen}
      onOpenChange={setCreateLeadDialogOpen}
      initialName={checkInSearch.trim() === t("nearbyQuery") ? "" : checkInSearch.trim()}
      onCreated={(leadId, name) => {
        setSelectedLeadId(leadId);
        setCheckInSearch(name);
        invalidateXpotData();
      }}
    />
    </>
  );
}
