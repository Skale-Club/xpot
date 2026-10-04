import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock3, Loader2, MessageCircle, Phone, ShieldOff } from "lucide-react";
import { PHONE_COUNTRIES, formatPhone, normalizePhone } from "@shared/phone";
import { useT } from "@/i18n";
import { signinMessages } from "@/i18n/messages/signin";
import { initSupabase } from "@/lib/supabase";

// Sign in (or sign up) with a code texted to the phone. Only an approved rep
// gets in; a new number asks for access and waits for Skale Club.

type Step = "phone" | "code" | "name" | "pending" | "blocked";
type ErrorKey = keyof typeof signinMessages.en;

interface ApiError {
  code?: string;
  retryAfter?: number;
}

const FIELD =
  "h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-base text-white placeholder:text-white/30 outline-none transition-all focus:border-blue-500/50 focus:bg-white/10";
const PRIMARY =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-[0_4px_15px_rgba(37,99,235,0.3)] transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

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
  const { data: config } = useQuery<{ smsLive: boolean; supportWhatsapp: string | null }>({
    queryKey: ["/api/auth/phone/config"],
    staleTime: Infinity,
  });
  // Secondary way in (for when SMS is down): only offered when Supabase auth is configured.
  const { data: supabaseConfig } = useQuery<{ url?: string; anonKey?: string }>({
    queryKey: ["/api/supabase-config"],
    staleTime: Infinity,
  });
  const googleAvailable = Boolean(supabaseConfig?.url && supabaseConfig?.anonKey);
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState<string>("1");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef<HTMLInputElement>(null);

  // Resend countdown.
  useEffect(() => {
    if (step !== "code") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step === "code") window.setTimeout(() => codeRef.current?.focus(), 50);
  }, [step]);

  const showError = (data: ApiError) => {
    const key = `err_${data.code ?? "generic"}` as ErrorKey;
    setError(t(key in signinMessages.en ? key : "err_generic", { seconds: data.retryAfter ?? 30 }));
  };

  const sendCode = async (target: string) => {
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await post<{ phone: string }>("/api/auth/phone/start", { phone: target, countryCode, lang: t.lang });
      if (!ok) return showError(data);
      setPhone(data.phone);
      setCode("");
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
      setStep(data.status === "new" ? "name" : data.status);
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
      const { ok, data } = await post<{ status: Step }>("/api/auth/phone/register", { displayName: name.trim(), lang: t.lang });
      if (!ok) return showError(data);
      setStep(data.status === "blocked" ? "blocked" : "pending");
    } catch {
      setError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  };

  // /login finishes the job: it exchanges the PKCE code and opens the Express session.
  const signInWithGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const supabase = await initSupabase();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError(t("err_google"));
      setBusy(false);
    }
  };

  const restart = () => {
    setStep("phone");
    setCode("");
    setError("");
  };

  const whatsappLink = (kind: "pending" | "blocked") => {
    if (!config?.supportWhatsapp) return null;
    const text = t(kind === "pending" ? "contactPending" : "contactBlocked", { phone: formatPhone(phone) });
    return `https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  };

  const errorBox = error && (
    <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-300" data-testid="signin-error">
      {error}
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
          <a href={link} target="_blank" rel="noopener noreferrer" className={`${PRIMARY} bg-emerald-600 hover:bg-emerald-500 shadow-none`}>
            <MessageCircle className="h-5 w-5" />
            {t("contactWhatsapp")}
          </a>
        )}
        <button type="button" onClick={restart} className="text-sm text-white/50 hover:text-white">
          {t("backToStart")}
        </button>
      </div>
    );
  }

  if (step === "name") {
    return (
      <form onSubmit={register} className="space-y-4" data-testid="signin-name">
        <div className="text-center">
          <p className="text-lg font-bold text-white">{t("nameTitle")}</p>
          <p className="mt-1 text-sm text-white/60">{t("nameSub")}</p>
        </div>
        {errorBox}
        <label className="block space-y-2">
          <span className="text-sm font-medium text-white/80">{t("nameLabel")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            autoComplete="name"
            autoCapitalize="words"
            autoFocus
            required
            minLength={2}
            className={FIELD}
            data-testid="input-signup-name"
          />
        </label>
        <button type="submit" disabled={busy || name.trim().length < 2} className={PRIMARY} data-testid="button-request-access">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("requestAccess")}
        </button>
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
        <button type="button" onClick={restart} className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t("changeNumber")}
        </button>
        <div>
          <p className="text-lg font-bold text-white">{t("codeTitle")}</p>
          <p className="mt-1 text-sm text-white/60">{t("codeSent", { phone: formatPhone(phone) })}</p>
          {config && !config.smsLive && <p className="mt-1 text-xs text-amber-300/80">{t("devCode")}</p>}
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
        <button type="submit" disabled={busy || code.length !== 6} className={PRIMARY}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("verify")}
        </button>
        <button
          type="button"
          disabled={busy || wait > 0}
          onClick={() => void sendCode(phone)}
          className="w-full text-sm text-blue-300 hover:text-white disabled:text-white/35"
        >
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submitPhone} className="space-y-4" data-testid="signin-phone">
        <p className="text-center text-sm text-white/60">{t("subtitle")}</p>
        {errorBox}
        <label className="block space-y-2">
          <span className="text-sm font-medium text-white/80">{t("phoneLabel")}</span>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              aria-label={t("country")}
              className="h-12 shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 text-base text-white outline-none [color-scheme:dark] focus:border-blue-500/50"
            >
              {PHONE_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#0d1424]">
                  {c.flag} +{c.code}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
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
        </label>
        <button type="submit" disabled={busy || phoneInput.replace(/\D/g, "").length < 7} className={PRIMARY} data-testid="button-send-code">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("sendCode")}
          {!busy && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    {googleAvailable && (
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={busy}
        className="block w-full text-center text-sm text-white/50 transition-colors hover:text-white disabled:opacity-50"
        data-testid="button-google-signin"
      >
        {t("googleSignIn")}
      </button>
    )}
    </div>
  );
}
