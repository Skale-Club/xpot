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
import { ACCENT_SELECTED, MODULE_ACCENT, OPACITY_STEPS, RADIUS } from "../client/src/components/xpot/surface";
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
