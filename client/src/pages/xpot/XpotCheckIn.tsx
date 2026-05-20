import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useXpotShared } from "./hooks/useXpotShared";
import { useXpotQueries } from "./hooks/useXpotQueries";
import { useLeads } from "./hooks/useLeads";
import { useCheckIn } from "./hooks/useCheckIn";
import { useVisits } from "./hooks/useVisits";
import { ConfirmSlider } from "./ConfirmSlider";
import { usePlaceSearch } from "./usePlaceSearch";
import { findMatchingLead, formatDateTime } from "./utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from '@/components/ui/loader';
import { EditLeadDialog } from "./components/EditLeadDialog";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { VisitRow } from "./components/VisitRow";
import { InlineField } from "./components/InlineField";
import { StatusPicker } from "./components/VisitStatus";
import type { VisitStatus } from "./components/VisitStatus";
import type { FullSalesLead, SalesLead } from "./types";

function ActiveLeadInfo({ lead, onSaved }: { lead: SalesLead; onSaved: () => void }) {
  const { toast } = useToast();
  const [fields, setFields] = useState({
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    website: lead.website || "",
    industry: lead.industry || "",
  });

  function saveField(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { [key]: value || undefined })
      .then(() => { toast({ title: "Saved", variant: "success" }); onSaved(); queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] }); })
      .catch((err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }));
  }

  return (
    <div className="space-y-2.5">
      <InlineField label="" large value={fields.name} onSave={(v) => saveField("name", v)} />
      <InlineField label="Phone" value={fields.phone} onSave={(v) => saveField("phone", v)} />
      <InlineField label="Email" value={fields.email} onSave={(v) => saveField("email", v)} />
      <InlineField label="Website" value={fields.website} onSave={(v) => saveField("website", v)} />
      <InlineField label="Industry" value={fields.industry} onSave={(v) => saveField("industry", v)} />
      {((lead as any).socialUrls as Array<{platform: string, url: string}>)?.length > 0 && (
        <div className="flex items-center gap-2 pt-2 mt-2 border-t border-white/5">
          {((lead as any).socialUrls as Array<{platform: string, url: string}>).map((social, i) => {
            const Icon = social.platform === "instagram" ? Instagram
              : social.platform === "linkedin" ? Linkedin
              : social.platform === "twitter" ? Twitter
              : social.platform === "facebook" ? Facebook
              : social.platform === "youtube" ? Youtube
              : Link2;
            const url = social.url.startsWith("http") ? social.url : `https://${social.url}`;
            return (
              <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors">
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

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function CreateLeadDialog({ open, onOpenChange, initialName, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  onCreated: (leadId: number, name: string) => void;
}) {
  const { toast } = useToast();
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
      phone: place.phone ? formatPhone(place.phone) : prev.phone,
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
        status: "lead",
        primaryLocation: form.address ? {
          label: "Main",
          addressLine1: form.address || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          isPrimary: true,
        } : undefined,
      } as any);
      toast({ title: "Company created", variant: "success" });
      onCreated(result.lead.id, form.name.trim());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">New Company</DialogTitle>
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
              placeholder="Search Google Places to autofill"
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
            { value: form.name, onChange: f("name"), placeholder: "Business name *" },
            { value: form.website, onChange: f("website"), placeholder: "Website" },
            { value: form.industry, onChange: f("industry"), placeholder: "Industry" },
            { value: form.address, onChange: f("address"), placeholder: "Street address" },
          ].map(({ value, onChange, placeholder }) => (
            <input
              key={placeholder}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
            />
          ))}
          <input
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }))}
            placeholder="Phone"
            inputMode="tel"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <input
            value={form.email}
            onChange={f("email")}
            placeholder="Email"
            type="email"
            inputMode="email"
            className="w-full h-10 rounded-xl px-3 text-[16px] text-white placeholder:text-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.city}
              onChange={f("city")}
              placeholder="City"
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
                <option value="">State</option>
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
            Create Company
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function XpotCheckIn() {
  const { geoState, loadCurrentLocation, invalidateXpotData } = useXpotShared();
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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editLeadOpen, setEditLeadOpen] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<VisitStatus>("completed");
  const [createLeadDialogOpen, setCreateLeadDialogOpen] = useState(false);

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

  if (activeVisit) return (
    <div className="space-y-4">
      {/* Active visit card — immersive */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 space-y-5"
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

        {/* Timer */}
        <div className="relative flex flex-col items-center gap-1 pt-1">
          <div className="flex items-center gap-1.5 text-indigo-400/70">
            <Timer className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-[0.25em]">Visit in Progress</span>
          </div>
          <div
            className="text-5xl font-mono font-bold tabular-nums text-white"
            style={{ textShadow: "0 0 30px rgba(99,102,241,0.5)" }}
          >
            {elapsedDisplay}
          </div>
          {activeVisit.checkedInAt && (
            <div className="text-[11px] text-white/30">
              Started · {formatDateTime(activeVisit.checkedInAt)}
            </div>
          )}
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
          {activeVisit.lead ? (
            <ActiveLeadInfo lead={activeVisit.lead} onSaved={() => invalidateXpotData()} />
          ) : (
            <div className="text-center text-base font-semibold text-white">{`Lead #${activeVisit.leadId}`}</div>
          )}
        </div>

        {/* Voice recorder */}
        <VoiceRecorder
          onUpload={async ({ audioBlob, durationSeconds }) => {
            const reader = new FileReader();
            const audioData = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(audioBlob);
            });
            await uploadAudioMutation.mutateAsync({ audioData, durationSeconds } as any);
          }}
        />

        <StatusPicker value={checkoutStatus} onChange={setCheckoutStatus} />

        <ConfirmSlider
          label={uploadAudioMutation.isPending ? "UPLOAD IN PROGRESS..." : "SLIDE TO CHECK OUT"}
          helperText=""
          loading={checkOutMutation.isPending || cancelVisitMutation.isPending || uploadAudioMutation.isPending}
          disabled={uploadAudioMutation.isPending}
          onConfirm={() => checkOutMutation.mutate({ status: checkoutStatus } as any)}
          onCancel={() => cancelVisitMutation.mutate(undefined as any)}
        />
      </div>
      {activeVisit.lead && (
        <EditLeadDialog
          lead={activeVisit.lead}
          open={editLeadOpen}
          onOpenChange={setEditLeadOpen}
          onSaved={() => invalidateXpotData()}
        />
      )}
    </div>
  );

  const GLASS = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  } as const;

  return (
    <>
    <div className="space-y-4">
      {/* Search card */}
      <div className="px-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-white/30">Check-In</div>
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
              placeholder="Search places or leads..."
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
                onClick={async () => { await loadCurrentLocation(); setCheckInSearch("businesses nearby"); setCheckInDropdownOpen(true); }}
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
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                    <Plus className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-gray-900">
                      {checkInSearch.trim().length >= 2 ? `Create "${checkInSearch.trim()}"` : "Add new lead"}
                    </div>
                    <div className="text-xs font-medium text-gray-400">Add as a new company</div>
                  </div>
                </button>

                {/* Local leads */}
                {filteredLeadsForCheckIn.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => { pickLocalLeadForCheckIn(lead); setCheckInDropdownOpen(false); }}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                    style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 border border-gray-200">
                      <Building2 className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-gray-900">{lead.name}</div>
                      <div className="truncate text-xs font-medium text-gray-400">{lead.locations?.[0]?.addressLine1 || lead.industry || "Local lead"}</div>
                    </div>
                    <span className="shrink-0 rounded-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200">Local</span>
                  </button>
                ))}

                {/* Google Places loading */}
                {checkInPlaceQuery.isFetching ? (
                  <div className="flex items-center gap-3 px-5 py-5 text-[13px] font-medium text-gray-400" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    Searching Google Places...
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
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                      style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
                        <Building2 className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-gray-900">{place.name}</div>
                        <div className="truncate text-[11px] font-medium text-gray-400">{place.address}</div>
                        {(place.primaryType || place.phone) && (
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                            {place.primaryType ? <span>{place.primaryType.replace(/_/g, " ")}</span> : null}
                            {place.phone ? <span>{place.phone}</span> : null}
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${existingLead ? "text-blue-600 bg-blue-50 border-blue-200" : "text-indigo-600 bg-indigo-50 border-indigo-200"} border`}>
                        {existingLead ? "Match" : "Google"}
                      </span>
                    </button>
                  );
                })}

                {!filteredLeadsForCheckIn.length && !checkInPlaceQuery.isFetching && !checkInPlaceQuery.data?.results?.length && checkInSearch.trim().length < 3 ? (
                  <div className="px-5 py-6 text-center text-[13px] font-medium text-gray-400">
                    Type at least 3 characters to search...
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* GPS error */}
          {geoState.error ? (
            <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              GPS unavailable. Visit will be flagged for review.
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
                <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70 mb-2">Selected Lead</div>
                <div className="text-lg font-bold text-white pr-10">{selectedLead.name}</div>
                {selectedLead.locations?.[0]?.addressLine1 ? (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(selectedLead.locations[0].addressLine1)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="mt-1 flex items-center gap-1.5 text-sm text-indigo-300/80 hover:text-indigo-200 transition-colors w-fit max-w-full">
                    <MapPinned className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{selectedLead.locations[0].addressLine1}</span>
                  </a>
                ) : (
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-white/40">
                    <MapPinned className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">No address saved yet</span>
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
              label={selectedLead ? "SLIDE TO CHECK IN" : "SELECT A LEAD FIRST"}
              helperText={selectedLead ? `Confirm visit start for ${selectedLead.name}` : "Choose a local lead or Google Place to enable check-in."}
              loading={checkInMutation.isPending || createLeadMutation.isPending}
              disabled={!selectedLeadId || createLeadMutation.isPending}
              onConfirm={() => checkInMutation.mutate({ leadId: Number(selectedLeadId), lat: geoState.lat, lng: geoState.lng, gpsAccuracyMeters: geoState.accuracy })}
            />
          </div>
        </div>
      </div>

      {/* Recent visits */}
      {(() => {
        const recent = (visitsQuery.data || []).filter((v) => v.checkedOutAt).slice(0, 5);
        if (!recent.length) return null;
        return (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold uppercase tracking-widest text-white/30">Recent Visits</div>
            {recent.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
          </div>
        );
      })()}
    </div>

    <CreateLeadDialog
      open={createLeadDialogOpen}
      onOpenChange={setCreateLeadDialogOpen}
      initialName={checkInSearch.trim() === "businesses nearby" ? "" : checkInSearch.trim()}
      onCreated={(leadId, name) => {
        setSelectedLeadId(leadId);
        setCheckInSearch(name);
        invalidateXpotData();
      }}
    />
    </>
  );
}
