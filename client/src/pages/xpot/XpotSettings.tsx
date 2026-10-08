import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff, Loader2, Save, ChevronDown, Webhook, Copy, Check, RefreshCw, Shield, ChevronRight } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { LanguageList } from "@/components/LanguagePicker";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { settingsMessages } from "@/i18n/messages/settings";
import type { XpotMeResponse } from "./types";
import { AppLayout } from "@/components/xpot/AppLayout";
import { homeForModules, useXpotModules } from "@/components/ModuleSwitch";
import { useViewerAccess } from "@/lib/adminMode";
import { shellMessages } from "@/i18n/messages/shell";
import { InstallAppRow } from "@/components/xpot/InstallApp";

type XphereConfig = {
  inboundApiKey: string | null;
  apiUrl: string;
  apiKeySet: boolean;
  isEnabled: boolean;
};

const COUNTRIES = [
  { code: "BR", dial: "+55", name: "Brazil" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "ES", dial: "+34", name: "Spain" },
  { code: "IT", dial: "+39", name: "Italy" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "MX", dial: "+52", name: "Mexico" },
  { code: "AR", dial: "+54", name: "Argentina" },
  { code: "CL", dial: "+56", name: "Chile" },
  { code: "CO", dial: "+57", name: "Colombia" },
  { code: "AU", dial: "+61", name: "Australia" },
  { code: "JP", dial: "+81", name: "Japan" },
  { code: "IN", dial: "+91", name: "India" },
  { code: "CN", dial: "+86", name: "China" },
];

