import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock3, MessageCircle, Phone, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/loader";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { formatPhone, normalizePhone } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { useT } from "@/i18n";
import { signinMessages } from "@/i18n/messages/signin";
import { StateSelect } from "@/components/StateSelect";
import { phoneCountryCodeFromIso, phoneCountryCodeFromLocales } from "@shared/phoneCountry";

// Sign in (or sign up) with a code texted to the phone. Only an approved rep
// gets in; a new number completes a saved, one-question-at-a-time application.

type Step = "phone" | "code" | "application" | "pending" | "blocked";
type Availability = "weekdays" | "evenings" | "weekends" | "flexible" | "";
type Language = "en" | "pt" | "es" | "other";
type SalesExperience = "none" | "some" | "experienced" | "";
type FieldReadiness = "ready" | "with_support" | "not_ready" | "";
const APPLICATION_STEPS = 13;
type ErrorKey = keyof typeof signinMessages.en;

interface ApiError {
  code?: string;
  retryAfter?: number;
}

// The kit's field, a little taller for the sign-in card; the primary is the brand Button.
const FIELD = `${FIELD_CONTROL} h-12 px-4 !text-base`;

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & ApiError }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  return { ok: res.ok, data };
}

export function PhoneSignIn({ onSignedIn }: { onSignedIn: () => void | Promise<unknown> }) {
  const t = useT(signinMessages);
  const { data: config } = useQuery<{ smsLive: boolean; supportWhatsapp: string | null; countryIso: string | null }>({
    queryKey: ["/api/auth/phone/config"],
    staleTime: Infinity,
  });
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState<string>(() => phoneCountryCodeFromLocales(
    typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language],
  ));
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workCity, setWorkCity] = useState("");
  const [workRegion, setWorkRegion] = useState("");
  const [occupation, setOccupation] = useState("");
  const [availability, setAvailability] = useState<Availability>("");
  const [hasVehicle, setHasVehicle] = useState<boolean | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [otherLanguages, setOtherLanguages] = useState("");
  const [salesExperience, setSalesExperience] = useState<SalesExperience>("");
  const [fieldSalesReadiness, setFieldSalesReadiness] = useState<FieldReadiness>("");
  const [kitInvestmentAcknowledged, setKitInvestmentAcknowledged] = useState(false);
  const [activeSellerAcknowledged, setActiveSellerAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [applicationStep, setApplicationStep] = useState(0);
  const [draftLoading, setDraftLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef<HTMLInputElement>(null);
  const countryWasChosen = useRef(false);

  useEffect(() => {
    if (countryWasChosen.current || phoneInput) return;
    const detected = phoneCountryCodeFromIso(config?.countryIso);
    if (detected) setCountryCode(detected);
  }, [config?.countryIso, phoneInput]);

  // Resend countdown.
  useEffect(() => {
    if (step !== "code") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step === "code") window.setTimeout(() => codeRef.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    if (step !== "application") return;
    let cancelled = false;
    setDraftLoading(true);
    fetch("/api/auth/phone/application-draft", { credentials: "include" })
      .then((response) => response.json())
      .then(({ draft }) => {
        if (cancelled || !draft) return;
        setName(draft.displayName ?? "");
        setEmail(draft.email ?? "");
        setWorkCity(draft.workCity ?? "");
        setWorkRegion(draft.workRegion ?? "");
        setOccupation(draft.occupation ?? "");
        setAvailability(draft.availability ?? "");
        setHasVehicle(typeof draft.hasVehicle === "boolean" ? draft.hasVehicle : null);
        setLanguages(Array.isArray(draft.languages) ? draft.languages : []);
        setOtherLanguages(draft.otherLanguages ?? "");
        setSalesExperience(draft.salesExperience ?? "");
        setFieldSalesReadiness(draft.fieldSalesReadiness ?? "");
        setKitInvestmentAcknowledged(Boolean(draft.kitInvestmentAcknowledged));
        setActiveSellerAcknowledged(Boolean(draft.activeSellerAcknowledged));
        setMessage(draft.message ?? "");
        setApplicationStep(Math.min(Number(draft.draftStep) || 0, APPLICATION_STEPS - 1));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setDraftLoading(false); });
    return () => { cancelled = true; };
  }, [step]);

  const showError = (data: ApiError) => {
    const key = `err_${data.code ?? "generic"}` as ErrorKey;
    setError(t(key in signinMessages.en ? key : "err_generic", { seconds: data.retryAfter ?? 30 }));
  };

  const sendCode = async (target: string) => {
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post<{ phone: string; devCode?: string }>("/api/auth/phone/start", { phone: target, countryCode, lang: t.lang });
      if (!ok) return showError(data);
      setPhone(data.phone);
      setDevCode(data.devCode ?? "");
      setCode(data.devCode ?? "");
      setResendAt(Date.now() + 30_000);
      setStep("code");
    } catch {
      setError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (!normalizePhone(phoneInput, countryCode)) return setError(t("err_invalid_phone"));
    void sendCode(phoneInput);
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post<{ status: "active" | "pending" | "blocked" | "new" }>("/api/auth/phone/verify", { phone, code: value });
      if (!ok) {
        setCode("");
        return showError(data);
      }
      if (data.status === "active") return void (await onSignedIn());
      setStep(data.status === "new" ? "application" : data.status);
    } catch {
      setError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const onCode = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) void verify(digits);
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post<{ status: "active" | "pending" | "blocked" | "new" }>("/api/auth/phone/register", {
        displayName: name.trim(),
        email: email.trim(),
        workCity: workCity.trim(),
        workRegion: workRegion.trim(),
        occupation: occupation.trim(),
        availability,
        hasVehicle,
        languages,
        otherLanguages: otherLanguages.trim(),
        salesExperience,
        fieldSalesReadiness,
        kitInvestmentAcknowledged,
        activeSellerAcknowledged,
        message: message.trim(),
        lang: t.lang,
      });
      if (!ok) return showError(data);
      if (data.status === "active") return void (await onSignedIn());
      setStep(data.status === "blocked" ? "blocked" : "pending");
    } catch {
      setError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const draftPayload = (nextStep: number) => ({
    ...(name.trim() ? { displayName: name.trim() } : {}),
    ...(email.trim() ? { email: email.trim() } : {}),
    ...(workCity.trim() ? { workCity: workCity.trim() } : {}),
    ...(workRegion.trim() ? { workRegion: workRegion.trim() } : {}),
    ...(occupation.trim() ? { occupation: occupation.trim() } : {}),
    ...(availability ? { availability } : {}),
    ...(hasVehicle !== null ? { hasVehicle } : {}),
    ...(languages.length ? { languages } : {}),
    ...(otherLanguages.trim() ? { otherLanguages: otherLanguages.trim() } : {}),
    ...(salesExperience ? { salesExperience } : {}),
    ...(fieldSalesReadiness ? { fieldSalesReadiness } : {}),
    ...(kitInvestmentAcknowledged ? { kitInvestmentAcknowledged } : {}),
    ...(activeSellerAcknowledged ? { activeSellerAcknowledged } : {}),
    ...(message.trim() ? { message: message.trim() } : {}),
    step: nextStep,
  });

  useEffect(() => {
    if (step !== "application" || draftLoading) return;
    const hasAnswer = Boolean(name.trim() || email.trim() || workCity.trim() || workRegion.trim() || occupation.trim() || availability || hasVehicle !== null || languages.length || salesExperience || fieldSalesReadiness || kitInvestmentAcknowledged || activeSellerAcknowledged || message.trim());
    if (!hasAnswer) return;
    const timer = window.setTimeout(() => {
      void put("/api/auth/phone/application-draft", draftPayload(applicationStep));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [step, draftLoading, applicationStep, name, email, workCity, workRegion, occupation, availability, hasVehicle, languages, otherLanguages, salesExperience, fieldSalesReadiness, kitInvestmentAcknowledged, activeSellerAcknowledged, message]);

  const saveAndContinue = async () => {
    const next = Math.min(applicationStep + 1, APPLICATION_STEPS - 1);
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await put<{ ok: boolean }>("/api/auth/phone/application-draft", draftPayload(next));
      if (!ok) return showError(data);
      setApplicationStep(next);
    } catch {
      setError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep("phone");
    setCode("");
    setDevCode("");
    setError("");
  };

  const whatsappLink = (kind: "pending" | "blocked") => {
    if (!config?.supportWhatsapp) return null;
    const text = t(kind === "pending" ? "contactPending" : "contactBlocked", { phone: formatPhone(phone) });
    return `https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  };

  const errorBox = error && (
    <div data-testid="signin-error">
      <InlineAlert tone="error">{error}</InlineAlert>
    </div>
  );

  if (step === "pending" || step === "blocked") {
    const pending = step === "pending";
    const link = whatsappLink(step);
    const Icon = pending ? Clock3 : ShieldOff;
    return (
      <div className="space-y-4 text-center" data-testid={`signin-${step}`}>
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${pending ? "bg-amber-400/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}>
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-lg font-bold text-white">{pending ? t("pendingTitle") : t("blockedTitle")}</p>
          <p className="mt-1 text-sm text-white/60">{pending ? t("pendingText") : t("blockedText")}</p>
        </div>
        {link && (
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="text-emerald-300" />
              {t("contactWhatsapp")}
            </a>
          </Button>
        )}
        <button type="button" onClick={restart} className="min-h-10 text-sm text-white/50 hover:text-white">
          {t("backToStart")}
        </button>
      </div>
    );
  }

  if (step === "application") {
    if (draftLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-blue-300" /></div>;
    const valid = [
      name.trim().length >= 2,
      /^\S+@\S+\.\S+$/.test(email.trim()),
      workCity.trim().length >= 2,
      workRegion.trim().length >= 2,
      occupation.trim().length >= 2,
      hasVehicle !== null,
      languages.length > 0 && (!languages.includes("other") || otherLanguages.trim().length >= 2),
      Boolean(salesExperience),
      Boolean(fieldSalesReadiness),
      Boolean(availability),
      kitInvestmentAcknowledged,
      activeSellerAcknowledged,
      true,
    ][applicationStep];
    let question: ReactNode;
    if (applicationStep === 0) question = <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="name" autoCapitalize="words" autoFocus className={FIELD} data-testid="input-signup-name" />;
    else if (applicationStep === 1) question = <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} type="email" inputMode="email" autoComplete="email" autoFocus className={FIELD} data-testid="input-signup-email" />;
    else if (applicationStep === 2) question = <input value={workCity} onChange={(e) => setWorkCity(e.target.value)} placeholder={t("workCityPlaceholder")} autoComplete="address-level2" autoCapitalize="words" autoFocus className={FIELD} data-testid="input-signup-city" />;
    else if (applicationStep === 3) question = <StateSelect value={workRegion} onValueChange={setWorkRegion} placeholder={t("workRegionPlaceholder")} autoFocus selectClassName={FIELD} testId="input-signup-region" />;
    else if (applicationStep === 4) question = <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder={t("occupationPlaceholder")} autoFocus className={FIELD} data-testid="input-signup-occupation" />;
    else if (applicationStep === 5) question = <Choices value={hasVehicle === null ? "" : String(hasVehicle)} onChange={(value) => setHasVehicle(value === "true")} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />;
    else if (applicationStep === 6) question = (
      <div className="space-y-3">
        <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {(["en", "pt", "es", "other"] as Language[]).map((language) => (
            <label key={language} className="flex cursor-pointer items-center gap-3 py-3 text-sm text-white/75">
              <input type="checkbox" checked={languages.includes(language)} onChange={(e) => setLanguages(e.target.checked ? [...languages, language] : languages.filter((item) => item !== language))} className="h-4 w-4 accent-blue-500" />
              {t(`language_${language}` as keyof typeof signinMessages.en)}
            </label>
          ))}
        </div>
        {languages.includes("other") ? <input value={otherLanguages} onChange={(e) => setOtherLanguages(e.target.value)} placeholder={t("otherLanguagesPlaceholder")} autoFocus className={FIELD} /> : null}
      </div>
    );
    else if (applicationStep === 7) question = <Choices value={salesExperience} onChange={(value) => setSalesExperience(value as SalesExperience)} options={["none", "some", "experienced"].map((value) => ({ value, label: t(`salesExperience_${value}` as keyof typeof signinMessages.en) }))} />;
    else if (applicationStep === 8) question = <Choices value={fieldSalesReadiness} onChange={(value) => setFieldSalesReadiness(value as FieldReadiness)} options={["ready", "with_support", "not_ready"].map((value) => ({ value, label: t(`fieldReadiness_${value}` as keyof typeof signinMessages.en) }))} />;
    else if (applicationStep === 9) question = <Choices value={availability} onChange={(value) => setAvailability(value as Availability)} options={["weekdays", "evenings", "weekends", "flexible"].map((value) => ({ value, label: t(`availability_${value}` as keyof typeof signinMessages.en) }))} />;
    else if (applicationStep === 10) question = <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-white/70"><input type="checkbox" checked={kitInvestmentAcknowledged} onChange={(e) => setKitInvestmentAcknowledged(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-500" /><span>{t("kitAcknowledgement")}</span></label>;
    else if (applicationStep === 11) question = <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-white/70"><input type="checkbox" checked={activeSellerAcknowledged} onChange={(e) => setActiveSellerAcknowledged(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-500" /><span>{t("activeSellerAcknowledgement")}</span></label>;
    else question = <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("messagePlaceholder")} maxLength={1000} rows={4} autoFocus className={`${FIELD} h-auto resize-none py-3`} data-testid="input-signup-message" />;

    const questionKeys = ["nameQuestion", "emailQuestion", "workCityQuestion", "workRegionQuestion", "occupationQuestion", "vehicleQuestion", "languagesQuestion", "salesExperienceQuestion", "fieldReadinessQuestion", "availabilityQuestion", "kitQuestion", "activeSellerQuestion", "messageQuestion"] as const;
    return (
      <form onSubmit={(event) => applicationStep === APPLICATION_STEPS - 1 ? void register(event) : (event.preventDefault(), void saveAndContinue())} className="space-y-5" data-testid="signin-application">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">{t("applicationProgress", { current: applicationStep + 1, total: APPLICATION_STEPS })}</p>
          <div className="mx-auto mt-2 h-1 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all" style={{ width: `${((applicationStep + 1) / APPLICATION_STEPS) * 100}%` }} /></div>
          <p className="mt-5 text-xl font-bold leading-snug text-white">{t(questionKeys[applicationStep])}</p>
        </div>
        {errorBox}
        <div className="min-h-32">{question}</div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={!valid} loading={busy} data-testid={applicationStep === APPLICATION_STEPS - 1 ? "button-request-access" : "button-application-next"}>
          {applicationStep === APPLICATION_STEPS - 1 ? t("requestAccess") : t("next")}
          {applicationStep < APPLICATION_STEPS - 1 ? <ArrowRight /> : null}
        </Button>
        {applicationStep > 0 ? <button type="button" disabled={busy} onClick={() => setApplicationStep((value) => Math.max(0, value - 1))} className="mx-auto flex min-h-10 items-center gap-2 text-sm text-white/45 hover:text-white"><ArrowLeft className="h-4 w-4" />{t("previous")}</button> : null}
        <p className="text-center text-xs text-white/35">{t("draftSaved")}</p>
      </form>
    );
  }

  if (step === "code") {
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) void verify(code);
        }}
        className="space-y-4"
        data-testid="signin-code"
      >
        <button type="button" onClick={restart} className="flex min-h-10 items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t("changeNumber")}
        </button>
        <div>
          <p className="text-lg font-bold text-white">{t("codeTitle")}</p>
          <p className="mt-1 text-sm text-white/60">{t("codeSent", { phone: formatPhone(phone) })}</p>
          {devCode && <p className="mt-1 text-xs text-amber-300/80">{t("devCode", { code: devCode })}</p>}
        </div>
        {errorBox}
        <input
          ref={codeRef}
          value={code}
          onChange={(e) => onCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          aria-label={t("codeLabel")}
          placeholder="••••••"
          className={`${FIELD} text-center font-mono text-2xl tracking-[0.5em]`}
          data-testid="input-code"
        />
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={code.length !== 6} loading={busy}>
          {t("verify")}
        </Button>
        <button
          type="button"
          disabled={busy || wait > 0}
          onClick={() => void sendCode(phone)}
          className="min-h-10 w-full text-sm text-blue-300 hover:text-white disabled:text-white/35"
        >
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </button>
      </form>
    );
  }

  return (
      <form onSubmit={submitPhone} className="space-y-4" data-testid="signin-phone">
        {errorBox}
        <div className="space-y-2">
          <label htmlFor="signin-phone" className="block text-sm font-medium text-white/80">{t("phoneLabel")}</label>
          <div className="flex h-12 gap-2">
            <CountryCodePicker
              value={countryCode}
              onChange={(nextCountryCode) => {
                countryWasChosen.current = true;
                setCountryCode(nextCountryCode);
                setPhoneInput((currentValue) => maskPhoneInput(currentValue, nextCountryCode));
              }}
              label={t("country")}
            />
            <div className="relative flex-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                id="signin-phone"
                value={phoneInput}
                onChange={(e) => setPhoneInput(maskPhoneInput(e.target.value, countryCode))}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder={t("phonePlaceholder")}
                autoFocus
                required
                className={`${FIELD} pl-10`}
                data-testid="input-phone"
              />
            </div>
          </div>
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={phoneInput.replace(/\D/g, "").length < 7} loading={busy} data-testid="button-send-code">
          {t("sendCode")}
          <ArrowRight />
        </Button>
      </form>
  );
}

async function put<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & ApiError }> {
  const res = await fetch(url, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  return { ok: res.ok, data };
}

function maskPhoneInput(value: string, countryCode: string): string {
  const digits = value.replace(/\D/g, "").slice(0, countryCode === "55" ? 11 : countryCode === "1" ? 10 : 15);
  if (countryCode === "1") return digits.replace(/^(\d{0,3})(\d{0,3})(\d{0,4}).*/, (_m, a, b, c) => b ? `(${a}) ${b}${c ? `-${c}` : ""}` : a);
  if (countryCode === "55") return digits.replace(/^(\d{0,2})(\d{0,5})(\d{0,4}).*/, (_m, a, b, c) => b ? `(${a}) ${b}${c ? `-${c}` : ""}` : a);
  return digits;
}

function Choices({ options, value, onChange }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-center gap-3 py-3 text-sm text-white/75 hover:text-white">
          <input type="radio" checked={value === option.value} onChange={() => onChange(option.value)} className="h-4 w-4 accent-blue-500" />
          <span className="flex-1">{option.label}</span>
          {value === option.value ? <Check className="h-4 w-4 text-blue-300" /> : null}
        </label>
      ))}
    </div>
  );
}
