import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  MapPinned,
  Plus,
  Search,
  Timer,
  X,
  ChevronDown,
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
import { usePlaceSearch } from "./usePlaceSearch";
import { findMatchingLead, formatDateTime } from "./utils";
import { useToast } from "@/hooks/use-toast";
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
import { maskUsPhoneInput } from "./phoneInput";

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

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function CreateLeadDialog({ open, onOpenChange, initialName, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  onCreated: (leadId: number, name: string) => void;
}) {
  const { toast } = useToast();
  const t = useT(checkinMessages);
  const { geoState } = useXpotShared();
  const [form, setForm] = useState({ name: initialName, phone: "", email: "", website: "", industry: "", address: "", city: "", state: "" });
  const [placeSearch, setPlaceSearch] = useState(initialName);
  const [placeDropdownOpen, setPlaceDropdownOpen] = useState(false);
  const { createLeadMutation } = useCheckIn();
  const placeQuery = usePlaceSearch(placeSearch, open, geoState);

  useEffect(() => {
    setForm((p) => ({ ...p, name: initialName }));
    setPlaceSearch(initialName);
  }, [initialName]);

  function applyPlace(place: import("./types").GooglePlaceResult) {
    const parts = place.address.split(",");
    const state = parts.find((p) => US_STATES.includes(p.trim()))?.trim() ?? "";
    const city = parts.length >= 3 ? parts[parts.length - 3].trim() : "";
    const address = parts[0]?.trim() ?? "";
    setForm((prev) => ({
      ...prev,
      name: place.name,
      phone: place.phone ? maskUsPhoneInput(place.phone) : prev.phone,
      website: place.website || prev.website,
      address,
      city,
      state,
    }));
    setPlaceSearch(place.name);
    setPlaceDropdownOpen(false);
  }

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleCreate() {
    if (!form.name.trim()) return;
    try {
      const result = await createLeadMutation.mutateAsync({
        name: form.name.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
        industry: form.industry || undefined,
        source: "manual",
        status: "prospect",
        primaryLocation: form.address ? {
          label: "Main",
          addressLine1: form.address || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          isPrimary: true,
        } : undefined,
      } as any);
      toast({ title: t("companyCreated"), variant: "success" });
      onCreated(result.lead.id, form.name.trim());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("createFailed"), description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">{t("newCompany")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 mt-1">
          {/* Place search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={placeSearch}
              onChange={(e) => { setPlaceSearch(e.target.value); setPlaceDropdownOpen(true); }}
              onFocus={() => setPlaceDropdownOpen(true)}
              onBlur={() => setTimeout(() => setPlaceDropdownOpen(false), 150)}
              placeholder={t("placeSearchPlaceholder")}
              className="w-full h-10 rounded-xl pl-9 pr-9 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
            {placeQuery.isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/30" />}
            {placeDropdownOpen && placeQuery.data?.results.length ? (
              <div
                className="absolute left-0 right-0 top-full z-50 max-h-48 overflow-y-auto"
                style={{
                  background: "#0e1117",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderTop: "none",
                  borderBottomLeftRadius: "12px",
                  borderBottomRightRadius: "12px",
                  boxShadow: "0 16px 32px rgba(0,0,0,0.5)",
                }}
              >
                {placeQuery.data.results.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onMouseDown={() => applyPlace(place)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-white/30" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{place.name}</div>
                      <div className="truncate text-xs text-white/35">{place.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Fields */}
          {[
            { key: "name", value: form.name, onChange: f("name"), placeholder: t("businessNamePlaceholder") },
            { key: "website", value: form.website, onChange: f("website"), placeholder: t("fieldWebsite") },
            { key: "industry", value: form.industry, onChange: f("industry"), placeholder: t("fieldIndustry") },
            { key: "address", value: form.address, onChange: f("address"), placeholder: t("streetPlaceholder") },
          ].map(({ key, value, onChange, placeholder }) => (
            <input
              key={key}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
          ))}
          <input
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: maskUsPhoneInput(e.target.value) }))}
            placeholder={t("fieldPhone")}
            inputMode="tel"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <input
            value={form.email}
            onChange={f("email")}
            placeholder={t("fieldEmail")}
            type="email"
            inputMode="email"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.city}
              onChange={f("city")}
              placeholder={t("cityPlaceholder")}
              className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
            <div className="relative">
              <select
                value={form.state}
                onChange={f("state")}
                className="w-full h-10 appearance-none rounded-xl px-3 pr-8 text-[16px] focus:outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: form.state ? "white" : "rgba(255,255,255,0.25)" }}
              >
                <option value="">{t("statePlaceholder")}</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            </div>
          </div>

          <button
            disabled={createLeadMutation.isPending || !form.name.trim()}
            onClick={handleCreate}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 mt-1"
            style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
          >
            {createLeadMutation.isPending ? <Loader2 className="inline mr-2 h-4 w-4 animate-spin" /> : null}
            {t("createCompany")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Check-in is GPS-validated: without a fix there is nothing to validate
// against, so the page asks for location instead of pretending to work.
function LocationGate({
  permission,
  isLocating,
  error,
  onRetry,
}: {
  permission: string;
  isLocating: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const t = useT(checkinMessages);
  const blocked = permission === "denied";

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
            {t("iphoneStep1")} <span className="text-white/80">{t("iphonePath")}</span>{t("iphoneStep2")}{" "}
            <span className="text-white/80">{t("iphoneOption")}</span>{t("iphoneStep3")}
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
    filteredLeadsForCheckIn,
    checkInPlaceQuery,
    checkInMutation,
    createLeadMutation,
    pickLocalLeadForCheckIn,
    pickGooglePlaceForCheckIn,
    createNewCompanyFromSearch,
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
  if (!activeVisit && !hasLocation) {
    return (
      <LocationGate
        permission={permission}
        isLocating={isLocating}
        error={geoState.error}
        onRetry={() => void loadCurrentLocation()}
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
      {/* Search card */}
      <div className="px-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/30">{t("checkInHeading")}</div>
      </div>
      <div className="rounded-2xl" style={GLASS}>
        <div className="px-6 py-5 space-y-5">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400/80 z-10" />
            <input
              value={checkInSearch}
              onChange={(event) => { setCheckInSearch(event.target.value); setCheckInDropdownOpen(true); }}
              onFocus={() => setCheckInDropdownOpen(true)}
              onBlur={() => setTimeout(() => setCheckInDropdownOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === "Escape") { setCheckInDropdownOpen(false); (e.target as HTMLInputElement).blur(); } }}
              placeholder={t("searchPlaceholder")}
              className={`w-full h-[64px] pl-12 pr-24 text-[17px] font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${checkInDropdownOpen ? "rounded-t-[32px]" : "rounded-[32px]"}`}
              style={{ background: "rgba(255,255,255,0.95)", border: "1.5px solid rgba(255,255,255,1)", boxShadow: "0 2px 16px rgba(0,0,0,0.18)" }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {checkInSearch ? (
                <button type="button" onClick={() => { setCheckInSearch(""); setSelectedLeadId(""); }} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-indigo-400/60 hover:bg-indigo-50 hover:text-indigo-500 transition-colors"
                onClick={async () => { await loadCurrentLocation(); setCheckInSearch(t("nearbyQuery")); setCheckInDropdownOpen(true); }}
              >
                <MapPinned className="h-4 w-4" />
              </button>
            </div>

            {/* Dropdown */}
            {checkInDropdownOpen && (
              <div
                className="absolute left-0 right-0 top-full z-50 max-h-72 overflow-y-auto rounded-b-[32px] overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.98)",
                  backdropFilter: "blur(24px)",
                  border: "1.5px solid rgba(255,255,255,1)",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Add new */}
                <button
                  type="button"
                  onClick={() => { setCheckInDropdownOpen(false); setCreateLeadDialogOpen(true); }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  {/* w-14 across every row type so the icons line up: the
                      "Google" badge below the icon is wider than the icon. */}
                  <div className="flex w-14 shrink-0 justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                      <Plus className="h-5 w-5 text-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-gray-900">
                      {checkInSearch.trim().length >= 2 ? t("createNamed", { name: checkInSearch.trim() }) : t("addNewLead")}
                    </div>
                    <div className="text-xs font-medium text-gray-400">{t("addAsCompany")}</div>
                  </div>
                </button>

                {/* Local leads */}
                {filteredLeadsForCheckIn.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => { pickLocalLeadForCheckIn(lead); setCheckInDropdownOpen(false); }}
                    className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                    style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
                  >
                    {/* Source badge sits under the icon, not beside the text —
                        as a third column it squeezed the name and address into
                        an ellipsis on a phone. */}
                    <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 border border-gray-200">
                        <Building2 className="h-5 w-5 text-gray-500" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">{t("badgeLocal")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-gray-900 break-words">{lead.name}</div>
                      <div className="text-xs font-medium text-gray-400 break-words">{lead.locations?.[0]?.addressLine1 || lead.industry || t("localLead")}</div>
                    </div>
                  </button>
                ))}

                {/* Google Places loading */}
                {checkInPlaceQuery.isFetching ? (
                  <div className="flex items-center gap-3 px-5 py-5 text-[13px] font-medium text-gray-400" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    {t("searchingPlaces")}
                  </div>
                ) : null}

                {checkInPlaceQuery.error ? (
                  <div className="px-5 py-4 text-[13px] font-medium text-red-500 bg-red-50" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    {(checkInPlaceQuery.error as Error).message}
                  </div>
                ) : null}

                {/* Google Places results */}
                {checkInPlaceQuery.data?.results.map((place) => {
                  const existingLead = findMatchingLead(place, leadsQuery.data || []);
                  return (
                    <button
                      key={place.placeId}
                      type="button"
                      onClick={() => { pickGooglePlaceForCheckIn(place); setCheckInDropdownOpen(false); }}
                      className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                      style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
                          <Building2 className="h-5 w-5 text-indigo-400" />
                        </div>
                        {existingLead ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600">{t("badgeMatch")}</span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
                            <GoogleLogo className="h-2.5 w-2.5" />
                            Google
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-gray-900 break-words">{place.name}</div>
                        <div className="text-[11px] font-medium text-gray-400 break-words">{place.address}</div>
                        {(place.primaryType || place.phone) && (
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                            {place.primaryType ? <span>{place.primaryType.replace(/_/g, " ")}</span> : null}
                            {place.phone ? <span>{place.phone}</span> : null}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {!filteredLeadsForCheckIn.length && !checkInPlaceQuery.isFetching && !checkInPlaceQuery.data?.results?.length && checkInSearch.trim().length < 3 ? (
                  <div className="px-5 py-6 text-center text-[13px] font-medium text-gray-400">
                    {t("typeMore")}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* GPS error */}
          {geoState.error ? (
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
              onConfirm={() => checkInMutation.mutate({ leadId: Number(selectedLeadId), lat: geoState.lat, lng: geoState.lng, gpsAccuracyMeters: geoState.accuracy })}
            />
          </div>
        </div>
      </div>

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
