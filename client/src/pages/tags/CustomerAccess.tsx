import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Phone, Plus, X } from "lucide-react";
import { CUSTOMER_PANEL_PATH, type CustomerContactsResponse } from "@shared/customerPanel";
import { formatPhone } from "@shared/phone";
import { dialCodeOf, phoneCountryCodeFromLocales } from "@shared/phoneCountry";
import { useT } from "@/i18n";
import { myPlatesMessages } from "@/i18n/messages/myPlates";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CountryCodePicker } from "@/components/CountryCodePicker";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { FIELD_CONTROL } from "@/components/xpot/Field";
import { CARD, CopyButton, EYEBROW_MUTED, Spinner } from "./ui";

// "Plate owner access" on a customer's page: the phones that may read this business's plates at /my. The seller who can
// use the customer adds or removes them; the customer signs in with the code on one of its plates and a text message.
// Shown only while the server has the customer panel on (GET /api/my/enabled).

const FIELD = `${FIELD_CONTROL} h-11 px-3 !text-base`;


/** The panel's section for one customer; renders nothing while the panel is off. */
export function CustomerAccess({ leadId, onDone }: { leadId: number; onDone: (text: string, ok: boolean) => void }) {
  const enabled = useQuery<{ enabled: boolean }>({ queryKey: ["/api/my/enabled"], staleTime: 5 * 60_000 });
  if (!enabled.data?.enabled) return null;
  return <AccessSection leadId={leadId} onDone={onDone} />;
}

function AccessSection({ leadId, onDone }: { leadId: number; onDone: (text: string, ok: boolean) => void }) {
  const t = useT(myPlatesMessages);
  const qc = useQueryClient();
  const url = `/api/xpot/leads/${leadId}/customer-contacts`;
  const list = useQuery<CustomerContactsResponse>({ queryKey: ["/api/xpot/leads", leadId, "customer-contacts"], staleTime: 30_000 });
  // The business's own country first (a customer in the US added from a phone set to Portuguese is still +1), else the phone's language.
  const [chosenCountry, setCountryCode] = useState<string | null>(null);
  const countryCode = chosenCountry ?? dialCodeOf(list.data?.businessPhone) ?? phoneCountryCodeFromLocales(
    typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language],
  );
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const words = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : null;
    if (code === "invalid_phone") return t("accessInvalid");
    if (code === "too_many_contacts") return t("accessTooMany");
    return t("accessFailed");
  };
  const save = (data: CustomerContactsResponse) => qc.setQueryData(["/api/xpot/leads", leadId, "customer-contacts"], data);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    try {
      save(await (await apiRequest("POST", url, { phone, countryCode })).json());
      setPhone("");
      onDone(t("accessAdded"), true);
    } catch (err) {
      onDone(words(err), false);
    } finally {
      setBusy(false);
    }
  };

  // ConfirmDialog closes when this resolves and keeps itself open when it throws.
  const remove = async () => {
    if (!removing) return;
    try {
      save(await (await apiRequest("DELETE", url, { phone: removing })).json());
      onDone(t("accessRemoved"), true);
    } catch (err) {
      onDone(words(err), false);
      throw err;
    }
  };

  const link = `${typeof window === "undefined" ? "" : window.location.origin}${CUSTOMER_PANEL_PATH}`;
  const contacts = list.data?.contacts ?? [];
  const businessPhone = list.data?.businessPhone ?? null;

  return (
    <section className={`${CARD} p-4`} data-testid="customer-access">
      <h2 className={`${EYEBROW_MUTED} mb-2`}>{t("accessTitle")}</h2>
      <p className="text-sm text-white/50">{t("accessHint")}</p>

      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <p className={EYEBROW_MUTED}>{t("accessLink")}</p>
          <p className="truncate text-sm text-white/85" data-testid="customer-access-link">{link}</p>
        </div>
        <CopyButton text={link} label={t("accessCopy")} />
      </div>

      <div className="mt-4">
        {list.isLoading ? (
          <div className="flex justify-center py-3 text-white/40"><Spinner /></div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {businessPhone && (
              <li className="flex items-center gap-3 py-2.5" data-testid="customer-access-business-phone">
                <Phone className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{formatPhone(businessPhone)}</span>
                  <span className="block text-xs text-white/45">{t("accessBusinessPhone")} · {t("accessBusinessPhoneHint")}</span>
                </span>
              </li>
            )}
            {contacts.filter((c) => c.phone !== businessPhone).map((c) => (
              <li key={c.phone} className="flex items-center gap-3 py-2.5" data-testid={`customer-access-${c.phone}`}>
                <Phone className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{formatPhone(c.phone)}</span>
                  <span className={`flex items-center gap-1 text-xs ${c.verifiedAt ? "text-emerald-300" : "text-white/45"}`}>
                    {c.verifiedAt && <Check className="h-3 w-3" aria-hidden="true" />}
                    {c.verifiedAt ? t("accessSeen") : t("accessNotSeen")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setRemoving(c.phone)}
                  aria-label={t("accessRemove", { phone: formatPhone(c.phone) })}
                  title={t("accessRemove", { phone: formatPhone(c.phone) })}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/35 hover:bg-white/[0.08] hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {!list.isLoading && !businessPhone && contacts.length === 0 && <p className="py-2 text-sm text-white/45">{t("accessNone")}</p>}
      </div>

      {/* A phone: the country and the number on one row, the button under them; on a computer all on one. */}
      <form onSubmit={(e) => void add(e)} className="mt-3 flex flex-col gap-2 sm:flex-row" data-testid="customer-access-form">
        <div className="flex min-w-0 flex-1 gap-2">
          <CountryCodePicker value={countryCode} onChange={setCountryCode} label={t("country")} />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d\s().+-]/g, "").slice(0, 24))}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={t("accessPhonePlaceholder")}
            aria-label={t("accessAdd")}
            className={`${FIELD} min-w-0 flex-1`}
            data-testid="customer-access-phone"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="h-11 w-full sm:w-auto" loading={busy} disabled={phone.replace(/\D/g, "").length < 7}>
          <Plus />
          {t("accessAllow")}
        </Button>
      </form>

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        tone="danger"
        title={t("accessRemoveTitle")}
        description={removing ? t("accessRemoveBody", { phone: formatPhone(removing) }) : ""}
        confirmLabel={t("accessRemoveConfirm")}
        onConfirm={() => remove()}
      />
    </section>
  );
}
