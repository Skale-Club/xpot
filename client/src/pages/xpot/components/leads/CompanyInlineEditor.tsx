import { useEffect, useRef, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
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
import { Input, Select } from "@/components/xpot/Field";
import { Button } from "@/components/ui/button";
import { EYEBROW } from "@/components/xpot/surface";
import { displayPhone, phoneHref } from "../../utils";
import { maskUsPhoneInput } from "../../phoneInput";
import { SOCIAL_PLATFORMS } from "./socials";

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
        <InlineField label={tl("fieldPhone")} value={fields.phone} onSave={(value) => saveField("phone", value)} linkable linkHref={phoneHref(fields.phone)} formatInput={maskUsPhoneInput} display={displayPhone} inputMode="tel" />
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
        <h3 className={EYEBROW}>{t("socialNetworks")}</h3>
        {socials.map((social, index) => (
          <div key={`${social.platform}-${index}`} className="flex items-center gap-2">
            <div className="w-32 shrink-0">
              <Select
                value={social.platform}
                aria-label={t("socialNetworks")}
                onChange={(event) => saveSocials(socials.map((item, itemIndex) => itemIndex === index ? { ...item, platform: event.target.value } : item))}
                options={SOCIAL_PLATFORMS.map((platform) => ({ value: platform.value, label: platform.name ?? tl("socialOther") }))}
              />
            </div>
            <Input
              value={social.url}
              aria-label={tl("socialPlaceholder")}
              onChange={(event) => setSocials(socials.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))}
              onBlur={() => saveSocials(socials)}
              onKeyDown={(event) => { if (event.key === "Enter") saveSocials(socials); }}
              placeholder={tl("socialPlaceholder")}
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => saveSocials(socials.filter((_, itemIndex) => itemIndex !== index))} aria-label={t("removeSocial")} title={t("removeSocial")} className="text-white/45 hover:bg-red-500/10 hover:text-red-300">
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setSocials((previous) => [...previous, { platform: "instagram", url: "" }])} className="-ml-2 text-blue-300">
          <Plus aria-hidden="true" /> {t("addSocial")}
        </Button>
      </section>

      <div className="h-px bg-white/[0.06]" />

      <section className="space-y-2">
        <h3 className={EYEBROW}>{t("photos")}</h3>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <div key={photo} className={`group relative overflow-hidden rounded-xl ${index === 0 ? "col-span-2 row-span-2 aspect-video" : "aspect-square"}`}>
                <img src={fileSrc(photo)} alt={index === 0 ? t("coverAlt") : ""} className="h-full w-full object-cover" />
                {/* Always visible on touch screens (no hover there). */}
                <button type="button" onClick={() => setPhotoToRemove(photo)} aria-label={t("removePhoto")} title={t("removePhoto")} className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:text-red-300 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <Button type="button" variant="outline" onClick={() => photoInputRef.current?.click()} loading={uploadingPhoto} className="w-full border-dashed">
          <Camera aria-hidden="true" /> {t("addPhoto")}
        </Button>
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
