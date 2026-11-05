import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Phone } from "lucide-react";
import { formatPhone, phonePlaceholderFor } from "@shared/phone";
import { phoneCountryCodeFromLocales } from "@shared/phoneCountry";
import { Button } from "@/components/ui/button";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { MyApiError, myApi, SIGN_IN_ERROR_KEYS } from "./api";
import { cleanPlateCode, plateCodeReady } from "./format";
import { cancelGooglePhoneChallenge, sendGooglePhoneCode, confirmGooglePhoneCode } from '@/lib/googleIdentity';

// Entry to the customer panel: the code printed on one of the plates and a phone, then the code texted to it. The
// screens never say whether a plate or a phone was recognised until the texted code has been typed.

const FIELD = `${FIELD_CONTROL} h-12 px-4 !text-base`;
const RESEND_SECONDS = 30;

type ErrorKey = (typeof SIGN_IN_ERROR_KEYS)[keyof typeof SIGN_IN_ERROR_KEYS] | "errGeneric";

export function SignIn({ onSignedIn }: { onSignedIn: () => void | Promise<unknown> }) {
  const t = useT(myPlatesMessages);
  const [step, setStep] = useState<"details" | "otp">("details");
  const [plateCode, setPlateCode] = useState("");
  const [countryCode, setCountryCode] = useState<string>(() => phoneCountryCodeFromLocales(
    typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language],
  ));
  const [phoneInput, setPhoneInput] = useState("");
  // The number as the server read it (E.164), which the code is checked against.
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const otpRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const googleChallenge = useRef(false);
  useEffect(() => () => cancelGooglePhoneChallenge(), []);

  useEffect(() => {
    if (step !== "otp") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    window.setTimeout(() => otpRef.current?.focus(), 50);
    return () => window.clearInterval(id);
  }, [step]);

  const fail = (err: unknown) => {
    const code = err instanceof MyApiError ? err.code : null;
    setError(code && code in SIGN_IN_ERROR_KEYS ? SIGN_IN_ERROR_KEYS[code as keyof typeof SIGN_IN_ERROR_KEYS] : "errGeneric");
  };

  const ask = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const sent = await myApi.askCode({ code: plateCode, phone: phoneInput, countryCode, lang: t.lang });
      googleChallenge.current = sent.provider === 'google';
      if (sent.google) await sendGooglePhoneCode(sent.google,sent.phone);
      setPhone(sent.phone);
      setOtp("");
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setStep("otp");
    } catch (err) {
      fail(err);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await myApi.verify(googleChallenge.current ? {idToken:await confirmGooglePhoneCode(phone,value)} : { phone, otp: value });
      await onSignedIn();
    } catch (err) {
      fail(err);
      setOtp("");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    if (plateCodeReady(plateCode) && phoneInput.replace(/\D/g, "").length >= 7) void ask();
  };

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const errorBox = error ? <InlineAlert tone="error">{t(error)}</InlineAlert> : null;

  if (step === "otp") {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); if (otp.length === 6) void verify(otp); }}
        className="space-y-4"
        data-testid="my-otp"
      >
        <button type="button" disabled={busy} onClick={() => { cancelGooglePhoneChallenge(); setStep("details"); setError(null); }} className="flex min-h-10 items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t("changeDetails")}
        </button>
        <div>
          <p className="text-lg font-bold text-white">{t("codeTitle")}</p>
          <p className="mt-1 text-sm text-white/60">{t("codeSent", { phone: formatPhone(phone) })}</p>
        </div>
        {errorBox}
        <input
          ref={otpRef}
          value={otp}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setOtp(digits);
            if (digits.length === 6 && !busy) void verify(digits);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label={t("codeLabel")}
          placeholder="••••••"
          className={`${FIELD} text-center font-mono text-2xl tracking-[0.5em]`}
          data-testid="my-input-otp"
        />
        <Button type="submit" variant="brand" accent="tags" size="lg" className="w-full" disabled={otp.length !== 6} loading={busy}>
          {t("verify")}
        </Button>
        <button
          type="button"
          disabled={busy || wait > 0}
          onClick={() => void ask()}
          className="min-h-10 w-full text-sm text-violet-300 hover:text-white disabled:text-white/35"
        >
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </button>
        <p className="text-center text-xs text-white/40">{t("noCodeHelp")}</p>
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} className="space-y-4" data-testid="my-details">
      {errorBox}
      <div className="space-y-2">
        <label htmlFor="my-plate-code" className="block text-sm font-medium text-white/80">{t("plateCodeLabel")}</label>
        <input
          id="my-plate-code"
          value={plateCode}
          onChange={(e) => setPlateCode(cleanPlateCode(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("plateCodePlaceholder")}
          className={`${FIELD} font-mono tracking-widest`}
          data-testid="my-input-plate"
        />
        <p className="text-xs text-white/40">{t("plateCodeHint")}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="my-phone" className="block text-sm font-medium text-white/80">{t("phoneLabel")}</label>
        <div className="flex h-12 gap-2">
          <CountryCodePicker value={countryCode} onChange={setCountryCode} label={t("country")} />
          <div className="relative flex-1">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              id="my-phone"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d\s().+-]/g, "").slice(0, 24))}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={phonePlaceholderFor(countryCode)}
              className={`${FIELD} pl-10`}
              data-testid="my-input-phone"
            />
          </div>
        </div>
      </div>
      <Button
        type="submit"
        variant="brand"
        accent="tags"
        size="lg"
        className="w-full"
        disabled={!plateCodeReady(plateCode) || phoneInput.replace(/\D/g, "").length < 7}
        loading={busy}
        data-testid="my-send-code"
      >
        {t("sendCode")}
        <ArrowRight />
      </Button>
    </form>
  );
}
