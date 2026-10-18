import { beforeEach, describe, expect, it, vi } from "vitest";

// The app's i18n module pulls in browser-only code; the formatters only need the
// active locale and the message lookup, so stand those in.
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
  EMPTY_VALUE,
  formatCents,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatMoney,
  formatPercent,
  formatPhone,
  formatShare,
  formatTime,
} from "../client/src/lib/format";

// Intl puts narrow no-break spaces in some locales; compare on plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, " ");

beforeEach(() => {
  lang.current = "en";
});

describe("dates", () => {
  const when = new Date(2026, 2, 4, 14, 5); // local time, so the test is timezone-proof

  it("follow the app language, not the browser", () => {
    expect(plain(formatDateTime(when))).toBe("Mar 4, 2026, 2:05 PM");
    lang.current = "pt";
    expect(plain(formatDateTime(when))).toBe("4 de mar. de 2026, 14:05");
  });

  it("formatDate takes Intl options and an explicit locale", () => {
    expect(formatDate(when)).toBe("Mar 4, 2026");
    expect(formatDate(when, { month: "short", day: "numeric" })).toBe("Mar 4");
    expect(formatDate(when, { day: "2-digit", month: "2-digit" }, "pt-BR")).toBe("04/03");
  });

  it("formatTime writes the clock of the language", () => {
    expect(plain(formatTime(when))).toBe("2:05 PM");
    expect(formatTime(when, "pt-BR")).toBe("14:05");
  });

  it("show a dash for missing or invalid values", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(formatDateTime(value)).toBe(EMPTY_VALUE);
      expect(formatDate(value)).toBe(EMPTY_VALUE);
      expect(formatTime(value)).toBe(EMPTY_VALUE);
    }
  });

  it("accept ISO strings and timestamps", () => {
    expect(formatDate(when.toISOString())).toBe("Mar 4, 2026");
    expect(formatDate(when.getTime())).toBe("Mar 4, 2026");
  });
});

describe("money", () => {
  it("formats integer cents with two decimals in the app locale", () => {
    expect(formatMoney(123450)).toBe("$1,234.50");
    expect(plain(formatMoney(123450, "BRL", "pt-BR"))).toBe("R$ 1.234,50");
    lang.current = "pt";
    expect(plain(formatMoney(500, "USD"))).toBe("US$ 5,00");
  });

  it("treats a missing amount as zero and a missing currency as USD", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined, "")).toBe("$0.00");
  });

  it("keeps formatCents as the same function", () => {
    expect(formatCents).toBe(formatMoney);
  });

  it("formatCurrency rounds whole units", () => {
    expect(formatCurrency(1234.5)).toBe("$1,235");
    expect(formatCurrency(null)).toBe("$0");
  });
});

describe("percentages", () => {
  it("are locale-aware", () => {
    expect(formatPercent(0.452)).toBe("45%");
    expect(formatPercent(0.4567, { digits: 1 })).toBe("45.7%");
    expect(plain(formatPercent(0.4567, { digits: 1, locale: "pt-BR" }))).toBe("45,7%");
  });

  it("show a dash when there is no number", () => {
    expect(formatPercent(null)).toBe(EMPTY_VALUE);
    expect(formatPercent(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatPercent(Infinity)).toBe(EMPTY_VALUE);
  });

  it("formatShare is 0% without a total", () => {
    expect(formatShare(3, 4)).toBe("75%");
    expect(formatShare(3, 0)).toBe("0%");
  });
});

describe("distances", () => {
  it("use miles (and feet when short) in English", () => {
    expect(formatDistance(50)).toBe("164 ft");
    expect(formatDistance(1609.344 * 0.4)).toBe("0.4 mi");
    expect(formatDistance(1609.344 * 12.3)).toBe("12 mi");
  });

  it("use metres and kilometres in every other language", () => {
    expect(formatDistance(85, "pt-BR")).toBe("85 m");
    expect(formatDistance(1400, "pt-BR")).toBe("1,4 km");
    expect(formatDistance(23_600, "es-US")).toBe("24 km");
    lang.current = "es";
    expect(formatDistance(999.6)).toBe("1 km");
  });

  it("clamp negatives and dash missing values", () => {
    expect(formatDistance(-5, "pt-BR")).toBe("0 m");
    expect(formatDistance(null)).toBe(EMPTY_VALUE);
  });
});

describe("phone", () => {
  it("delegates to shared/phone", () => {
    expect(formatPhone("+15085550100")).toBe("+1 (508) 555-0100");
    expect(formatPhone("+5511987654321")).toBe("+55 11 98765-4321");
    expect(formatPhone(null)).toBe("");
  });
});

describe("durations", () => {
  it("pick seconds, minutes or hours", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(12 * 60 + 20)).toBe("12 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05 min");
    expect(formatDuration(2 * 3600)).toBe("2 h");
  });

  it("are translated", () => {
    lang.current = "pt";
    expect(formatDuration(65 * 60)).toBe("1 h 05 min");
    expect(formatDuration(30)).toBe("30 s");
  });

  it("dash missing or negative values", () => {
    expect(formatDuration(null)).toBe(EMPTY_VALUE);
    expect(formatDuration(-1)).toBe(EMPTY_VALUE);
  });
});
