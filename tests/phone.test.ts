import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizePhone } from "../shared/phone";

describe("normalizePhone", () => {
  it("reads a bare US number as +1", () => {
    expect(normalizePhone("(508) 555-0100")).toBe("+15085550100");
    expect(normalizePhone("508.555.0100")).toBe("+15085550100");
    expect(normalizePhone("1 508 555 0100")).toBe("+15085550100");
  });

  it("keeps an explicit country code", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("0055 11 98765 4321")).toBe("+5511987654321");
    expect(normalizePhone("+1 508 555 0100")).toBe("+15085550100");
  });

  it("uses the chosen country for digits only", () => {
    expect(normalizePhone("11 98765 4321", "55")).toBe("+5511987654321");
  });

  it("refuses what can't be a phone", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("555-0100")).toBeNull();
    expect(normalizePhone("+1 508 555 01000")).toBeNull();
    expect(normalizePhone("+0 123 456 7890")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("formatPhone / maskPhone", () => {
  it("formats US and Brazil numbers", () => {
    expect(formatPhone("+15085550100")).toBe("+1 (508) 555-0100");
    expect(formatPhone("+5511987654321")).toBe("+55 11 98765-4321");
    expect(formatPhone(null)).toBe("");
  });

  it("hides the middle of the number", () => {
    expect(maskPhone("+15085550100")).toBe("+1 •••• 0100");
    expect(maskPhone("+5511987654321")).toBe("+55 •••• 4321");
  });
});