/** Country name in the app's language; falls back to the English name. */
function countryName(code: string, fallback: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Translated role label; unknown roles show as stored. */
function roleLabel(role: string, t: (key: "role_rep" | "role_manager" | "role_admin") => string): string {
  return role === "rep" || role === "manager" || role === "admin" ? t(`role_${role}`) : role;
}

function parsePhone(phone: string): { dial: string; local: string } {
  for (const c of COUNTRIES) {
    if (phone.startsWith(c.dial)) return { dial: c.dial, local: phone.slice(c.dial.length).trim() };
  }
  return { dial: "+1", local: phone };
}

function maskLocal(dial: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (dial === "+1") {
    const d = digits.slice(0, 10);
    if (d.length <= 3) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return digits;
}

function CountryPhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT(settingsMessages);
  const parsed = parsePhone(value);
  const active = COUNTRIES.find((c) => c.dial === parsed.dial) ?? COUNTRIES[1];
  const [local, setLocal] = useState(parsed.local);

  useEffect(() => {
    const { dial, local: l } = parsePhone(value);
    setLocal(l);
    const found = COUNTRIES.find((c) => c.dial === dial) ?? COUNTRIES[1];
    if (found.code !== active.code) {
      // country changed externally
    }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function selectCountry(c: (typeof COUNTRIES)[0]) {
    setOpen(false);
    onChange(`${c.dial} ${local}`);
  }

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskLocal(active.dial, e.target.value);
    setLocal(masked);
    onChange(`${active.dial} ${masked}`);
  }

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-l-2xl border border-r-0 border-white/5 bg-white/[0.03] px-3 py-3 text-sm text-white/80 hover:bg-white/[0.06] transition-colors shrink-0"
      >
        <ReactCountryFlag countryCode={active.code} svg className="h-4 w-5 rounded-sm object-cover" />
        <span className="text-white/60 text-xs font-medium">{active.dial}</span>
        <ChevronDown className="h-3 w-3 text-white/40" />
      </button>
      <input
        type="tel"
        value={local}
        onChange={handleLocalChange}
        placeholder={active.code === "BR" ? "(11) 99999-9999" : "(555) 000-0000"}
        className="w-full rounded-r-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
      />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[#0f111a] p-1 shadow-2xl">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => selectCountry(c)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                c.code === active.code ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <ReactCountryFlag countryCode={c.code} svg className="h-4 w-5 rounded-sm object-cover" />
              <span className="text-white/50 text-xs w-10 shrink-0">{c.dial}</span>
              <span className="truncate">{countryName(c.code, c.name, t.locale)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function XphereIntegrationSection() {
  const { toast } = useToast();
  const t = useT(settingsMessages);
  const tc = useT(commonMessages);
  const [copied, setCopied] = useState(false);

  const configQuery = useQuery<XphereConfig>({ queryKey: ["/api/xpot/xphere/config"], retry: false });
  const config = configQuery.data;

  const [initialized, setInitialized] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("https://xphere.app");
  const [isEnabled, setIsEnabled] = useState(false);

  if (config && !initialized) {
    setInitialized(true);
    setApiUrl(config.apiUrl);
    setIsEnabled(config.isEnabled);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { isEnabled, apiUrl };
      if (apiKey) body.apiKey = apiKey;
      const res = await apiRequest("PUT", "/api/xpot/xphere/config", body);
      return res.json() as Promise<XphereConfig>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/xpot/xphere/config"], data);
      setApiKey("");
      toast({ title: t("xphereSaved") });
    },
    onError: (err: Error) => toast({ title: t("saveFailed"), description: err.message, variant: "destructive" }),
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/xpot/xphere/config/rotate-inbound-key", {});
      return res.json() as Promise<XphereConfig>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/xpot/xphere/config"], data);
      toast({ title: t("keyRotated") });
    },
    onError: (err: Error) => toast({ title: t("rotateFailed"), description: err.message, variant: "destructive" }),
  });

  const handleCopy = async () => {
    if (!config?.inboundApiKey) return;
    await navigator.clipboard.writeText(config.inboundApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (configQuery.isLoading) {
    return (
      <Section title={t("xphereTitle")}>
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      </Section>
    );
  }

  return (
    <Section title={t("xphereTitle")}>
      <div className="flex items-start gap-2 text-xs text-white/40">
        <Webhook className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t("xphereIntro")}</span>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <span className="text-sm font-medium text-white/80">{t("enabled")}</span>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </label>

      {config?.inboundApiKey && (
        <Field label={t("inboundKey")}>
          <div className="flex items-center gap-2">
            <code className="block flex-1 break-all rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-white/60">
              {config.inboundApiKey}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-white/60 transition-colors hover:bg-white/[0.08]"
              title={tc("copy")}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      )}

      <Field label={t("outboundToken")}>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.apiKeySet ? t("keepCurrentKey") : "xph_..."}
          className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
        />
      </Field>

      <Field label={t("xphereApiUrl")}>
        <input
          type="text"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://xphere.app"
          className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
        />
      </Field>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] touch-manipulation"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(99,102,241,0.25)" }}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{saveMutation.isPending ? t("saving") : tc("save")}</span>
        </button>
        <button
          type="button"
          onClick={() => rotateMutation.mutate()}
          disabled={rotateMutation.isPending}
          title={t("rotateKey")}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-medium text-white/70 transition-colors disabled:opacity-40 hover:bg-white/[0.06]"
        >
          {rotateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="px-1 text-base font-bold text-white/90">{title}</h2>
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-white/55">{label}</label>
      {children}
    </div>
  );
}

