import { prepareGoogleIdentity, sendGooglePhoneCode, confirmGooglePhoneCode, signInGoogleAlternative, cancelGooglePhoneChallenge, googlePhoneError, type GoogleLoginConfig } from '@/lib/googleIdentity';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Phone } from "lucide-react";
import { AccessNotice } from "@/components/AccessNotice";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/loader";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { formatPhone, normalizePhone, phonePlaceholderFor } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { useT } from "@/i18n";
import { signinMessages } from "@/i18n/messages/signin";
import { StateSelect } from "@/components/StateSelect";
import { phoneCountryCodeFromIso, phoneCountryCodeFromLocales } from "@shared/phoneCountry";

// Sign in (or sign up) with a code texted to the phone, or with Google: each
// works on its own. Only an approved rep gets in; a new number or Google
// account completes a saved, one-question-at-a-time application.

type Step = "phone" | "code" | "application" | "pending" | "blocked";
// name, email, location, vehicle, kit, active seller
const APPLICATION_STEPS = 6;
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
  const { data: config } = useQuery<{ smsLive: boolean; supportWhatsapp: string | null; countryIso: string | null; provider?: string; google?: GoogleLoginConfig }>({
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
  const [hasVehicle, setHasVehicle] = useState<boolean | null>(null);
  // Xpot ships pieces only within the US: anyone outside stops at this question.
  const [inUs, setInUs] = useState<boolean | null>(null);
  const [kitInvestmentAcknowledged, setKitInvestmentAcknowledged] = useState(false);
  const [activeSellerAcknowledged, setActiveSellerAcknowledged] = useState(false);
  const [applicationStep, setApplicationStep] = useState(0);
  const [draftLoading, setDraftLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (config?.google) void prepareGoogleIdentity(config.google).catch(() => {});
    return cancelGooglePhoneChallenge;
  }, [config?.google]);
  // The last draft the server has, so moving back and forth sends nothing new.
  const lastSavedDraft = useRef("");
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
      .then(({ draft, suggested }) => {
        if (cancelled) return;
        // A new Google applicant: what Google knows fills the first answers.
        if (!draft) {
          if (suggested?.displayName) setName(suggested.displayName);
          if (suggested?.email) setEmail(suggested.email);
          return;
        }
        const saved: Answers = {
          name: draft.displayName ?? "",
          email: draft.email ?? "",
          workCity: draft.workCity ?? "",
          workRegion: draft.workRegion ?? "",
          inUs: draft.workRegion ? true : null,
          hasVehicle: typeof draft.hasVehicle === "boolean" ? draft.hasVehicle : null,
          kitInvestmentAcknowledged: Boolean(draft.kitInvestmentAcknowledged),
          activeSellerAcknowledged: Boolean(draft.activeSellerAcknowledged),
        };
        setName(saved.name);
        setEmail(saved.email);
        setWorkCity(saved.workCity);
        setWorkRegion(saved.workRegion);
        setHasVehicle(saved.hasVehicle);
        setInUs(saved.inUs);
        setKitInvestmentAcknowledged(saved.kitInvestmentAcknowledged);
        setActiveSellerAcknowledged(saved.activeSellerAcknowledged);
        // Resume where they left off, but never past a question still unanswered
        // (a draft saved before the questions changed may point elsewhere).
        const firstOpen = answeredSteps(saved).findIndex((ok) => !ok);
        const stored = Math.min(Number(draft.draftStep) || 0, APPLICATION_STEPS - 1);
        setApplicationStep(firstOpen === -1 ? stored : Math.min(stored, firstOpen));
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
    if (pending.current || !config) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const targetPhone = normalizePhone(target, countryCode);
      if (!targetPhone) return showError({ code: 'invalid_phone' });
      if (config?.provider === 'google' && config.google) {
        await sendGooglePhoneCode(config.google, targetPhone);
        setPhone(targetPhone); setCode(''); setDevCode('');
      } else {
        const { ok, data } = await post<{ phone: string; devCode?: string }>("/api/auth/phone/start", { phone: target, countryCode, lang: t.lang });
        if (!ok) return showError(data);
        setPhone(data.phone); setDevCode(data.devCode ?? ''); setCode(data.devCode ?? '');
      }
      setResendAt(Date.now() + 30_000);
      setStep("code");
    } catch (error) {
      showError({ code: googlePhoneError(error) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (!normalizePhone(phoneInput, countryCode)) return setError(t("err_invalid_phone"));
    void sendCode(phoneInput);
  };

  const verify = async (value: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const { ok, data } = config?.provider === 'google'
        ? await post<{ status: 'active' | 'pending' | 'blocked' | 'new' }>('/api/auth/identity', { idToken: await confirmGooglePhoneCode(phone, value) })
        : await post<{ status: 'active' | 'pending' | 'blocked' | 'new' }>("/api/auth/phone/verify", { phone, code: value });
      if (!ok) {
        setCode("");
        return showError(data);
      }
      if (data.status === "active") return void (await onSignedIn());
      setStep(data.status === "new" ? "application" : data.status);
    } catch (error) {
      showError({ code: googlePhoneError(error) });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const google = async () => {
    if (pending.current || !config?.google) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const idToken = await signInGoogleAlternative(config.google);
      const { ok, data } = await post<{ status: 'active' | 'pending' | 'blocked' | 'new' }>('/api/auth/identity', { idToken });
      if (!ok) return showError(data);
      if (data.status === 'active') return void (await onSignedIn());
      setStep(data.status === 'new' ? 'application' : data.status);
    } catch { setError(t('err_generic')); }
    finally { pending.current = false; setBusy(false); }
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
        hasVehicle,
        kitInvestmentAcknowledged,
        activeSellerAcknowledged,
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
    ...(hasVehicle !== null ? { hasVehicle } : {}),
    ...(kitInvestmentAcknowledged ? { kitInvestmentAcknowledged } : {}),
    ...(activeSellerAcknowledged ? { activeSellerAcknowledged } : {}),
    step: nextStep,
  });

  // The draft is saved only so they can pick up later: once they pause for a
  // moment, in the background, skipping when nothing changed. Moving between
  // questions never waits on it and a failed save never stops them.
  // Nothing is submitted until the last question.
  const saveDraft = (nextStep: number) => {
    const payload = draftPayload(nextStep);
    const body = JSON.stringify(payload);
    if (body === lastSavedDraft.current) return;
    lastSavedDraft.current = body;
    const forget = () => { if (lastSavedDraft.current === body) lastSavedDraft.current = ""; };
    void put("/api/auth/phone/application-draft", payload).then(({ ok }) => { if (!ok) forget(); }, forget);
  };

  useEffect(() => {
    if (step !== "application" || draftLoading) return;
    const hasAnswer = Boolean(name.trim() || email.trim() || workCity.trim() || workRegion.trim() || hasVehicle !== null || kitInvestmentAcknowledged || activeSellerAcknowledged);
    if (!hasAnswer) return;
    const timer = window.setTimeout(() => saveDraft(applicationStep), 900);
    return () => window.clearTimeout(timer);
  }, [step, draftLoading, applicationStep, name, email, workCity, workRegion, hasVehicle, kitInvestmentAcknowledged, activeSellerAcknowledged]);

  const goToStep = (next: number) => {
    setError("");
    setApplicationStep(Math.max(0, Math.min(next, APPLICATION_STEPS - 1)));
  };

  const restart = () => {
    setStep("phone");
    setCode("");
    setDevCode("");
    setError("");
  };

  // Pending: the team was already notified, so the chat opens empty for
  // whatever they want to ask. Blocked: starts the conversation for them.
  const whatsappLink = (kind: "pending" | "blocked") => {
    if (!config?.supportWhatsapp) return null;
    const base = `https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}`;
    if (kind === "pending") return base;
    return `${base}?text=${encodeURIComponent(t("contactBlocked", { phone: formatPhone(phone) }))}`;
  };

  const errorBox = error && (
    <div data-testid="signin-error">
      <InlineAlert tone="error">{error}</InlineAlert>
    </div>
  );

  if (step === "pending" || step === "blocked") {
    return (
      <AccessNotice
        kind={step}
        whatsappHref={whatsappLink(step)}
        action={
          <button type="button" onClick={restart} className="min-h-11 text-sm text-white/50 hover:text-white">
            {t("backToStart")}
          </button>
        }
      />
    );
  }

  if (step === "application") {
    if (draftLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-blue-300" /></div>;
    const valid = answeredSteps({ name, email, inUs, workCity, workRegion, hasVehicle, kitInvestmentAcknowledged, activeSellerAcknowledged })[applicationStep];
    let question: ReactNode;
    if (applicationStep === 0) question = <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} autoComplete="name" autoCapitalize="words" autoFocus className={FIELD} data-testid="input-signup-name" />;
    else if (applicationStep === 1) question = <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} type="email" inputMode="email" autoComplete="email" autoFocus className={FIELD} data-testid="input-signup-email" />;
    else if (applicationStep === 2) question = (
      <div className="space-y-4">
        <Choices value={inUs === null ? "" : String(inUs)} onChange={(value) => setInUs(value === "true")} options={[{ value: "true", label: t("inUsYes") }, { value: "false", label: t("inUsNo") }]} />
        {inUs === true ? (
          <div className="space-y-3">
            <input value={workCity} onChange={(e) => setWorkCity(e.target.value)} placeholder={t("workCityPlaceholder")} aria-label={t("workCityLabel")} autoComplete="address-level2" autoCapitalize="words" autoFocus className={FIELD} data-testid="input-signup-city" />
            <StateSelect value={workRegion} onValueChange={setWorkRegion} placeholder={t("workRegionPlaceholder")} selectClassName={FIELD} testId="input-signup-region" />
          </div>
        ) : null}
        {inUs === false ? (
          <div data-testid="signin-outside-us">
            <InlineAlert tone="info">{t("outsideUs")}</InlineAlert>
          </div>
        ) : null}
      </div>
    );
    else if (applicationStep === 3) question = <Choices value={hasVehicle === null ? "" : String(hasVehicle)} onChange={(value) => setHasVehicle(value === "true")} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />;
    else if (applicationStep === 4) question = (
      <Acknowledge checked={kitInvestmentAcknowledged} onChange={setKitInvestmentAcknowledged} label={t("kitAcknowledgement")} testId="input-signup-kit">
        <ol className="space-y-3">
          {(["kitHow1", "kitHow2", "kitHow3"] as const).map((key, index) => (
            <li key={key} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-semibold text-blue-200">{index + 1}</span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </Acknowledge>
    );
    else question = (
      <Acknowledge checked={activeSellerAcknowledged} onChange={setActiveSellerAcknowledged} label={t("activeSellerAcknowledgement")} testId="input-signup-active">
        <p>{t("activeSellerText1")}</p>
        <p>{t("activeSellerText2")}</p>
      </Acknowledge>
    );

    const questionKeys = ["nameQuestion", "emailQuestion", "locationQuestion", "vehicleQuestion", "kitQuestion", "activeSellerQuestion"] as const;
    return (
      <form onSubmit={(event) => applicationStep === APPLICATION_STEPS - 1 ? void register(event) : (event.preventDefault(), goToStep(applicationStep + 1))} className="space-y-5" data-testid="signin-application">
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
        {applicationStep > 0 ? <button type="button" disabled={busy} onClick={() => goToStep(applicationStep - 1)} className="mx-auto flex min-h-11 items-center gap-2 text-sm text-white/45 hover:text-white"><ArrowLeft className="h-4 w-4" />{t("previous")}</button> : null}
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
        <button type="button" onClick={restart} className="flex min-h-11 items-center gap-2 text-sm text-white/60 hover:text-white">
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
          className="min-h-11 w-full text-sm text-blue-300 hover:text-white disabled:text-white/35"
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
                placeholder={phonePlaceholderFor(countryCode)}
                autoFocus
                required
                className={`${FIELD} pl-10`}
                data-testid="input-phone"
              />
            </div>
          </div>
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={!config || phoneInput.replace(/\D/g, "").length < 7} loading={busy} data-testid="button-send-code">
          {t("sendCode")}
          <ArrowRight />
        </Button>
        {config?.provider === 'google' && <>
          <div className="flex items-center gap-3 text-xs text-white/45"><span className="h-px flex-1 bg-white/15" />{t('or')}<span className="h-px flex-1 bg-white/15" /></div>
          <Button type="button" variant="outline" size="lg" className="w-full" disabled={busy} onClick={() => void google()}>
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.26 1.28-1.02 2.37-2.15 3.1v2.58h3.48c2.04-1.88 3.21-4.65 3.21-7.55Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.48-2.58c-.98.66-2.24 1.06-3.8 1.06-2.87 0-5.3-1.94-6.17-4.54H2.23v2.66C4.04 20.53 7.73 23 12 23Z" />
              <path fill="#FBBC05" d="M5.83 14.28A6.6 6.6 0 0 1 5.48 12c0-.79.14-1.55.35-2.28V7.06H2.23A10.94 10.94 0 0 0 1 12c0 1.78.43 3.45 1.23 4.94l3.6-2.66Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.73 1 4.04 3.47 2.23 7.06l3.6 2.66C6.7 7.12 9.13 5.38 12 5.38Z" />
            </svg>
            {t('continueGoogle')}
          </Button>
        </>}
      </form>
  );
}

interface Answers {
  name: string;
  email: string;
  workCity: string;
  inUs: boolean | null;
  workRegion: string;
  hasVehicle: boolean | null;
  kitInvestmentAcknowledged: boolean;
  activeSellerAcknowledged: boolean;
}

/** Whether each question, in order, has an answer good enough to move on. */
function answeredSteps(a: Answers): boolean[] {
  return [
    a.name.trim().length >= 2,
    /^\S+@\S+\.\S+$/.test(a.email.trim()),
    a.inUs === true && a.workCity.trim().length >= 2 && a.workRegion.trim().length >= 2,
    a.hasVehicle !== null,
    a.kitInvestmentAcknowledged,
    a.activeSellerAcknowledged,
  ];
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

/** A short explanation first, then one "I understand" box under it. */
function Acknowledge({ children, checked, onChange, label, testId }: { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void; label: string; testId: string }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 text-sm leading-relaxed text-white/65">{children}</div>
      <label className="flex cursor-pointer items-start gap-3 border-t border-white/[0.08] pt-4 text-sm font-medium leading-relaxed text-white/85">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-500" data-testid={testId} />
        <span>{label}</span>
      </label>
    </div>
  );
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
