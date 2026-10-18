import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  MapPinned,
  Timer,
  Phone,
  Globe,
  Mail,
  PencilLine,
  Twitter,
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Link2,
  Nfc,
  DollarSign,
  Mic2,
  CircleCheck,
  MapPinOff,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { useXpotModules } from "@/components/ModuleSwitch";
import { setSellTo } from "@/pages/tags/lib";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useXpotShared } from "./hooks/useXpotShared";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useLeads } from "./hooks/useLeads";
import { useCheckIn } from "./hooks/useCheckIn";
import { useVisits } from "./hooks/useVisits";
import { ConfirmSlider } from "./ConfirmSlider";
import { formatDateTime } from "./utils";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { Loader2 } from '@/components/ui/loader';
import { GoogleLogo } from "@/components/ui/google-logo";
import { EditLeadDialog } from "./components/EditLeadDialog";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { VisitRow } from "./components/VisitRow";
import { LiveMap } from "./components/LiveMap";
import { StatusPicker } from "./components/VisitStatus";
import type { VisitStatus } from "./components/VisitStatus";
import type { FullSalesLead, GoogleBusinessProfile, SalesLead } from "./types";
import { LeadSalesPanel } from "./components/sales/LeadSalesPanel";
import { VisitActionsPanel } from "./components/sales/VisitActions";
import { GLASS_RAISED } from "@/components/xpot/surface";
import { useIsComputer } from "@/hooks/use-is-desktop";
import { PlaceLeadSearch } from "./components/PlaceLeadSearch";
import { CreateLeadDialog } from "./components/CreateLeadDialog";
import { CheckInOverrideDialog } from "./components/CheckInOverrideDialog";
import { currentPlatform } from "@/lib/device";

const LOCATION_FIX = {
  ios: { step1: "iphoneStep1", path: "iphonePath", step2: "iphoneStep2", option: "iphoneOption" },
  android: { step1: "androidStep1", path: "androidPath", step2: "androidStep2", option: "androidOption" },
  other: { step1: "computerStep1", path: "computerPath", step2: "computerStep2", option: "computerOption" },
} as const;

type VisitLead = SalesLead & Partial<Pick<FullSalesLead, "locations" | "openOpportunities" | "unitsOnShelf">>;

