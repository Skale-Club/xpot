import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/ui/loader";
import { ColorField } from "@/components/ui/color-picker";
import { Upload, Palette } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";

type Branding = {
  faviconUrl: string | null;
  faviconContentType: string | null;
  logoUrl: string | null;
  logoContentType: string | null;
  appName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  updatedAt: string | null;
};

export function AdminBranding() {
  const query = useQuery<Branding>({ queryKey: ["/api/xpot/admin/branding"] });
  const t = useT(manageMessages);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-red-400">{t("brandingLoadFailed")}</p>;
  }

  return <BrandingForm branding={query.data} />;
}

function BrandingForm({ branding }: { branding: Branding }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const faviconFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const [appName, setAppName] = useState(branding.appName);
  const [shortName, setShortName] = useState(branding.shortName);
  const [themeColor, setThemeColor] = useState(branding.themeColor);
  const [backgroundColor, setBackgroundColor] = useState(branding.backgroundColor);
  const fieldLabel = (path: string) =>
    ({ appName: t("appName"), shortName: t("shortName"), themeColor: t("themeColor"), backgroundColor: t("backgroundColor") })[path];
  // The public icon, logo and manifest are cached for 5 minutes (branding.ts), so "done" needs that caveat.
  const saved = (title: string) => toast({ title, description: t("brandingCacheNote"), variant: "success" });

  const faviconPreviewSrc = branding.faviconUrl
    ? `${branding.faviconUrl}${branding.faviconUrl.includes("?") ? "&" : "?"}t=${branding.updatedAt ?? ""}`
    : "/favicon.png";
  const logoPreviewSrc = branding.logoUrl
    ? `${branding.logoUrl}${branding.logoUrl.includes("?") ? "&" : "?"}t=${branding.updatedAt ?? ""}`
    : "/xpot-logo.svg";

  const faviconUpload = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/admin/branding/favicon", { imageData });
      return res.json();
    },
    onSuccess: () => {
      saved(t("iconUpdated"));
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/branding"] });
    },
    onError: (e: Error) => toast({ title: t("uploadError"), description: e.message, variant: "destructive" }),
  });

  const logoUpload = useMutation({
    mutationFn: async (imageData: string) => {
      const res = await apiRequest("POST", "/api/xpot/admin/branding/logo", { imageData });
      return res.json();
    },
    onSuccess: () => {
      saved(t("logoUpdated"));
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/branding"] });
    },
    onError: (e: Error) => toast({ title: t("uploadError"), description: e.message, variant: "destructive" }),
  });

  const saveMeta = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/xpot/admin/branding", {
        appName,
        shortName,
        themeColor,
        backgroundColor,
      });
      return res.json();
    },
    onSuccess: () => {
      saved(t("brandingSaved"));
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/branding"] });
    },
    onError: (e: Error) => toast({ title: t("errorSaving"), description: describeApiError(e, fieldLabel), variant: "destructive" }),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>, asset: "favicon" | "logo") {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("fileTooLarge"), description: t("maxFileSize"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      (asset === "favicon" ? faviconUpload : logoUpload).mutate(reader.result as string);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Palette className="h-4 w-4" />
        {t("brandingIntro")}
      </div>

      {/* Favicon / app icon */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold">{t("favicon")}</h3>
        <p className="mt-1 text-sm text-white/45">{t("faviconDescription")}</p>
        <div className="mt-4 flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e]">
            <img src={faviconPreviewSrc} alt={t("iconAlt")} className="h-16 w-16 object-contain" />
          </div>
          <div>
            <input
              ref={faviconFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
              onChange={(event) => onFile(event, "favicon")}
              className="hidden"
            />
            <button
              onClick={() => faviconFileRef.current?.click()}
              disabled={faviconUpload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {faviconUpload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("uploadImage")}
            </button>
            <p className="mt-2 text-xs text-white/35">{t("uploadFormats")}</p>
          </div>
        </div>
      </div>

      {/* Horizontal logo */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold">{t("logo")}</h3>
        <p className="mt-1 text-sm text-white/45">{t("logoDescription")}</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-full max-w-xs shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e] px-5">
            <img src={logoPreviewSrc} alt={t("logoAlt")} className="max-h-16 w-full object-contain" />
          </div>
          <div>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => onFile(event, "logo")}
              className="hidden"
            />
            <button
              onClick={() => logoFileRef.current?.click()}
              disabled={logoUpload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {logoUpload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t("uploadImage")}
            </button>
            <p className="mt-2 text-xs text-white/35">{t("logoUploadFormats")}</p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="font-semibold">{t("appAndColors")}</h3>
        <p className="mt-1 text-sm text-white/45">{t("appAndColorsHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">{t("appName")}</label>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">{t("shortName")}</label>
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0a0f1e] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>
          <ColorField label={t("themeColor")} value={themeColor} onChange={setThemeColor} />
          <ColorField label={t("backgroundColor")} value={backgroundColor} onChange={setBackgroundColor} />
        </div>
        <div className="mt-4">
          <button
            onClick={() => saveMeta.mutate()}
            disabled={saveMeta.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {saveMeta.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
