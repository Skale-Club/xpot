import { useEffect, useRef, useState } from "react";
import { Camera, Plus, X } from "lucide-react";
import type { SalesLead } from "../../types";
import { InlineField, validateEmail } from "../InlineField";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fileSrc } from "@/lib/files";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { InlineStateSelect } from "@/components/StateSelect";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";

type CompanyLead = SalesLead & {
  locations?: Array<{
    label?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }>;
};

/** The one company editor shared by lead, customer and visit surfaces. */
export function CompanyInlineEditor({ lead }: { lead: CompanyLead }) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tl = useT(leadsMessages);
  const primaryLocation = lead.locations?.[0];
  const [fields, setFields] = useState({
    phone: lead.phone || "",
    email: lead.email || "",
    website: lead.website || "",
    industry: lead.industry || "",
  });
  const [location, setLocation] = useState(() => ({
    addressLine1: primaryLocation?.addressLine1 || "",
    addressLine2: primaryLocation?.addressLine2 || "",
    city: primaryLocation?.city || "",
    state: primaryLocation?.state || "",
    postalCode: primaryLocation?.postalCode || "",
    country: primaryLocation?.country || "US",
  }));
  const [socials, setSocials] = useState<{ platform: string; url: string }[]>(lead.socialUrls ?? []);
  const [photos, setPhotos] = useState<string[]>(lead.photos ?? []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoToRemove, setPhotoToRemove] = useState<string | null>(null);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFields({ phone: lead.phone || "", email: lead.email || "", website: lead.website || "", industry: lead.industry || "" });
  }, [lead.id, lead.phone, lead.email, lead.website, lead.industry]);

  useEffect(() => {
    setLocation({
      addressLine1: primaryLocation?.addressLine1 || "",
      addressLine2: primaryLocation?.addressLine2 || "",
      city: primaryLocation?.city || "",
      state: primaryLocation?.state || "",
      postalCode: primaryLocation?.postalCode || "",
      country: primaryLocation?.country || "US",
    });
  }, [
    lead.id,
    primaryLocation?.addressLine1,
    primaryLocation?.addressLine2,
    primaryLocation?.city,
    primaryLocation?.state,
    primaryLocation?.postalCode,
    primaryLocation?.country,
  ]);

  useEffect(() => {
    setSocials(lead.socialUrls ?? []);
  }, [lead.id, lead.socialUrls]);

  useEffect(() => {
    setPhotos(lead.photos ?? []);
  }, [lead.id, lead.photos]);

  function saved() {
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
  }

  function saveField(key: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { [key]: value || undefined })
      .then(() => { toast({ title: t("saved"), variant: "success" }); saved(); })
      .catch((error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }));
  }

  function saveLocation(key: keyof typeof location, value: string) {
    const updated = { ...location, [key]: value };
    setLocation(updated);
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}/location`, { ...updated, label: lead.locations?.[0]?.label || "Main" })
      .then(() => { toast({ title: t("addressSaved"), variant: "success" }); saved(); })
      .catch((error: Error) => toast({ title: t("addressSaveFailed"), description: error.message, variant: "destructive" }));
  }

  function saveSocials(updated: { platform: string; url: string }[]) {
    setSocials(updated);
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { socialUrls: updated })
      .then(saved)
      .catch((error: Error) => toast({ title: t("saveFailed"), description: error.message, variant: "destructive" }));
  }

  async function addPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const response = await apiRequest("POST", `/api/xpot/leads/${lead.id}/photos`, { imageData });
      const result = await response.json() as { photo: string };
      setPhotos((previous) => [result.photo, ...previous]);
      saved();
      toast({ title: t("photoAdded"), variant: "success" });
    } catch (error: any) {
      toast({ title: t("photoUploadFailed"), description: error.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto(photo: string) {
    setRemovingPhoto(true);
    try {
      await apiRequest("DELETE", `/api/xpot/leads/${lead.id}/photos`, { photo });
      setPhotos((previous) => previous.filter((item) => item !== photo));
      saved();
    } catch (error: any) {
      toast({ title: t("photoRemoveFailed"), description: error.message, variant: "destructive" });
      throw error;
    } finally {
      setRemovingPhoto(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="company-inline-editor">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addPhoto(file);
          event.target.value = "";
        }}
      />

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <InlineField label={tl("fieldPhone")} value={fields.phone} onSave={(value) => saveField("phone", value)} linkable linkHref={fields.phone ? `tel:${fields.phone}` : undefined} />
        <InlineField label={tl("fieldWebsite")} value={fields.website} onSave={(value) => saveField("website", value)} linkable />
        <InlineField label={tl("fieldEmail")} value={fields.email} onSave={(value) => saveField("email", value)} linkable linkHref={fields.email ? `mailto:${fields.email}` : undefined} validate={validateEmail} />
        <InlineField label={tl("fieldIndustry")} value={fields.industry} onSave={(value) => saveField("industry", value)} />
        <div className="sm:col-span-2">
          <InlineField label={tl("fieldStreet")} value={location.addressLine1} onSave={(value) => saveLocation("addressLine1", value)} linkable={Boolean(location.addressLine1)} linkHref={location.addressLine1 ? `https://maps.google.com/?q=${encodeURIComponent([location.addressLine1, location.city, location.state].filter(Boolean).join(" "))}` : undefined} />
        </div>
        <InlineField label={tl("fieldCity")} value={location.city} onSave={(value) => saveLocation("city", value)} />
        <InlineStateSelect label={tl("fieldState")} value={location.state} onSave={(value) => saveLocation("state", value)} placeholder={tl("fieldState")} />
        <InlineField label={tl("fieldPostal")} value={location.postalCode} onSave={(value) => saveLocation("postalCode", value)} />
      </div>

      <div className="h-px bg-white/[0.06]" />

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("socialNetworks")}</h3>
        {socials.map((social, index) => (
          <div key={`${social.platform}-${index}`} className="flex items-center gap-2">
            <select
              value={social.platform}
              onChange={(event) => saveSocials(socials.map((item, itemIndex) => itemIndex === index ? { ...item, platform: event.target.value } : item))}
              className="h-9 w-24 shrink-0 rounded-lg border border-white/[0.09] bg-white/[0.06] px-2 text-xs text-white/80 outline-none"
            >
              {["instagram", "linkedin", "facebook", "twitter", "youtube", "tiktok", "other"].map((platform) => (
                <option key={platform} value={platform} className="bg-[#0e1117] capitalize">{platform === "other" ? tl("socialOther") : platform}</option>
              ))}
            </select>
            <input
              value={social.url}
              onChange={(event) => setSocials(socials.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))}
              onBlur={() => saveSocials(socials)}
              onKeyDown={(event) => { if (event.key === "Enter") saveSocials(socials); }}
              placeholder={tl("socialPlaceholder")}
              className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-white/[0.06] px-2 text-xs text-white/80 outline-none placeholder:text-white/25"
            />
            <button type="button" onClick={() => saveSocials(socials.filter((_, itemIndex) => itemIndex !== index))} aria-label={t("removeSocial")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/30 transition hover:bg-red-500/10 hover:text-red-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setSocials((previous) => [...previous, { platform: "instagram", url: "" }])} className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-indigo-300 transition hover:text-indigo-200">
          <Plus className="h-3 w-3" /> {t("addSocial")}
        </button>
      </section>

      <div className="h-px bg-white/[0.06]" />

      <section className="space-y-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("photos")}</h3>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <div key={photo} className={`group relative overflow-hidden rounded-xl ${index === 0 ? "col-span-2 row-span-2 aspect-video" : "aspect-square"}`}>
                <img src={fileSrc(photo)} alt={index === 0 ? t("coverAlt") : ""} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhotoToRemove(photo)} aria-label={t("removePhoto")} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/70 opacity-0 transition group-hover:opacity-100 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-3 text-xs font-medium text-white/40 transition hover:border-white/20 hover:text-white/65 disabled:opacity-40">
          <Camera className="h-3.5 w-3.5" /> {uploadingPhoto ? t("uploading") : t("addPhoto")}
        </button>
        <ConfirmDialog
          open={photoToRemove !== null}
          onOpenChange={(open) => { if (!open) setPhotoToRemove(null); }}
          title={t("removePhotoTitle")}
          description={t("removePhotoDesc")}
          confirmLabel={t("removePhoto")}
          cancelLabel={t("keepPhoto")}
          destructive
          pending={removingPhoto}
          onConfirm={() => (photoToRemove ? removePhoto(photoToRemove) : undefined)}
        />
      </section>
    </div>
  );
}
