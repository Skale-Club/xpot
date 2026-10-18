import {
  Activity,
  Building2,
  DollarSign,
  Route,
  ListTodo,
} from "lucide-react";
import type { GooglePlaceResult, FullSalesLead } from "./types";
import { currentLocale, translate } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import {
  formatCurrency as formatWholeCurrency,
  formatDate,
  formatDateTime as formatKitDateTime,
  formatDuration as formatKitDuration,
  formatMoney,
  formatPhone as formatE164Phone,
  formatTime,
} from "@/lib/format";
import { normalizePhone } from "@shared/phone";

// Dates, money and durations come from lib/format.ts (the app language, one
// shape everywhere). These names stay because the Visits screens and a few
// admin/Tags screens import them from here.

/** Bottom-nav tabs, in the sidebar's order (moduleNav VISITS_TAB_ORDER); `labelKey` is a key of shellMessages. */
export const tabs = [
  { id: "dashboard", labelKey: "tabDashboard", icon: Activity },
  { id: "route", labelKey: "tabRoute", icon: Route },
  { id: "leads", labelKey: "tabLeads", icon: Building2 },
  { id: "tasks", labelKey: "tabTasks", icon: ListTodo },
  { id: "sales", labelKey: "tabSales", icon: DollarSign },
] as const;

/** "Mar 4, 2026, 2:05 PM"; a missing date reads "Not set" (translated), as callers expect. */
export function formatDateTime(value?: string | Date | null) {
  if (!value) return translate(shellMessages, "notSet");
  return formatKitDateTime(value);
}

/** Whole currency units ("$1,235"), for opportunity values and dashboard totals. */
export function formatCurrency(value: number, currency: string) {
  return formatWholeCurrency(value, currency);
}

/** Seconds → "45 s", "12 min", "1 h 05 min"; missing: "—". */
export function formatDuration(seconds?: number | null) {
  return formatKitDuration(seconds);
}

/**
 * When a visit happened: its check-in, or the planned time for a visit not
 * started yet. One helper for the phone card, the desktop table, the
 * dashboard and the company page, so a visit reads the same everywhere.
 */
export function formatVisitWhen(visit: { checkedInAt?: string | Date | null; scheduledAt?: string | Date | null }): { date: string; time: string } | null {
  const when = visit.checkedInAt ?? visit.scheduledAt;
  if (!when || Number.isNaN(new Date(when).getTime())) return null;
  return { date: formatDate(when, { month: "short", day: "numeric" }), time: formatTime(when) };
}

/** A stored phone for display: "+1 (407) 555-1234" when it reads as a number, else as typed. */
export function displayPhone(raw?: string | null): string {
  if (!raw) return "";
  const e164 = normalizePhone(raw);
  return e164 ? formatE164Phone(e164) : raw;
}

/** tel: link for a stored phone: E.164 when it reads as a number, else its digits. */
export function phoneHref(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  return `tel:${normalizePhone(raw) ?? raw.replace(/[^0-9+]/g, "")}`;
}

/** A distance or GPS accuracy for people: "85 m", "1.4 km". */
export function formatMeters(meters: number) {
  const value = Math.max(0, Math.round(meters));
  if (value < 1000) return `${value} m`;
  const km = new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: value < 10_000 ? 1 : 0 }).format(value / 1000);
  return `${km} km`;
}

export function normalizeSearchValue(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseAddress(address?: string) {
  if (!address) {
    return { addressLine1: "", city: "", state: "" };
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    addressLine1: parts[0] || address,
    city: parts[1] || "",
    state: parts[2]?.split(" ")[0] || "",
  };
}

export function findMatchingLead(place: GooglePlaceResult, leads: FullSalesLead[]) {
  const placeName = normalizeSearchValue(place.name);
  const placeAddress = normalizeSearchValue(place.address);

  return leads.find((lead) => {
    const leadName = normalizeSearchValue(lead.name);
    const locationAddress = normalizeSearchValue(
      lead.locations?.map((location) => `${location.addressLine1} ${location.city || ""} ${location.state || ""}`).join(" ") || "",
    );

    return (
      leadName === placeName ||
      (placeAddress.length > 10 && locationAddress.includes(placeAddress)) ||
      (locationAddress.length > 10 && placeAddress.includes(locationAddress))
    );
  });
}

/**
 * The saved company a Google result already is: the one carrying its Place ID,
 * else one that looks like it (findMatchingLead). Used to mark "already saved"
 * results and to check in at the company instead of importing it again.
 */
export function matchSavedLead(place: GooglePlaceResult, leads: FullSalesLead[]) {
  return leads.find((lead) => lead.googlePlaceId && lead.googlePlaceId === place.placeId) ?? findMatchingLead(place, leads);
}

// ─── Money (integer cents) ───────────────────────────────────────────────────

/** Integer cents → "$1,234.50" (lib/format formatMoney). */
export function formatCents(cents: number | null | undefined, currency = "USD") {
  return formatMoney(cents, currency);
}

/** The short symbol a currency is written with ("$", "R$", "€"), for the prefix of a money box. */
export function currencySymbol(currency = "USD", locale: string = currentLocale()): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency: currency || "USD", currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? "$";
  } catch {
    return "$";
  }
}

/** "4.5" / "4,50" / "$4.50" → 450. Empty or unparsable → 0. */
export function inputToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

/** "Mar 4"; missing: "—". */
export function formatShortDate(value?: string | Date | null) {
  return formatDate(value, { month: "short", day: "numeric" });
}
