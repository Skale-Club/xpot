import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusBadge, StatusPicker } from "./VisitStatus";
import type { VisitStatus } from "./VisitStatus";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VoiceRecorder } from "./VoiceRecorder";
import { InlineField, validateEmail } from "./InlineField";
import { formatDateTime, formatDuration } from "../utils";
import type { SalesLead, SalesVisitNote } from "../types";
import { Trash2, Plus, X, Camera } from "lucide-react";
import { LeadCardBody } from "./LeadCardBody";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { VisitActionsPanel } from "./sales/VisitActions";
import { useLocation } from "wouter";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { fileSrc } from "@/lib/files";

export type VisitLike = {
  id: number;
  leadId: number;
  lead?: SalesLead & { locations?: any[] };
  status: string;
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  durationSeconds?: number | null;
  note?: SalesVisitNote | null;
};


/** A visit's editable record: lead fields, outcome, timings, notes, voice. */
export function VisitDetail({ visit, onDelete, layout = "dialog" }: {
  visit: VisitLike;
  onDelete: () => void;
  /** "pane" stacks everything in one column (the desktop side pane is narrow). */
  layout?: "dialog" | "pane";
}) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tl = useT(leadsMessages);
  const [status, setStatus] = useState(visit.status);
  // The desktop pane stays open across refetches: follow outcome changes made
  // elsewhere (e.g. a check-out from the active-visit strip).
  useEffect(() => setStatus(visit.status), [visit.status]);
  const [fields, setFields] = useState({
    name: visit.lead?.name || "",
    phone: visit.lead?.phone || "",
    email: visit.lead?.email || "",
    website: visit.lead?.website || "",
    industry: visit.lead?.industry || "",
  });
  const [socials, setSocials] = useState<{ platform: string; url: string }[]>(
    ((visit.lead as any)?.socialUrls as { platform: string; url: string }[]) || []
  );
  const [photos, setPhotos] = useState<string[]>(
    ((visit.lead as any)?.photos as string[]) || []
  );
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(file: File) {
    if (!visit.lead) return;
    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", `/api/xpot/leads/${visit.lead.id}/photos`, { imageData });
      const result = await res.json() as { photo: string };
      setPhotos((prev) => [result.photo, ...prev]);
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      toast({ title: t("photoAdded"), variant: "success" });
    } catch (err: any) {
      toast({ title: t("photoUploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto(photo: string) {
    if (!visit.lead) return;
    setPhotos((prev) => prev.filter((u) => u !== photo));
    apiRequest("DELETE", `/api/xpot/leads/${visit.lead.id}/photos`, { photo })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }))
      .catch((err: Error) => toast({ title: t("photoRemoveFailed"), description: err.message, variant: "destructive" }));
  }

  async function handleStatusChange(newStatus: VisitStatus) {
    setStatus(newStatus);
    try {
      await apiRequest("PATCH", `/api/xpot/visits/${visit.id}`, { status: newStatus });
      toast({ title: t("statusUpdated"), variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      toast({ title: t("statusUpdateFailed"), description: err.message, variant: "destructive" });
    }
  }

  function saveField(key: keyof typeof fields, value: string) {
    if (!visit.lead) return;
    setFields((prev) => ({ ...prev, [key]: value }));
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead!.id}`, { [key]: value || undefined })
      .then(() => {
        toast({ title: t("saved"), variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      })
      .catch((err: Error) => toast({ title: t("saveFailed"), description: err.message, variant: "destructive" }));
  }

  function saveSocials(updated: { platform: string; url: string }[]) {
    if (!visit.lead) return;
    setSocials(updated);
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead.id}`, { socialUrls: updated })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }))
      .catch((err: Error) => toast({ title: t("saveFailed"), description: err.message, variant: "destructive" }));
  }

  function saveLocation(value: string) {
    if (!visit.lead) return;
    // Optimistic local state update using fields isn't strictly necessary since it uses API data directly on re-render,
    // but if we had a local 'locations' state we'd update it here.
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead.id}/location`, { addressLine1: value, label: "Main" })
      .then(() => {
        toast({ title: t("addressSaved"), variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      })
      .catch((err: Error) => toast({ title: t("addressSaveFailed"), description: err.message, variant: "destructive" }));
  }

  async function handleAudioUpload({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) {
    if (audioBlob.size > 3 * 1024 * 1024) {
      toast({ title: "Recording too large", description: "Keep voice notes under five minutes.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    const audioData = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });
    const response = await apiRequest("POST", `/api/xpot/visits/${visit.id}/audio`, { audioData, durationSeconds });
    const result = await response.json() as { note: SalesVisitNote; transcriptionAvailable: boolean; readyToAnalyze: boolean };

    let detected = 0;
    if (result.readyToAnalyze) {
      try {
        const analyzed = await apiRequest("POST", `/api/xpot/visits/${visit.id}/analyze`, {});
        detected = ((await analyzed.json()) as { actions?: unknown[] }).actions?.length ?? 0;
      } catch {
        // Transcript is saved; analysis can be retried without re-recording.
      }
    }
    toast({
      variant: "success",
      title: detected > 0 ? t.plural("actionsDetected", detected) : t("audioSaved"),
      description: detected > 0 ? t("actionsReviewBelow") : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits", visit.id, "actions"] });
  }

  return (
    // One column on a phone, two side by side once there is room: the details
    // are long enough that a single narrow column meant scrolling through a
    // letterbox on desktop.
    <div className={visit.lead && layout === "dialog" ? "grid gap-5 sm:grid-cols-2 sm:items-start" : "space-y-5"}>
      {/* hidden file input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }}
      />

      {/* Lead fields */}
      {visit.lead && (
        <div className="space-y-2.5">
          <InlineField label="" large value={fields.name} onSave={(v) => saveField("name", v)} />
          <InlineField label={tl("fieldPhone")} value={fields.phone} onSave={(v) => saveField("phone", v)} linkable linkHref={fields.phone ? `tel:${fields.phone}` : undefined} />
          
          <InlineField 
            label={tl("fieldAddress")} 
            value={visit.lead.locations?.[0]?.addressLine1 || ""} 
            onSave={(v) => saveLocation(v)} 
            linkable={!!visit.lead.locations?.[0]?.addressLine1} 
            linkHref={visit.lead.locations?.[0]?.addressLine1 ? `https://maps.google.com/?q=${encodeURIComponent(visit.lead.locations[0].addressLine1 + (visit.lead.locations[0].addressLine2 ? " " + visit.lead.locations[0].addressLine2 : "") + (visit.lead.locations[0].city ? " " + visit.lead.locations[0].city : ""))}` : undefined} 
          />

          <div className="my-1.5 h-px bg-white/[0.04]" />
          <InlineField label={tl("fieldWebsite")} value={fields.website} onSave={(v) => saveField("website", v)} linkable />
          <InlineField label={tl("fieldEmail")} value={fields.email} onSave={(v) => saveField("email", v)} linkable linkHref={fields.email ? `mailto:${fields.email}` : undefined} validate={validateEmail} />
          <InlineField label={tl("fieldIndustry")} value={fields.industry} onSave={(v) => saveField("industry", v)} />

          <div className="my-1.5 h-px bg-white/[0.04]" />

          {/* Social networks */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("socialNetworks")}</div>
            {socials.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={s.platform}
                  onChange={(e) => {
                    const updated = socials.map((item, idx) => idx === i ? { ...item, platform: e.target.value } : item);
                    saveSocials(updated);
                  }}
                  className="h-8 w-24 shrink-0 rounded-lg px-2 text-xs text-white/80 outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  {["instagram","linkedin","facebook","twitter","youtube","tiktok","other"].map((p) => (
                    <option key={p} value={p} className="bg-[#0e1117] capitalize">{p === "other" ? tl("socialOther") : p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <input
                  value={s.url}
                  onChange={(e) => {
                    const updated = socials.map((item, idx) => idx === i ? { ...item, url: e.target.value } : item);
                    setSocials(updated);
                  }}
                  onBlur={() => saveSocials(socials)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveSocials(socials); }}
                  placeholder={tl("socialPlaceholder")}
                  className="flex-1 min-w-0 h-8 rounded-lg px-2 text-xs text-white/80 outline-none placeholder:text-white/25"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
                />
                <button
                  type="button"
                  onClick={() => saveSocials(socials.filter((_, idx) => idx !== i))}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 hover:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => saveSocials([...socials, { platform: "instagram", url: "" }])}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors pt-0.5"
            >
              <Plus className="h-3 w-3" /> {t("addSocial")}
            </button>
          </div>

          <div className="my-1.5 h-px bg-white/[0.04]" />

          {/* Photos */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("photos")}</div>
            {photos.length > 0 && (
              <div className="space-y-2">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden">
                  <img src={fileSrc(photos[0])} alt={t("coverAlt")} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photos[0])}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/70 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {photos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.slice(1).map((url, i) => (
                      <div key={i} className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden">
                        <img src={fileSrc(url)} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(url)}
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white/70 hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-medium text-white/40 transition-colors hover:text-white/60"
              style={{ border: "1.5px dashed rgba(255,255,255,0.1)" }}
            >
              <Camera className="h-3.5 w-3.5" />
              {uploadingPhoto ? t("uploading") : t("addPhoto")}
            </button>
          </div>
        </div>
      )}

      {/* Second column: outcome, timings, notes and the destructive action */}
      <div className="space-y-5">
      <StatusPicker value={status} onChange={handleStatusChange} />

      {/* Time metadata */}
      <div
        className="grid grid-cols-3 gap-3 rounded-2xl p-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">{t("checkIn")}</div>
          <div className="text-xs text-white/70">{formatDateTime(visit.checkedInAt)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">{t("checkOut")}</div>
          <div className="text-xs text-white/70">{formatDateTime(visit.checkedOutAt)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">{t("duration")}</div>
          <div className="text-xs text-white/70">{formatDuration(visit.durationSeconds)}</div>
        </div>
      </div>

      {/* AI Summary */}
      {visit.note?.summary ? (
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70">{t("aiSummary")}</div>
          <p className="text-sm text-white/70 leading-relaxed">{visit.note.summary}</p>
        </div>
      ) : null}

      {/* What the note asked us to record */}
      <VisitActionsPanel visitId={visit.id} />

      {/* Voice recorder */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <VoiceRecorder
          onUpload={handleAudioUpload}
          existingAudio={fileSrc(visit.note?.audioUrl)}
          existingDuration={visit.note?.audioDurationSeconds}
          existingTranscription={visit.note?.audioTranscription}
        />
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 mt-2 text-sm font-medium text-red-500/60 transition-all hover:bg-white/5 hover:text-red-400 active:scale-[0.98] active:bg-white/10 touch-manipulation"
        style={{ border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <Trash2 className="h-4 w-4" />
        {t("deleteVisit")}
      </button>
      </div>
    </div>
  );
}

/** Confirms and deletes a visit. */
export function VisitDeleteConfirm({ visitId, open, onOpenChange, onDeleted }: {
  visitId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tc = useT(commonMessages);

  async function handleDelete() {
    try {
      await apiRequest("DELETE", `/api/xpot/visits/${visitId}`);
      toast({ title: t("visitDeleted"), variant: "success" });
      onDeleted?.();
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      toast({ title: t("deleteFailed"), description: err.message, variant: "destructive" });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-xs rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-white">{t("deleteVisitTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-white/45">
            {t("deleteVisitDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-row gap-2 sm:space-x-0">
          <AlertDialogCancel
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white/60 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white"
            style={{ background: "rgba(239,68,68,0.85)" }}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A visit card. On the phone it opens the visit in a dialog; on desktop it
 * goes to /visits/:id, where the visits screen shows it beside the list.
 */
export function VisitRow({ visit }: { visit: VisitLike }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const tl = useT(leadsMessages);

  return (
    <>
      <button
        type="button"
        onClick={() => (isDesktop ? navigate(`/visits/${visit.id}`) : setOpen(true))}
        className="w-full rounded-2xl p-4 text-left transition-all"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        <LeadCardBody
          lead={{
            name: visit.lead?.name || tl("leadNumber", { id: visit.leadId }),
            phone: visit.lead?.phone,
            website: visit.lead?.website,
            industry: visit.lead?.industry,
            ghlContactId: (visit.lead as any)?.ghlContactId,
            photos: (visit.lead as any)?.photos,
            locations: visit.lead?.locations,
          }}
          subtitle={
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              {formatDateTime(visit.checkedInAt)}
            </div>
          }
          right={<StatusBadge status={visit.status} />}
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[calc(100vw-1.5rem)] sm:max-w-3xl rounded-3xl border-white/10 max-h-[88vh] overflow-y-auto"
          style={{ background: "rgba(10,15,30,0.97)", backdropFilter: "blur(20px)" }}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">{visit.lead?.name || tl("leadNumber", { id: visit.leadId })}</DialogTitle>
          </DialogHeader>
          <VisitDetail visit={visit} onDelete={() => { setOpen(false); setConfirmDelete(true); }} />
        </DialogContent>
      </Dialog>

      <VisitDeleteConfirm visitId={visit.id} open={confirmDelete} onOpenChange={setConfirmDelete} onDeleted={() => setOpen(false)} />
    </>
  );
}
