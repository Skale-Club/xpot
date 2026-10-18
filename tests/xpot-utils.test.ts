import { beforeEach, describe, expect, it, vi } from "vitest";

// pages/xpot/utils.ts formats through lib/format.ts in the app language; the
// i18n module pulls in browser-only code, so stand in the locale and lookup.
const lang = vi.hoisted(() => ({ current: "en" as "en" | "pt" | "es" }));
vi.mock("../client/src/i18n", () => {
  const LOCALES = { en: "en-US", pt: "pt-BR", es: "es-US" } as const;
  return {
    currentLocale: () => LOCALES[lang.current],
    translate: (dict: Record<string, Record<string, string>>, key: string, vars?: Record<string, string | number>) =>
      (dict[lang.current][key] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`)),
  };
});

import {
  currencySymbol,
  displayPhone,
  formatCents,
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatShortDate,
  formatVisitWhen,
  phoneHref,
} from "../client/src/pages/xpot/utils";
import { formatMoney, formatDateTime as kitDateTime } from "../client/src/lib/format";

const plain = (s: string) => s.replace(/[  ]/g, " ");

beforeEach(() => {
  lang.current = "en";
});

describe("pages/xpot/utils formatters", () => {
  it("money is lib/format's, in the app language", () => {
    expect(formatCents(123450)).toBe(formatMoney(123450, "USD"));
    expect(plain(formatCents(123450))).toBe("$1,234.50");
    lang.current = "pt";
    expect(plain(formatCents(123450, "BRL"))).toBe("R$ 1.234,50");
    expect(plain(formatCurrency(1234.6, "USD"))).toBe("US$ 1.235");
  });

  it("a date time uses the kit shape and keeps the translated 'Not set'", () => {
    const at = "2026-03-04T14:05:00";
    expect(formatDateTime(at)).toBe(kitDateTime(at));
    expect(formatDateTime(null)).toBe("Not set");
    lang.current = "pt";
    expect(formatDateTime(undefined)).toBe("Não definido");
  });

  it("short dates and durations use the kit, with a dash when missing", () => {
    expect(formatShortDate("2026-03-04T12:00:00")).toBe("Mar 4");
    expect(formatShortDate(null)).toBe("—");
    expect(formatDuration(90 * 60)).toBe("1 h 30 min");
    expect(formatDuration(null)).toBe("—");
  });

  it("the currency symbol follows the currency, not a hardcoded $", () => {
    expect(currencySymbol("USD", "en-US")).toBe("$");
    expect(currencySymbol("BRL", "pt-BR")).toBe("R$");
    expect(currencySymbol("EUR", "es-US")).toBe("€");
    expect(currencySymbol("not-a-currency", "en-US")).toBe("$");
  });
});

describe("formatVisitWhen", () => {
  it("reads the check-in, or the planned time before one", () => {
    expect(formatVisitWhen({ checkedInAt: "2026-03-04T14:05:00", scheduledAt: "2026-03-01T09:00:00" })).toEqual({ date: "Mar 4", time: "2:05 PM" });
    expect(formatVisitWhen({ checkedInAt: null, scheduledAt: "2026-03-01T09:00:00" })).toEqual({ date: "Mar 1", time: "9:00 AM" });
  });

  it("is null when the visit has no time at all", () => {
    expect(formatVisitWhen({})).toBeNull();
    expect(formatVisitWhen({ checkedInAt: "nonsense" })).toBeNull();
  });
});

describe("phones", () => {
  it("display a stored number the one way, keeping what cannot be read", () => {
    expect(displayPhone("(407) 555-1234")).toBe("+1 (407) 555-1234");
    expect(displayPhone("+5511987654321")).toBe("+55 11 98765-4321");
    expect(displayPhone("ext. 12")).toBe("ext. 12");
    expect(displayPhone(null)).toBe("");
  });

  it("tel: links carry E.164 or the bare digits", () => {
    expect(phoneHref("(407) 555-1234")).toBe("tel:+14075551234");
    expect(phoneHref("12-34")).toBe("tel:1234");
    expect(phoneHref("  ")).toBeUndefined();
  });
});
