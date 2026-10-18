import {
  Activity,
  Building2,
  DollarSign,
  MapPinned,
  Route,
  ListTodo,
} from "lucide-react";
import type { GooglePlaceResult, FullSalesLead } from "./types";
import { currentLocale, translate } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { formatDistanceFor } from "./distance";

/** Bottom-nav tabs; `labelKey` is a key of shellMessages. */
export const tabs = [
  { id: "dashboard", labelKey: "tabDashboard", icon: Activity },
  { id: "leads", labelKey: "tabLeads", icon: Building2 },
  { id: "route", labelKey: "tabRoute", icon: Route },
  { id: "tasks", labelKey: "tabTasks", icon: ListTodo },
  { id: "sales", labelKey: "tabSales", icon: DollarSign },
] as const;

export function formatDateTime(value?: string | Date | null) {
  if (!value) return translate(shellMessages, "notSet");
  return new Date(value).toLocaleString(currentLocale());
}

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDuration(seconds?: number | null) {
  if (!seconds) return translate(shellMessages, "durationMinutes", { minutes: 0 });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return translate(shellMessages, "durationMinutes", { minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return translate(shellMessages, "durationHours", { hours, minutes: remainingMinutes });
}

/** A distance or GPS accuracy for people: "85 m", "1.4 km". */
export function formatMeters(meters: number) {
  const value = Math.max(0, Math.round(meters));
  if (value < 1000) return `${value} m`;
  const km = new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: value < 10_000 ? 1 : 0 }).format(value / 1000);
  return `${km} km`;
}

/** A route distance in the reader's units: miles in English, km in Portuguese and Spanish. */
export function formatDistance(meters: number) {
  return formatDistanceFor(meters, currentLocale());
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

// ─── Money (integer cents) ───────────────────────────────────────────────────

export function formatCents(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);
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

export function formatShortDate(value?: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(currentLocale(), { month: "short", day: "numeric" });
}
