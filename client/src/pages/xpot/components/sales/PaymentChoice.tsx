// How the customer paid, asked in words and never assumed: "They paid $35.00" or "They'll pay later", and for money
// that arrived, the way it arrived. Nothing is recorded as received until the rep taps it (settlePayment is the rule).

import { Button } from "@/components/ui/button";
import { Field, MoneyInput } from "./ui";
import { SETTLE_METHODS, type SettleChoice, type SettleMethod } from "./settleCount";
import { formatCents } from "../../utils";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";

export type PaymentChoiceState = { choice: SettleChoice | null; method: SettleMethod | ""; partialCents: number };
export const NO_PAYMENT_CHOSEN: PaymentChoiceState = { choice: null, method: "", partialCents: 0 };

export function PaymentChoice({ value, onChange, amountCents, currency }: {
  value: PaymentChoiceState;
  onChange: (next: PaymentChoiceState) => void;
  amountCents: number;
  currency: string;
}) {
  const t = useT(salesModuleMessages);
  const { choice, method, partialCents } = value;
  const paid = choice === "paid" || choice === "partial";
  return (
    <div className="space-y-3" data-testid="payment-choice">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={paid ? "brand" : "secondary"} aria-pressed={paid}
          onClick={() => onChange({ ...value, choice: "paid" })} data-testid="settle-they-paid">
          {t("theyPaid", { amount: formatCents(amountCents, currency) })}
        </Button>
        <Button type="button" variant={choice === "later" ? "brand" : "secondary"} aria-pressed={choice === "later"}
          onClick={() => onChange({ ...value, choice: "later" })} data-testid="settle-pay-later">
          {t("theyPayLater")}
        </Button>
      </div>
      {choice === "paid" && (
        <button type="button" className="text-xs font-medium text-blue-300 hover:text-blue-200"
          onClick={() => onChange({ ...value, choice: "partial" })} data-testid="settle-part-of-it">
          {t("partOfIt")}
        </button>
      )}
      {choice === "partial" && (
        <Field label={t("amountReceived")}>
          <MoneyInput valueCents={partialCents} onChangeCents={(cents) => onChange({ ...value, partialCents: cents })} currency={currency} autoFocus />
        </Field>
      )}
      {paid && (
        <div className="space-y-1.5" role="group" aria-label={t("howTheyPaid")}>
          <div className="text-xs font-semibold text-white/60">{t("howTheyPaid")}</div>
          <div className="grid grid-cols-3 gap-2">
            {SETTLE_METHODS.map((option) => (
              <Button key={option} type="button" size="sm" variant={method === option ? "brand" : "secondary"}
                aria-pressed={method === option} onClick={() => onChange({ ...value, method: option })} data-testid={`settle-method-${option}`}>
                {t(`method_${option}`)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
