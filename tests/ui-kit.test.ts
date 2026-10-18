// Rules of the shared UI kit (docs/UI_KIT.md) that are cheap to check in code:
// the tone maps keep their colour meanings, and every opacity step the screens
// use is one Tailwind actually generates.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSIGNMENT_STATUS_TONE,
  HEALTH_TONE,
  INTEGRATION_TONE,
  PAYMENT_STATUS_TONE,
  PIECE_STATUS_TONE,
  PILL_BORDERS,
  PILL_DOTS,
  PILL_TONES,
  ROLE_TONE,
  ROUTE_STATUS_TONE,
  SALE_STATUS_TONE,
  SOLD_TONE,
  STOCK_STATUS_TONE,
  STOP_STATUS_TONE,
  TASK_TONE,
  VISIT_OUTCOME_TONE,
  toneOf,
} from "../client/src/components/xpot/StatusPill";
import { ACCENT_SELECTED, MODULE_ACCENT, OPACITY_STEPS, PAGE_BASE, RADIUS } from "../client/src/components/xpot/surface";
import { MONEY_CHART, MONEY_DUE_TONE } from "../client/src/pages/xpot/components/sales/moneyPalette";
import { TAG_STOCK_STATUSES } from "../shared/tags";

describe("tone maps", () => {
  it("never use violet outside Tags", () => {
    const visitsAndAdmin = {
      VISIT_OUTCOME_TONE,
      PAYMENT_STATUS_TONE,
      SALE_STATUS_TONE,
      CONSIGNMENT_STATUS_TONE,
      TASK_TONE,
      ROUTE_STATUS_TONE,
      STOP_STATUS_TONE,
      INTEGRATION_TONE,
      HEALTH_TONE,
      ROLE_TONE,
    };
    for (const [name, map] of Object.entries(visitsAndAdmin)) {
      expect(Object.values(map), name).not.toContain("violet");
    }
  });

  it("keep green for money and success in Visits", () => {
    const green = Object.entries(VISIT_OUTCOME_TONE).filter(([, tone]) => tone === "green").map(([key]) => key);
    expect(green).toEqual(["sale_made"]);
    expect(PAYMENT_STATUS_TONE.paid).toBe("green");
    expect(PAYMENT_STATUS_TONE.unpaid).toBe("red");
  });

  it("mark late tasks red and today's amber", () => {
    expect(TASK_TONE.overdue).toBe("red");
    expect(TASK_TONE.due_today).toBe("amber");
  });

  it("cover every stock status, sold in the sold blue and pending as a step", () => {
    expect(Object.keys(STOCK_STATUS_TONE).sort()).toEqual([...TAG_STOCK_STATUSES].sort());
    expect(STOCK_STATUS_TONE.sold).toBe(SOLD_TONE);
    expect(STOCK_STATUS_TONE.pending).toBe("amber");
    expect(PIECE_STATUS_TONE.active).toBe("green");
  });

  it("have a fill, border and dot for every tone", () => {
    const tones = Object.keys(PILL_TONES).sort();
    expect(Object.keys(PILL_BORDERS).sort()).toEqual(tones);
    expect(Object.keys(PILL_DOTS).sort()).toEqual(tones);
  });

  it("toneOf falls back for unknown values", () => {
    expect(toneOf(ROUTE_STATUS_TONE, "completed")).toBe("green");
    expect(toneOf(ROUTE_STATUS_TONE, "mystery")).toBe("slate");
    expect(toneOf(ROUTE_STATUS_TONE, null, "muted")).toBe("muted");
  });
});

// WCAG relative luminance and contrast of two #rrggbb colours.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** HSL saturation, 0 for a grey. */
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
}

describe("money palette", () => {
  it("paints costs and discounts in the neutral cost tone, never amber or rose", () => {
    expect(MONEY_CHART.cost.swatch).toMatch(/slate/);
    expect(MONEY_CHART.cost.text).toMatch(/slate/);
    expect(saturation(MONEY_CHART.cost.stroke)).toBeLessThan(0.3);
    const source = readFileSync("client/src/pages/xpot/components/sales/SalesOverview.tsx", "utf8");
    for (const key of ["discountsGiven", "acquisitionCosts"]) {
      const line = source.split("\n").find((text) => text.includes(`t("${key}")`));
      expect(line, key).toContain('accent="cost"');
    }
    expect(source).not.toMatch(/rose-|accent="amber"/);
  });

  it("keeps cost readable beside revenue and profit on the page", () => {
    for (const [name, tone] of Object.entries(MONEY_CHART)) {
      expect(contrast(tone.stroke, PAGE_BASE), name).toBeGreaterThan(7);
    }
    // Revenue and profit are colours; cost is the grey between them, not a third hue.
    expect(saturation(MONEY_CHART.revenue.stroke)).toBeGreaterThan(0.6);
    expect(saturation(MONEY_CHART.profit.stroke)).toBeGreaterThan(0.6);
    expect(new Set([MONEY_CHART.revenue.stroke, MONEY_CHART.profit.stroke, MONEY_CHART.cost.stroke]).size).toBe(3);
  });

  it("marks money to collect amber and only overdue money red", () => {
    expect(MONEY_DUE_TONE).toEqual({ outstanding: "amber", overdue: "red" });
  });
});

describe("surface tokens", () => {
  it("give every module an accent for the selected state", () => {
    expect(Object.keys(ACCENT_SELECTED).sort()).toEqual(Object.keys(MODULE_ACCENT).sort());
  });

  it("keep the radius scale on stock Tailwind steps (xl, 2xl, 3xl)", () => {
    expect(RADIUS).toEqual({ control: "0.75rem", card: "1rem", sheet: "1.5rem" });
  });
});

describe("opacity classes", () => {
  // Tailwind 3 generates color/opacity modifiers only for the theme's opacity
  // scale: multiples of 5 plus what tailwind.config.ts adds (OPACITY_STEPS).
  // Anything else (text-white/32) silently renders nothing.
  const root = join(__dirname, "..", "client", "src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(name)) files.push(path);
    }
  };
  walk(root);

  it("only use steps Tailwind generates", () => {
    const allowed = new Set<number>([...Array.from({ length: 21 }, (_, i) => i * 5), ...Object.keys(OPACITY_STEPS).map(Number)]);
    const pattern = /\b(?:text|bg|border|ring|from|to|via|divide|outline|shadow|fill|stroke|placeholder|caret|accent|decoration)-[a-z]+(?:-\d{2,3})?\/(\d+)\b/g;
    const bad: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(pattern)) {
        if (!allowed.has(Number(match[1]))) bad.push(`${file.slice(root.length + 1)}: ${match[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