function BriefMetric({ label, value, google }: { label: string; value: string; google?: boolean }) {
  return (
    <div className="min-w-0 px-1.5 py-2.5 text-center">
      <div className="flex min-h-5 items-center justify-center gap-1 text-base font-extrabold tabular-nums text-white">
        {google && <GoogleLogo className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{value}</span>
      </div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-white/35">{label}</div>
    </div>
  );
}

function VisitAction({ icon: Icon, title, hint, onClick, tone = "indigo", testId }: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onClick: () => void;
  tone?: "indigo" | "violet" | "emerald";
  testId?: string;
}) {
  const palette = tone === "violet"
    ? "border-violet-400/20 bg-violet-400/[0.07] text-violet-300"
    : tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300"
      : "border-indigo-400/20 bg-indigo-400/[0.07] text-indigo-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[66px] min-w-0 items-center gap-2.5 rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] ${palette}`}
      data-testid={testId}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
        <Icon className="h-[18px] w-[18px]" />
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
  const location = lead.locations?.[0];
  const address = location ? [location.addressLine1, location.city, location.state].filter(Boolean).join(", ") : "";
  const number = new Intl.NumberFormat(t.locale);
  const unknown = profileLoading ? "..." : t("notAvailable");
  const rating = profile?.rating != null ? profile.rating.toFixed(1) : unknown;
  const reviews = profile?.reviewCount != null ? number.format(profile.reviewCount) : unknown;
  const shelf = lead.unitsOnShelf != null ? number.format(lead.unitsOnShelf) : t("notAvailable");
  const deals = lead.openOpportunities != null ? number.format(lead.openOpportunities) : t("notAvailable");
  const websiteHref = lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : null;
  const mapsHref = profile?.mapsUrl || (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null);

  return (
    <div>
      <div className="pr-9">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 text-xl font-extrabold leading-tight tracking-tight text-white">{lead.name}</h2>
          {lead.industry && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/45">{lead.industry}</span>}
          {profile?.openNow != null && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${profile.openNow ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
              {profile.openNow ? t("businessOpen") : t("businessClosed")}
            </span>
          )}
        </div>
        {address && mapsHref && (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-indigo-300/80 hover:text-indigo-200">
            <MapPinned className="h-3.5 w-3.5 shrink-0" />
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
            <a href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-indigo-200/80">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lead.phone}</span>
            </a>
          )}
          {websiteHref && (
            <a href={websiteHref} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-indigo-200/80">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lead.website}</span>
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="col-span-2 flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2 text-indigo-200/80">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
        </div>
      )}

      {((lead as any).socialUrls as Array<{platform: string, url: string}>)?.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {((lead as any).socialUrls as Array<{platform: string, url: string}>).map((social, i) => {
            const Icon = social.platform === "instagram" ? Instagram
              : social.platform === "linkedin" ? Linkedin
              : social.platform === "twitter" ? Twitter
              : social.platform === "facebook" ? Facebook
              : social.platform === "youtube" ? Youtube
              : Link2;
            const url = social.url.startsWith("http") ? social.url : `https://${social.url}`;
            return (
              <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-indigo-200">
                <Icon className="h-4 w-4" />
              </a>
            );
          })}
        </div>
      )}
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
  // Only the steps for the device in hand: the setting lives somewhere else on each.
  const fix = LOCATION_FIX[currentPlatform()];

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">{t("gateHeading")}</div>
      <div
        className="rounded-3xl p-6 text-center space-y-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
        >
          <MapPinned className="h-6 w-6 text-indigo-300" />
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
          <div
            className="rounded-2xl px-4 py-3 text-left text-xs leading-relaxed text-white/60"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {t(fix.step1)} <span className="text-white/80">{t(fix.path)}</span>{t(fix.step2)}{" "}
            <span className="text-white/80">{t(fix.option)}</span>{t("iphoneStep3")}
          </div>
        ) : null}

        {error && !blocked ? (
          <div className="rounded-2xl px-4 py-3 text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onRetry}
          disabled={isLocating}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-60 touch-manipulation"
        >
          {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
          {isLocating ? t("gettingLocation") : blocked ? t("enabledRetry") : t("shareLocation")}
        </button>

        {onContinueWithout ? (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={onContinueWithout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.1] px-4 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
              data-testid="check-in-without-location"
            >
              <MapPinOff className="h-4 w-4" />
              {t("continueWithoutLocation")}
            </button>
            <p className="text-xs leading-relaxed text-white/35">{t("continueWithoutLocationHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function XpotCheckIn() {
  const t = useT(checkinMessages);
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
  const [activeVisitPanel, setActiveVisitPanel] = useState<"sales" | "note" | "checkout" | null>(null);
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
    const reader = new FileReader();
    const audioData = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });
    const result = await uploadAudioMutation.mutateAsync({ audioData, durationSeconds } as any);
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
            <div className="flex items-center gap-1.5 text-indigo-300/80">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em]">{t("visitInProgress")}</span>
            </div>
            {activeVisit.checkedInAt && (
              <div className="mt-1 truncate text-[10px] text-white/30">{t("startedAt", { time: formatDateTime(activeVisit.checkedInAt) })}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Timer className="h-4 w-4 text-indigo-300/60" />
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
          {activeVisit.lead && (
            <button
              type="button"
              onClick={() => setEditLeadOpen(true)}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-white/30 transition-colors hover:bg-indigo-500/20 hover:text-indigo-300"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
          )}
          {activeLeadDetails ? (
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
            <VisitAction icon={DollarSign} title={t("visitSales")} hint={t("visitSalesHint")} onClick={() => setActiveVisitPanel("sales")} />
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
      </div>

      {activeVisit.lead && (
        <Dialog open={activeVisitPanel === "sales"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1424] p-5 text-white">
            <DialogHeader><DialogTitle>{t("visitSales")}</DialogTitle></DialogHeader>
            <LeadSalesPanel leadId={activeVisit.lead.id} leadName={activeVisit.lead.name} visitId={activeVisit.id} compact />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={activeVisitPanel === "note"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1424] p-5 text-white">
          <DialogHeader><DialogTitle>{t("visitNote")}</DialogTitle></DialogHeader>
          <VoiceRecorder onUpload={uploadVisitNote} />
          <VisitActionsPanel visitId={activeVisit.id} onApplied={() => invalidateXpotData()} />
        </DialogContent>
      </Dialog>

      <Dialog open={activeVisitPanel === "checkout"} onOpenChange={(open) => !open && setActiveVisitPanel(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1424] p-5 text-white">
          <DialogHeader><DialogTitle>{t("finishVisit")}</DialogTitle></DialogHeader>
          <StatusPicker value={checkoutStatus} onChange={setCheckoutStatus} />
          <ConfirmSlider
            label={uploadAudioMutation.isPending ? t("uploadInProgress") : t("slideToCheckOut")}
            helperText=""
            loading={checkOutMutation.isPending || cancelVisitMutation.isPending || uploadAudioMutation.isPending}
            disabled={uploadAudioMutation.isPending}
            onConfirm={() => checkOutMutation.mutate({ status: checkoutStatus })}
            onCancel={() => cancelVisitMutation.mutate(undefined as any)}
          />
        </DialogContent>
      </Dialog>

      {activeVisit.lead && (
        <EditLeadDialog
          lead={activeLeadDetails ?? activeVisit.lead}
          open={editLeadOpen}
          onOpenChange={setEditLeadOpen}
          onSaved={() => invalidateXpotData()}
        />
      )}
    </div>
  );

  const GLASS = GLASS_RAISED;

  return (
    <>
    <div className="space-y-4">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start lg:gap-6">
      <div className="space-y-4">
      <div className="px-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("checkInHeading")}</div>
      </div>
      <div className="rounded-2xl" style={GLASS}>
        <div className="px-4 py-5 space-y-5 sm:px-6">
          <PlaceLeadSearch
            value={checkInSearch}
            onChange={(next) => { setCheckInSearch(next); if (!next) setSelectedLeadId(""); }}
            geoState={geoState}
            placeholder={t("searchPlaceholder")}
            busy={createLeadMutation.isPending}
            onOpenChange={setCheckInDropdownOpen}
            onPickLead={(lead) => pickLocalLeadForCheckIn(lead)}
            onPickPlace={(place, match) => { void pickGooglePlaceForCheckIn(place, match).catch(() => {}); }}
            onCreate={() => setCreateLeadDialogOpen(true)}
            onNearby={() => { void loadCurrentLocation(); setCheckInSearch(t("nearbyQuery")); }}
          />

          {withoutLocation && !hasLocation ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2.5 text-sm text-amber-100/80">
              <span className="flex items-center gap-2"><MapPinOff className="h-4 w-4 shrink-0" />{t("noLocationBanner")}</span>
              <button type="button" onClick={() => void loadCurrentLocation()} className="text-xs font-semibold text-amber-200 hover:text-amber-100">
                {isLocating ? t("gettingLocation") : t("useLocationInstead")}
              </button>
            </div>
          ) : null}

          {/* GPS error */}
          {geoState.error && !withoutLocation ? (
            <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {t("gpsUnavailable")}
            </div>
          ) : null}

          {/* Selected lead preview */}
          {selectedLead ? (
            <>
              <div
                className="w-full rounded-2xl p-4 text-left transition-all relative group"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditLeadOpen(true); }}
                  className="absolute right-4 top-4 h-8 w-8 flex items-center justify-center rounded-full bg-white/5 text-white/30 hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                >
                  <PencilLine className="h-4 w-4" />
                </button>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70 mb-2">{t("selectedLead")}</div>
                <div className="text-lg font-bold text-white pr-10">{selectedLead.name}</div>
                {selectedLead.locations?.[0]?.addressLine1 ? (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(selectedLead.locations[0].addressLine1)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="mt-1 flex items-center gap-1.5 text-sm text-indigo-300/80 hover:text-indigo-200 transition-colors w-fit max-w-full">
                    <MapPinned className="h-3.5 w-3.5 shrink-0" />
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
                    <a href={`tel:${selectedLead.phone.replace(/[^0-9+]/g, '')}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-indigo-300/80 hover:text-indigo-200 transition-colors w-fit">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{selectedLead.phone}</span>
                    </a>
                  )}
                  {selectedLead.email && (
                    <a href={`mailto:${selectedLead.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-indigo-300/80 hover:text-indigo-200 transition-colors w-fit">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{selectedLead.email}</span>
                    </a>
                  )}
                  {selectedLead.website && (
                    <a href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-indigo-300/80 hover:text-indigo-200 transition-colors max-w-full">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{selectedLead.website}</span>
                    </a>
                  )}
                  {selectedLead.industry && (
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{selectedLead.industry}</span>
                    </div>
                  )}
                  {((selectedLead as any).socialUrls as Array<{platform: string, url: string}>)?.length > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      {((selectedLead as any).socialUrls as Array<{platform: string, url: string}>).map((social, i) => {
                        const Icon = social.platform === "instagram" ? Instagram
                          : social.platform === "linkedin" ? Linkedin
                          : social.platform === "twitter" ? Twitter
                          : social.platform === "facebook" ? Facebook
                          : social.platform === "youtube" ? Youtube
                          : Link2;
                        const url = social.url.startsWith("http") ? social.url : `https://${social.url}`;
                        return (
                          <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors">
                            <Icon className="h-3 w-3" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <EditLeadDialog
                lead={selectedLead}
                open={editLeadOpen}
                onOpenChange={setEditLeadOpen}
                onSaved={() => invalidateXpotData()}
              />
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
            <div className="px-1 text-xs font-semibold uppercase tracking-widest text-white/30">{t("recentVisits")}</div>
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
