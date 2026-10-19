import { useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { ErrorState } from "@/components/xpot/EmptyState";
import { Field, Input } from "@/components/xpot/Field";
import { FormFooter } from "@/components/xpot/FormFooter";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_CLASS } from "@/components/xpot/surface";
import { Palette, RotateCcw, Upload } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageMessages } from "@/i18n/messages/manage";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { readableOn } from "./platform/brandSiteUi";

// Brand & public site › Identity (the icon and the logo) and › Installed app
// (name and colours of the home-screen app). platform/AdminBrandSite.tsx puts
// them in tabs next to the Landing page editor.

export type Branding = {
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

export const BRANDING_KEY = ["/api/xpot/admin/branding"];
const DEFAULT_ICON = "/favicon.png";
const DEFAULT_LOGO = "/xpot-logo.svg";

/** The uploaded image with a cache-busting stamp, or Xpot's own. */
function assetSrc(url: string | null, updatedAt: string | null, fallback: string) {
  return url ? `${url}${url.includes("?") ? "&" : "?"}t=${updatedAt ?? ""}` : fallback;
}

/** Loads the branding once for whichever panel is shown. */
function WithBranding({ children }: { children: (branding: Branding) => ReactNode }) {
  const query = useQuery<Branding>({ queryKey: BRANDING_KEY });
  const t = useT(manageMessages);
  if (query.isLoading) return <ListSkeleton rows={2} rowClassName="h-44 rounded-2xl" className="space-y-4" />;
  if (query.isError || !query.data) {
    return <ErrorState message={t("brandingLoadFailed")} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

/** A preview tile on a dark or light ground, so the image is checked on both. */
function PreviewTile({ ground, label, wide, children }: { ground: "dark" | "light"; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <figure className="min-w-0">
      <div
        className={`flex items-center justify-center overflow-hidden rounded-2xl border ${wide ? "h-24 px-5" : "h-24 w-24"} ${
          ground === "dark" ? "border-white/10 bg-[#0a0f1e]" : "border-black/10 bg-white"
        }`}
      >
        {children}
      </div>
      <figcaption className="mt-1.5 text-[11px] text-white/45">{label}</figcaption>
    </figure>
  );
}

function AssetCard({
  asset,
  branding,
}: {
  asset: "favicon" | "logo";
  branding: Branding;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const t = useT(manageMessages);
  const tp = useT(platformAdminMessages);
  const isIcon = asset === "favicon";
  const custom = isIcon ? branding.faviconUrl : branding.logoUrl;
  const src = assetSrc(custom, branding.updatedAt, isIcon ? DEFAULT_ICON : DEFAULT_LOGO);
  // The public icon, logo and manifest are cached for 5 minutes (branding.ts), so "done" needs that caveat.
  const done = (title: string) => {
    toast({ title, description: t("brandingCacheNote"), variant: "success" });
    void queryClient.invalidateQueries({ queryKey: BRANDING_KEY });
  };

  const upload = useMutation({
    mutationFn: async (imageData: string) => (await apiRequest("POST", `/api/xpot/admin/branding/${asset}`, { imageData })).json(),
    onSuccess: () => done(isIcon ? t("iconUpdated") : t("logoUpdated")),
    onError: (e: Error) => toast({ title: t("uploadError"), description: describeApiError(e), variant: "destructive" }),
  });
  const restore = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/xpot/admin/branding/${asset}`)).json(),
    onSuccess: () => {
      setConfirmRestore(false);
      done(isIcon ? tp("iconRestored") : tp("logoRestored"));
    },
    onError: (e: Error) => toast({ title: t("errorSaving"), description: describeApiError(e), variant: "destructive" }),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("fileTooLarge"), description: t("maxFileSize"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      upload.mutate(reader.result as string);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className={`rounded-2xl ${GLASS_CLASS} p-5`} data-testid={`branding-${asset}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{isIcon ? t("favicon") : t("logo")}</h3>
        <Pill tone="slate">{custom ? tp("usingCustom") : tp("usingDefault")}</Pill>
      </div>
      <p className="mt-1 text-sm text-white/45">{isIcon ? t("faviconDescription") : t("logoDescription")}</p>

      <div className={`mt-4 ${isIcon ? "flex flex-wrap gap-4" : "grid gap-4 sm:grid-cols-2"}`}>
        <PreviewTile ground="dark" label={tp("onDark")} wide={!isIcon}>
          <img src={src} alt={isIcon ? t("iconAlt") : t("logoAlt")} className={isIcon ? "h-16 w-16 object-contain" : "max-h-14 w-full object-contain"} />
        </PreviewTile>
        <PreviewTile ground="light" label={tp("onLight")} wide={!isIcon}>
          <img src={src} alt="" className={isIcon ? "h-16 w-16 object-contain" : "max-h-14 w-full object-contain"} />
        </PreviewTile>
        {isIcon && (
          // Home screens often crop the icon to a circle.
          <PreviewTile ground="dark" label={tp("roundIcon")}>
            <img src={src} alt="" className="h-16 w-16 rounded-full object-cover" />
          </PreviewTile>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={isIcon ? "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico" : "image/png,image/jpeg,image/webp,image/svg+xml"}
          onChange={onFile}
          className="hidden"
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
          <Upload />
          {t("uploadImage")}
        </Button>
        {custom && (
          <Button variant="ghost" onClick={() => setConfirmRestore(true)} disabled={upload.isPending} data-testid={`branding-restore-${asset}`}>
            <RotateCcw />
            {tp("restoreDefault")}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-white/35">{isIcon ? t("uploadFormats") : t("logoUploadFormats")} {t("brandingCacheNote")}</p>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={(open) => !open && setConfirmRestore(false)}
        title={isIcon ? tp("restoreIconTitle") : tp("restoreLogoTitle")}
        description={tp("restoreBody")}
        confirmLabel={tp("restoreDefault")}
        busy={restore.isPending}
        onConfirm={() => restore.mutate()}
        testId={`branding-restore-${asset}-dialog`}
      />
    </section>
  );
}

/** Identity: the square icon and the horizontal logo, previewed on dark and light. */
export function BrandIdentity() {
  const tp = useT(platformAdminMessages);
  return (
    <WithBranding>
      {(branding) => (
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-white/50">
            <Palette className="mt-0.5 h-4 w-4 shrink-0" />
            {tp("identityIntro")}
          </div>
          <AssetCard asset="favicon" branding={branding} />
          <AssetCard asset="logo" branding={branding} />
        </div>
      )}
    </WithBranding>
  );
}

/** Installed app: its name and colours, with a phone preview of the draft. */
export function InstalledApp() {
  return <WithBranding>{(branding) => <InstalledAppForm branding={branding} />}</WithBranding>;
}

/** A small phone: the home-screen icon with its short name, or the opening screen. */
function PhoneMock({ kind, branding, draft }: { kind: "home" | "splash"; branding: Branding; draft: Pick<Branding, "appName" | "shortName" | "themeColor" | "backgroundColor"> }) {
  const tp = useT(platformAdminMessages);
  const icon = assetSrc(branding.faviconUrl, branding.updatedAt, DEFAULT_ICON);
  return (
    <figure className="w-36 shrink-0 sm:w-40">
      <div className="overflow-hidden rounded-[1.75rem] border-[5px] border-[#1f2937] bg-black shadow-xl shadow-black/40" aria-hidden="true">
        <div className="h-5" style={{ backgroundColor: draft.themeColor }} />
        {kind === "home" ? (
          <div className="grid h-60 grid-cols-3 content-start gap-3 bg-gradient-to-b from-indigo-900/70 to-slate-900 p-3">
            {[0, 1].map((i) => <div key={i} className="mx-auto h-9 w-9 rounded-xl bg-white/15" />)}
            <div className="flex min-w-0 flex-col items-center gap-1">
              <img src={icon} alt="" className="h-9 w-9 rounded-xl bg-white/10 object-cover" />
              <span className="w-full truncate text-center text-[9px] text-white">{draft.shortName || draft.appName}</span>
            </div>
          </div>
        ) : (
          <div className="flex h-60 flex-col items-center justify-center gap-2 p-3" style={{ backgroundColor: draft.backgroundColor }}>
            <img src={icon} alt="" className="h-12 w-12 object-contain" />
            <span className="max-w-full truncate text-xs font-semibold" style={{ color: readableOn(draft.backgroundColor) }}>{draft.appName}</span>
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-center text-[11px] text-white/45">{kind === "home" ? tp("phoneHome") : tp("phoneSplash")}</figcaption>
    </figure>
  );
}

function InstalledAppForm({ branding }: { branding: Branding }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT(manageMessages);
  const tc = useT(commonMessages);
  const tp = useT(platformAdminMessages);
  const [appName, setAppName] = useState(branding.appName);
  const [shortName, setShortName] = useState(branding.shortName);
  const [themeColor, setThemeColor] = useState(branding.themeColor);
  const [backgroundColor, setBackgroundColor] = useState(branding.backgroundColor);
  const dirty =
    appName !== branding.appName ||
    shortName !== branding.shortName ||
    themeColor !== branding.themeColor ||
    backgroundColor !== branding.backgroundColor;
  const reset = () => {
    setAppName(branding.appName);
    setShortName(branding.shortName);
    setThemeColor(branding.themeColor);
    setBackgroundColor(branding.backgroundColor);
  };
  const fieldLabel = (path: string) =>
    ({ appName: t("appName"), shortName: t("shortName"), themeColor: t("themeColor"), backgroundColor: t("backgroundColor") })[path];

  const saveMeta = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/xpot/admin/branding", { appName, shortName, themeColor, backgroundColor })).json(),
    onSuccess: () => {
      toast({ title: t("brandingSaved"), description: t("brandingCacheNote"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: BRANDING_KEY });
    },
    onError: (e: Error) => toast({ title: t("errorSaving"), description: describeApiError(e, fieldLabel), variant: "destructive" }),
  });

  const draft = { appName, shortName, themeColor, backgroundColor };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <section className={`rounded-2xl ${GLASS_CLASS} p-5`} data-testid="branding-app">
        <h3 className="font-semibold">{t("appAndColors")}</h3>
        <p className="mt-1 text-sm text-white/45">{t("appAndColorsHint")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t("appName")}>
            <Input value={appName} onChange={(e) => setAppName(e.target.value)} maxLength={60} />
          </Field>
          <Field label={t("shortName")}>
            <Input value={shortName} onChange={(e) => setShortName(e.target.value)} maxLength={30} />
          </Field>
          <ColorField label={t("themeColor")} value={themeColor} onChange={setThemeColor} />
          <ColorField label={t("backgroundColor")} value={backgroundColor} onChange={setBackgroundColor} />
        </div>
        <FormFooter dirty={dirty} onCancel={dirty ? reset : undefined} className="mt-4">
          <Button variant="brand" onClick={() => saveMeta.mutate()} disabled={!dirty} loading={saveMeta.isPending}>
            {tc("save")}
          </Button>
        </FormFooter>
      </section>

      <section className={`rounded-2xl ${GLASS_CLASS} p-5`} data-testid="branding-phone-preview">
        <p className={EYEBROW}>{tp("phonePreview")}</p>
        <div className="mt-3 flex justify-center gap-4">
          <PhoneMock kind="home" branding={branding} draft={draft} />
          <PhoneMock kind="splash" branding={branding} draft={draft} />
        </div>
      </section>
    </div>
  );
}
