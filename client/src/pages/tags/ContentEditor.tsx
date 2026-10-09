import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Contact, Link2, Mail, Phone } from "lucide-react";
import {
  EMPTY_VCARD,
  buildMailto,
  buildTel,
  buildVCard,
  contentBytes,
  contentKindOf,
  isValidEmail,
  parseMailto,
  parseTel,
  parseVCard,
  vcardProblem,
  type ChipContentKind,
  type VCardFields,
} from "@shared/chipContent";
import { normalizeUrlInput } from "@shared/tagApp";
import { DEFAULT_COUNTRY_CODE, PHONE_COUNTRIES, formatPhone, normalizePhone } from "@shared/phone";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { maskUsPhoneInput } from "@/pages/xpot/phoneInput";
import { useT } from "@/i18n";
import { tagsMessages } from "@/i18n/messages/tags";
import { FieldLabel, INPUT } from "./ui";

// What a piece opens: a link (the default, edited by the caller's own field so
// the review-link helpers keep working), an email, a phone number or a contact
// card. Each kind has its own inputs, mask and validation (shared/chipContent.ts);
// the caller gets the stored value, or null with the reason while it is invalid.

export type ContentState = { value: string | null; error: string | null };

const KIND_ICON: Record<ChipContentKind, typeof Link2> = { url: Link2, email: Mail, phone: Phone, vcard: Contact };
const KINDS: ChipContentKind[] = ["url", "email", "phone", "vcard"];

/** Small chips: an NTAG213 holds ~137 bytes of NDEF data. */
const SMALL_CHIP_BYTES = 137;

/** Splits a stored E.164 number into the country picker's code and the typed part. */
function splitPhone(e164: string): { cc: string; local: string } {
  const match = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((c) => e164.startsWith(`+${c.code}`));
  if (!match) return { cc: DEFAULT_COUNTRY_CODE, local: e164 };
  const local = e164.slice(match.code.length + 1);
  return { cc: match.code, local: match.code === "1" ? maskUsPhoneInput(local) : local };
}

/** A phone field with the country picker; US numbers are masked as they are typed. */
function PhoneField({ value, onChange, label, testId }: {
  value: { cc: string; local: string };
  onChange: (next: { cc: string; local: string }) => void;
  label: string;
  testId: string;
}) {
  const t = useT(tagsMessages);
  return (
    <div className="flex gap-2">
      <CountryCodePicker value={value.cc} onChange={(cc) => onChange({ ...value, cc })} label={t("phoneCountry")} />
      <input
        type="tel"
        inputMode="tel"
        autoComplete="off"
        aria-label={label}
        value={value.local}
        onChange={(e) => onChange({ ...value, local: value.cc === "1" ? maskUsPhoneInput(e.target.value) : e.target.value.replace(/[^\d\s()+-]/g, "") })}
        placeholder={value.cc === "1" ? "(407) 555-1234" : ""}
        className={`${INPUT} min-w-0 flex-1`}
        data-testid={testId}
      />
    </div>
  );
}

function FieldError({ text }: { text: string | null }) {
  return text ? <p className="mt-1.5 text-sm text-red-300">{text}</p> : null;
}

