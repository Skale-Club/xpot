import { useState, useRef } from "react";
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

type VisitLike = {
  id: number;
  leadId: number;
  lead?: SalesLead & { locations?: any[] };
  status: string;
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  durationSeconds?: number | null;
  note?: SalesVisitNote | null;
};


function VisitDetail({ visit, onDelete }: { visit: VisitLike; onDelete: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(visit.status);
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
      const result = await res.json() as { photoUrl: string };
      setPhotos((prev) => [result.photoUrl, ...prev]);
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      toast({ title: "Photo added", variant: "success" });
    } catch (err: any) {
      toast({ title: "Failed to upload photo", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto(url: string) {
    if (!visit.lead) return;
    setPhotos((prev) => prev.filter((u) => u !== url));
    apiRequest("DELETE", `/api/xpot/leads/${visit.lead.id}/photos`, { photoUrl: url })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }))
      .catch((err: Error) => toast({ title: "Failed to remove photo", description: err.message, variant: "destructive" }));
  }

  async function handleStatusChange(newStatus: VisitStatus) {
    setStatus(newStatus);
    try {
      await apiRequest("PATCH", `/api/xpot/visits/${visit.id}`, { status: newStatus });
      toast({ title: "Status updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    }
  }

  function saveField(key: keyof typeof fields, value: string) {
    if (!visit.lead) return;
    setFields((prev) => ({ ...prev, [key]: value }));
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead!.id}`, { [key]: value || undefined })
      .then(() => {
        toast({ title: "Saved", variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      })
      .catch((err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }));
  }

  function saveSocials(updated: { platform: string; url: string }[]) {
    if (!visit.lead) return;
    setSocials(updated);
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead.id}`, { socialUrls: updated })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }))
      .catch((err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }));
  }

  function saveLocation(value: string) {
    if (!visit.lead) return;
    // Optimistic local state update using fields isn't strictly necessary since it uses API data directly on re-render,
    // but if we had a local 'locations' state we'd update it here.
    apiRequest("PATCH", `/api/xpot/leads/${visit.lead.id}/location`, { addressLine1: value, label: "Main" })
      .then(() => {
        toast({ title: "Address saved", variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      })
      .catch((err: Error) => toast({ title: "Failed to save address", description: err.message, variant: "destructive" }));
  }

  async function handleAudioUpload({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) {
    const reader = new FileReader();
    const audioData = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });
    const response = await apiRequest("POST", `/api/xpot/visits/${visit.id}/audio`, { audioData, durationSeconds });
    const result = await response.json() as { note: SalesVisitNote; transcriptionAvailable: boolean; analysisApplied: boolean };
    toast({ variant: "success", title: result.analysisApplied ? "Audio analyzed" : "Audio note saved" });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
  }

  return (
    <div className="space-y-5">
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
          <InlineField label="Phone" value={fields.phone} onSave={(v) => saveField("phone", v)} linkable linkHref={fields.phone ? `tel:${fields.phone}` : undefined} />
          
          <InlineField 
            label="Address" 
            value={visit.lead.locations?.[0]?.addressLine1 || ""} 
            onSave={(v) => saveLocation(v)} 
            linkable={!!visit.lead.locations?.[0]?.addressLine1} 
            linkHref={visit.lead.locations?.[0]?.addressLine1 ? `https://maps.google.com/?q=${encodeURIComponent(visit.lead.locations[0].addressLine1 + (visit.lead.locations[0].addressLine2 ? " " + visit.lead.locations[0].addressLine2 : "") + (visit.lead.locations[0].city ? " " + visit.lead.locations[0].city : ""))}` : undefined} 
          />

          <div className="my-1.5 h-px bg-white/[0.04]" />
          <InlineField label="Website" value={fields.website} onSave={(v) => saveField("website", v)} linkable />
          <InlineField label="Email" value={fields.email} onSave={(v) => saveField("email", v)} linkable linkHref={fields.email ? `mailto:${fields.email}` : undefined} validate={validateEmail} />
          <InlineField label="Industry" value={fields.industry} onSave={(v) => saveField("industry", v)} />

          <div className="my-1.5 h-px bg-white/[0.04]" />

          {/* Social networks */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Social Networks</div>
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
                    <option key={p} value={p} className="bg-[#0e1117] capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
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
                  placeholder="URL or handle"
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
              <Plus className="h-3 w-3" /> Add Social
            </button>
          </div>

          <div className="my-1.5 h-px bg-white/[0.04]" />

          {/* Photos */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Photos</div>
            {photos.length > 0 && (
              <div className="space-y-2">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden">
                  <img src={photos[0]} alt="Cover" className="w-full h-full object-cover" />
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
                        <img src={url} alt="" className="w-full h-full object-cover" />
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
              {uploadingPhoto ? "Uploading..." : "Add photo"}
            </button>
          </div>
        </div>
      )}

      <StatusPicker value={status} onChange={handleStatusChange} />

      {/* Time metadata */}
      <div
        className="grid grid-cols-3 gap-3 rounded-2xl p-3"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">Check-in</div>
          <div className="text-xs text-white/70">{formatDateTime(visit.checkedInAt)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">Check-out</div>
          <div className="text-xs text-white/70">{formatDateTime(visit.checkedOutAt)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">Duration</div>
          <div className="text-xs text-white/70">{formatDuration(visit.durationSeconds)}</div>
        </div>
      </div>

      {/* AI Summary */}
      {visit.note?.summary ? (
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70">AI Summary</div>
          <p className="text-sm text-white/70 leading-relaxed">{visit.note.summary}</p>
        </div>
      ) : null}

      {/* Voice recorder */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <VoiceRecorder
          onUpload={handleAudioUpload}
          existingAudio={visit.note?.audioUrl}
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
        Delete visit
      </button>
    </div>
  );
}

export function VisitRow({ visit }: { visit: VisitLike }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();

  async function handleDelete() {
    try {
      await apiRequest("DELETE", `/api/xpot/visits/${visit.id}`);
      toast({ title: "Visit deleted", variant: "success" });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl p-4 text-left transition-all"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        <LeadCardBody
          lead={{
            name: visit.lead?.name || `Lead #${visit.leadId}`,
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
          className="max-w-sm rounded-3xl border-white/10 max-h-[88vh] overflow-y-auto"
          style={{ background: "rgba(10,15,30,0.97)", backdropFilter: "blur(20px)" }}
        >
          <DialogHeader>
            <DialogTitle className="sr-only">{visit.lead?.name || `Lead #${visit.leadId}`}</DialogTitle>
          </DialogHeader>
          <VisitDetail visit={visit} onDelete={() => { setOpen(false); setConfirmDelete(true); }} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          className="max-w-xs rounded-2xl border-0 p-6"
          style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-white">Delete visit?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-white/45">
              This will permanently delete this visit record and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 flex-row gap-2 sm:space-x-0">
            <AlertDialogCancel
              className="flex-1 rounded-xl border-0 text-sm font-medium text-white/60 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="flex-1 rounded-xl border-0 text-sm font-medium text-white"
              style={{ background: "rgba(239,68,68,0.85)" }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