export function XpotSettings() {
  const [, setLocation] = useLocation();
  const modules = useXpotModules();
  const ts = useT(shellMessages);
  const { toast } = useToast();
  const t = useT(settingsMessages);
  const tc = useT(commonMessages);
  const [initialized, setInitialized] = useState(false);

  const meQuery = useQuery<XpotMeResponse>({ queryKey: ["/api/xpot/me"], retry: false });
  const me = meQuery.data;
  const access = useViewerAccess();

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [showPwd, setShowPwd] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (me && !initialized) {
    setInitialized(true);
    setDisplayName(me.rep.displayName);
    setFirstName(me.user.firstName ?? "");
    setLastName(me.user.lastName ?? "");
    setPhone(me.rep.phone ?? "");
  }

  const profileMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/xpot/me", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
      toast({ title: t("profileSaved") });
    },
    onError: (err: Error) => {
      toast({ title: t("profileSaveFailed"), description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/xpot/me/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("passwordChanged") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: t("passwordChangeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const handleSaveProfile = async () => {
    if (!me) return;

    const patch: Record<string, unknown> = {};
    if (displayName !== me.rep.displayName) patch.displayName = displayName;
    if (phone !== (me.rep.phone ?? "")) patch.phone = phone;
    if (firstName !== (me.user.firstName ?? "")) patch.firstName = firstName || null;
    if (lastName !== (me.user.lastName ?? "")) patch.lastName = lastName || null;

    if (Object.keys(patch).length === 0) {
      toast({ title: t("noChanges") });
      return;
    }

    profileMutation.mutate(patch);
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast({ title: t("passwordRequired"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: t("passwordTooShort"), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("passwordsMismatch"), variant: "destructive" });
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060912]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  const isSaving = profileMutation.isPending;

  return (
    <AppLayout title={t("title")} size="medium" mobileMaxWidth="max-w-lg" mobileColumnClassName="pb-20 pt-6">
      <div>
        {/* Header (phone only; the desktop top bar shows the title) */}
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setLocation(homeForModules(modules))}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="truncate text-sm text-white/45">
              {me ? [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") || me.user.email : ""}
            </p>
          </div>
        </div>

        <InstallAppRow className="mb-6" />

        <div className="space-y-8 lg:columns-2 lg:gap-6 lg:space-y-0 lg:[&>*]:mb-6 lg:[&>*]:break-inside-avoid">
          {/* Language */}
          <Section title={tc("language")}>
            <p className="text-sm text-white/45">{t("languageHint")}</p>
            <LanguageList />
          </Section>

          {/* Profile */}
          <Section title={t("sectionProfile")}>
            <Field label={t("firstName")}>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("firstNamePlaceholder")}
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label={t("lastName")}>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("lastNamePlaceholder")}
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label={t("displayName")}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayNamePlaceholder")}
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label={t("email")}>
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                {me?.user.email ?? "—"}
              </div>
            </Field>
            <Field label={t("phone")}>
              <CountryPhoneInput value={phone} onChange={setPhone} />
            </Field>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSaving || !displayName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] touch-manipulation"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(99,102,241,0.25)" }}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{isSaving ? t("saving") : t("saveProfile")}</span>
            </button>
          </Section>

          {/* Password */}
          <Section title={t("sectionSecurity")}>
            <Field label={t("currentPassword")}>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("currentPasswordPlaceholder")}
                  className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 pr-11 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label={t("newPassword")}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("newPasswordPlaceholder")}
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            <Field label={t("confirmPassword")}>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
                className="w-full rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-[15px] font-medium text-white placeholder-white/20 outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-all"
              />
            </Field>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400">{t("passwordsMismatch")}</p>
            )}
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={passwordMutation.isPending || !currentPassword || !newPassword || newPassword !== confirmPassword}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-bold text-white transition-all disabled:opacity-40 active:scale-[0.98] hover:bg-white/[0.06] touch-manipulation"
            >
              {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{passwordMutation.isPending ? t("changing") : t("changePassword")}</span>
            </button>
          </Section>

          {/* Account Info */}
          <Section title={t("sectionAccount")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("role")}>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                  {me?.rep.role ? roleLabel(me.rep.role, t) : "—"}
                </div>
              </Field>
              <Field label={t("team")}>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[15px] font-medium text-white/40">
                  {me?.rep.team ?? "—"}
                </div>
              </Field>
            </div>
          </Section>

          {/* Administration: only for people who manage the account, and last. */}
          {access.hasAdminAccess && (
            <Section title={t("sectionAdmin")}>
              <label className="flex cursor-pointer items-center gap-3" data-testid="settings-admin-mode">
                <Shield className={`h-5 w-5 shrink-0 ${access.adminMode ? "text-amber-300" : "text-white/40"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-white">{t("adminMode")}</span>
                  <span className="block text-sm text-white/45">{t("adminModeHint")}</span>
                </span>
                <Switch checked={access.adminMode} onCheckedChange={access.setAdminMode} />
              </label>
              {access.adminMode && (
                <button
                  type="button"
                  onClick={() => setLocation("/admin/reps")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left"
                  data-testid="settings-organization"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-white/85">{ts("navOrganization")}</span>
                    <span className="block text-sm text-white/45">{t("organizationHint")}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                </button>
              )}
            </Section>
          )}

          {/* Xphere Integration: API keys, so part of the management side. It syncs visits. */}
          {access.adminMode && modules.includes("visits") && <XphereIntegrationSection />}
        </div>
      </div>
    </AppLayout>
  );
}
