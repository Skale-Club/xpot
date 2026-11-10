import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { EYEBROW } from "@/components/xpot/surface";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  cancelGooglePhoneChallenge, confirmGooglePhoneCode, googlePhoneError, prepareGoogleIdentity,
  sendGooglePhoneCode, signInGoogleAlternative, signOutGoogleIdentity, type GoogleLoginConfig,
} from "@/lib/googleIdentity";
import { useT } from "@/i18n";
import { signInMethodsMessages } from "@/i18n/messages/signInMethods";
import { formatPhone, normalizePhone } from "@shared/phone";
import { phoneCountryCodeFromLocales } from "@shared/phoneCountry";

// Settings → Sign-in. Phone and Google each sign in on their own; here the
// person, already signed in, proves the other one to add it to this account.

interface Methods { phone: string | null; google: Array<{ email: string | null }>; canLink: boolean }
type ErrorKey = keyof typeof signInMethodsMessages.en;

async function send(method: "POST" | "DELETE", url: string, body?: unknown): Promise<Methods> {
  const res = await fetch(url, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.code ?? "generic"), { appCode: data.code ?? "generic" });
  return data as Methods;
}

export function SignInMethods() {
  const t = useT(signInMethodsMessages);
  const { toast } = useToast();
  const methods = useQuery<Methods>({ queryKey: ["/api/auth/sign-in-methods"] });
  const { data: config } = useQuery<{ google?: GoogleLoginConfig }>({ queryKey: ["/api/auth/phone/config"], staleTime: Infinity });
  const google = config?.google;
  const [phoneStep, setPhoneStep] = useState<"idle" | "number" | "code">("idle");
  const [countryCode, setCountryCode] = useState(() => phoneCountryCodeFromLocales(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]));
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"" | "phone" | "google" | "unlink">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (google) void prepareGoogleIdentity(google).catch(() => {});
    return cancelGooglePhoneChallenge;
  }, [google]);

  const showError = (code: string) => {
    const key = `err_${code}` as ErrorKey;
    setError(t(key in signInMethodsMessages.en ? key : "err_generic"));
  };

  const saved = (data: Methods, message: ErrorKey) => {
    queryClient.setQueryData(["/api/auth/sign-in-methods"], data);
    void queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] });
    toast({ title: t(message), variant: "success" });
  };

  const fail = (err: unknown) => showError((err as { appCode?: string }).appCode ?? googlePhoneError(err));

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!google || busy) return;
    const target = normalizePhone(phoneInput, countryCode);
    if (!target) return showError("invalid_phone");
    setBusy("phone"); setError("");
    try {
      await sendGooglePhoneCode(google, target);
      setPhone(target); setCode(""); setPhoneStep("code");
    } catch (err) { fail(err); }
    finally { setBusy(""); }
  };

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy("phone"); setError("");
    try {
      const idToken = await confirmGooglePhoneCode(phone, code);
      saved(await send("POST", "/api/auth/sign-in-methods", { idToken }), "phoneLinkedToast");
      setPhoneStep("idle"); setPhoneInput(""); setCode("");
    } catch (err) { setCode(""); fail(err); }
    finally { setBusy(""); void signOutGoogleIdentity().catch(() => {}); }
  };

  const linkGoogle = async () => {
    if (!google || busy) return;
    setBusy("google"); setError("");
    try {
      const idToken = await signInGoogleAlternative(google);
      saved(await send("POST", "/api/auth/sign-in-methods", { idToken }), "googleLinkedToast");
    } catch (err) {
      // Closing the Google window is not an error worth showing.
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-blocked") showError("popup_blocked");
      else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") fail(err);
    } finally { setBusy(""); void signOutGoogleIdentity().catch(() => {}); }
  };

  const unlinkGoogle = async () => {
    if (busy) return;
    setBusy("unlink"); setError("");
    try { saved(await send("DELETE", "/api/auth/sign-in-methods/google"), "googleRemovedToast"); }
    catch (err) { fail(err); }
    finally { setBusy(""); }
  };

  const data = methods.data;
  if (!data) return null;
  const canLink = data.canLink && Boolean(google);
  const googleEmails = data.google.map((item) => item.email).filter(Boolean) as string[];
  const field = `${FIELD_CONTROL} h-11 px-3`;
  // An account made with Google has no phone yet: the number field shows right away.
  const askNumber = canLink && (phoneStep === "number" || (phoneStep === "idle" && !data.phone));

  return (
    <div className="space-y-5" data-testid="settings-sign-in-methods">
      <p className="text-sm text-white/45">{t("intro")}</p>
      {error && <div data-testid="sign-in-methods-error"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="space-y-3 border-b border-white/[0.08] pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={EYEBROW}>{t("phone")}</p>
            <p className="mt-1.5 text-base font-semibold text-white" data-testid="settings-sign-in-phone">{data.phone ? formatPhone(data.phone) : t("notLinked")}</p>
          </div>
          {canLink && phoneStep === "idle" && data.phone && (
            <Button type="button" variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => { setError(""); setPhoneStep("number"); }} data-testid="button-link-phone">
              <Phone />
              {t("changePhone")}
            </Button>
          )}
        </div>
        {askNumber && (
          <form onSubmit={sendCode} className="space-y-3">
            {!data.phone && <p className="text-sm text-white/60">{t("phoneHint")}</p>}
            <label htmlFor="link-phone" className="block text-sm font-medium text-white/70">{t("phoneLabel")}</label>
            <div className="flex h-11 gap-2">
              <CountryCodePicker value={countryCode} onChange={setCountryCode} label={t("country")} />
              <input id="link-phone" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} type="tel" inputMode="tel" autoComplete="tel-national" autoFocus className={`${field} flex-1`} data-testid="input-link-phone" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="brand" size="sm" loading={busy === "phone"} disabled={phoneInput.replace(/\D/g, "").length < 7} data-testid="button-link-send-code">{t("sendCode")}</Button>
              {data.phone && <Button type="button" variant="ghost" size="sm" onClick={() => { cancelGooglePhoneChallenge(); setPhoneStep("idle"); setError(""); }}>{t("cancel")}</Button>}
            </div>
          </form>
        )}
        {phoneStep === "code" && (
          <form onSubmit={confirmCode} className="space-y-3">
            <p className="text-sm text-white/60">{t("codeSent", { phone: formatPhone(phone) })}</p>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label={t("codeLabel")} placeholder="••••••" autoFocus className={`${field} w-40 text-center font-mono text-lg tracking-[0.4em]`} data-testid="input-link-code" />
            <div className="flex gap-2">
              <Button type="submit" variant="brand" size="sm" loading={busy === "phone"} disabled={code.length !== 6}>{t("verify")}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { cancelGooglePhoneChallenge(); setPhoneStep("idle"); setError(""); }}>{t("cancel")}</Button>
            </div>
          </form>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={EYEBROW}>{t("google")}</p>
          <p className="mt-1.5 break-all text-base font-semibold text-white" data-testid="settings-sign-in-google">
            {googleEmails.length ? googleEmails.join(", ") : data.google.length ? t("googleLinked") : t("notLinked")}
          </p>
          {canLink && !data.google.length && <p className="mt-1 text-sm text-white/60">{t("googleHint")}</p>}
        </div>
        {canLink && (data.google.length ? (
          <Button type="button" variant="ghost" size="sm" loading={busy === "unlink"} disabled={Boolean(busy) && busy !== "unlink"} onClick={() => void unlinkGoogle()} data-testid="button-unlink-google">
            {t("unlinkGoogle")}
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" loading={busy === "google"} disabled={Boolean(busy) && busy !== "google"} onClick={() => void linkGoogle()} data-testid="button-link-google">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.26 1.28-1.02 2.37-2.15 3.1v2.58h3.48c2.04-1.88 3.21-4.65 3.21-7.55Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.48-2.58c-.98.66-2.24 1.06-3.8 1.06-2.87 0-5.3-1.94-6.17-4.54H2.23v2.66C4.04 20.53 7.73 23 12 23Z" />
              <path fill="#FBBC05" d="M5.83 14.28A6.6 6.6 0 0 1 5.48 12c0-.79.14-1.55.35-2.28V7.06H2.23A10.94 10.94 0 0 0 1 12c0 1.78.43 3.45 1.23 4.94l3.6-2.66Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.73 1 4.04 3.47 2.23 7.06l3.6 2.66C6.7 7.12 9.13 5.38 12 5.38Z" />
            </svg>
            {t("linkGoogle")}
          </Button>
        ))}
      </div>
      {!canLink && <p className="text-xs text-white/40">{t("unavailable")}</p>}
    </div>
  );
}
