import { describe, expect, it } from "vitest";
import {
  CHART_TICK_DAY,
  CHART_TOOLTIP_DAY,
  NFC_COLOR,
  QR_COLOR,
  chartTooltip,
  formatChartDay,
  formatCount,
} from "../../client/src/pages/tags/charts";
import { SURFACE_MODAL } from "../../client/src/components/xpot/surface";

// Intl puts narrow no-break spaces in some locales; compare on plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("Tags chart helpers", () => {
  it("write a chart day in the app language, first letter capitalised, in UTC", () => {
    expect(formatChartDay("2026-03-04", "en-US", CHART_TICK_DAY)).toBe("Mar 4");
    expect(formatChartDay("2026-03-04", "pt-BR", CHART_TOOLTIP_DAY)).toBe("Quarta-feira, 4 de março");
    expect(formatChartDay("2026-03-04", "es-US", CHART_TICK_DAY).charAt(0)).toBe("4");
  });

  it("leave a value that is not a day as it is", () => {
    expect(formatChartDay("soon", "en-US", CHART_TICK_DAY)).toBe("soon");
  });

  it("give both dashboards one tooltip on the modal surface", () => {
    const tooltip = chartTooltip("en-US");
    expect(tooltip.contentStyle.background).toBe(SURFACE_MODAL);
    expect(tooltip.labelFormatter("2026-03-04")).toBe("Wednesday, March 4");
    expect(tooltip.labelFormatter(3)).toBe("3");
  });

  it("format counts with Intl in the app language", () => {
    expect(formatCount(1234, "en-US")).toBe("1,234");
    expect(plain(formatCount(1234, "pt-BR"))).toBe("1.234");
    expect(formatCount(Number.NaN, "en-US")).toBe("0");
  });

  it("keep QR and NFC apart", () => {
    expect(QR_COLOR).not.toBe(NFC_COLOR);
  });
});