export function ContentEditor({
  kind,
  onKind,
  initial,
  urlField,
  onChange,
  showBytes = false,
}: {
  kind: ChipContentKind;
  onKind: (kind: ChipContentKind) => void;
  /** The stored value to start from (an email, phone or vCard; a link is the caller's). */
  initial: string | null;
  /** The caller's link input, shown for the "url" kind. */
  urlField: ReactNode;
  /** The value to store, or null and the reason while it is invalid. Not called for "url". */
  onChange: (state: ContentState) => void;
  /** Direct chips: show how many bytes the content takes. */
  showBytes?: boolean;
}) {
  const t = useT(tagsMessages);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState({ cc: DEFAULT_COUNTRY_CODE, local: "" });
  const [card, setCard] = useState<VCardFields>(EMPTY_VCARD);
  const [cardPhone, setCardPhone] = useState({ cc: DEFAULT_COUNTRY_CODE, local: "" });
  const [touched, setTouched] = useState(false);

  // Seed from a stored value (opening a piece, or reusing a recent write).
  useEffect(() => {
    if (!initial) return;
    const k = contentKindOf(initial);
    if (k === "email") {
      const parsed = parseMailto(initial);
      setEmail(parsed.email);
      setSubject(parsed.subject);
    } else if (k === "phone") setPhone(splitPhone(parseTel(initial)));
    else if (k === "vcard") {
      const parsed = parseVCard(initial);
      setCard(parsed);
      setCardPhone(parsed.phone ? splitPhone(parsed.phone) : { cc: DEFAULT_COUNTRY_CODE, local: "" });
    }
    setTouched(false);
  }, [initial]);

  const state = useMemo<ContentState>(() => {
    if (kind === "email") {
      return isValidEmail(email) ? { value: buildMailto(email, subject), error: null } : { value: null, error: t("err_email") };
    }
    if (kind === "phone") {
      const e164 = normalizePhone(phone.local, phone.cc);
      return e164 ? { value: buildTel(e164), error: null } : { value: null, error: t("err_phone") };
    }
    if (kind === "vcard") {
      const typedPhone = cardPhone.local.trim();
      const e164 = typedPhone ? normalizePhone(typedPhone, cardPhone.cc) : "";
      const fields = { ...card, phone: e164 === null ? typedPhone : e164, url: normalizeUrlInput(card.url) };
      const problem = e164 === null ? "vcardPhone" : vcardProblem(fields);
      return problem ? { value: null, error: t(`err_${problem}`) } : { value: buildVCard(fields), error: null };
    }
    return { value: null, error: null };
  }, [kind, email, subject, phone, card, cardPhone, t]);

  useEffect(() => {
    if (kind !== "url") onChange(state);
  }, [kind, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownError = touched ? state.error : null;
  const bytes = showBytes && state.value ? contentBytes(state.value) : 0;
  const setField = (key: keyof VCardFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    setCard((c) => ({ ...c, [key]: e.target.value }));
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>{t("contentField")}</FieldLabel>
        <div role="radiogroup" aria-label={t("contentField")} className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1" data-testid="content-kind">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onKind(k)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold transition-colors touch-manipulation ${
                  active ? "bg-white/[0.12] text-white" : "text-white/50 active:bg-white/[0.06]"
                }`}
                data-testid={`content-kind-${k}`}
              >
                <Icon className="h-4 w-4" />
                {t(`contentKind_${k}`)}
              </button>
            );
          })}
        </div>
      </div>

      {kind === "url" && urlField}

      {kind === "email" && (
        <div className="space-y-3" onBlur={() => setTouched(true)}>
          <div>
            <FieldLabel>{t("emailField")}</FieldLabel>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
              placeholder={t("emailPlaceholder")}
              className={INPUT}
              data-testid="content-email"
            />
            <FieldError text={shownError} />
          </div>
          <div>
            <FieldLabel>{t("emailSubject")}</FieldLabel>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className={INPUT} />
          </div>
        </div>
      )}

      {kind === "phone" && (
        <div onBlur={() => setTouched(true)}>
          <FieldLabel>{t("phoneField")}</FieldLabel>
          <PhoneField value={phone} onChange={setPhone} label={t("phoneField")} testId="content-phone" />
          {state.value && <p className="mt-1.5 text-sm text-white/45">{formatPhone(parseTel(state.value))}</p>}
          <FieldError text={shownError} />
        </div>
      )}

      {kind === "vcard" && (
        <div className="space-y-3" onBlur={() => setTouched(true)}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>{t("vcardFirstName")}</FieldLabel>
              <input value={card.firstName} onChange={setField("firstName")} maxLength={60} autoComplete="off" className={INPUT} data-testid="vcard-first" />
            </div>
            <div>
              <FieldLabel>{t("vcardLastName")}</FieldLabel>
              <input value={card.lastName} onChange={setField("lastName")} maxLength={60} autoComplete="off" className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>{t("vcardOrg")}</FieldLabel>
              <input value={card.org} onChange={setField("org")} maxLength={80} autoComplete="off" className={INPUT} />
            </div>
            <div>
              <FieldLabel>{t("vcardTitle")}</FieldLabel>
              <input value={card.title} onChange={setField("title")} maxLength={60} autoComplete="off" className={INPUT} />
            </div>
          </div>
          <div>
            <FieldLabel>{t("phoneField")}</FieldLabel>
            <PhoneField
              value={cardPhone}
              onChange={(next) => {
                setTouched(true);
                setCardPhone(next);
              }}
              label={t("phoneField")}
              testId="vcard-phone"
            />
          </div>
          <div>
            <FieldLabel>{t("emailField")}</FieldLabel>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={card.email}
              onChange={(e) => {
                setTouched(true);
                setCard((c) => ({ ...c, email: e.target.value.replace(/\s/g, "") }));
              }}
              placeholder={t("emailPlaceholder")}
              className={INPUT}
              data-testid="vcard-email"
            />
          </div>
          <div>
            <FieldLabel>{t("vcardWebsite")}</FieldLabel>
            <input type="url" inputMode="url" autoCapitalize="none" value={card.url} onChange={setField("url")} placeholder="https://" className={INPUT} />
          </div>
          <FieldError text={shownError} />
        </div>
      )}

      {kind !== "url" && showBytes && bytes > 0 && (
        <p className={`text-xs ${bytes > SMALL_CHIP_BYTES ? "text-amber-300" : "text-white/40"}`} data-testid="content-bytes">
          {t("chipBytes", { bytes })}
          {bytes > SMALL_CHIP_BYTES && <> · {t("chipTooBig")}</>}
        </p>
      )}
    </div>
  );
}
