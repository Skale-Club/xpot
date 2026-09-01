import {
  Activity,
  Building2,
  Clock3,
  DollarSign,
  MapPinned,
} from "lucide-react";
import type { GooglePlaceResult, FullSalesLead } from "./types";

export const tabs = [
  { id: "check-in", label: "Check-In", icon: MapPinned },
  { id: "visits", label: "Visits", icon: Clock3 },
  { id: "leads", label: "Leads", icon: Building2 },
  { id: "sales", label: "Sales", icon: DollarSign },
  { id: "dashboard", label: "Dashboard", icon: Activity },
] as const;

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDuration(seconds?: number | null) {
  if (!seconds) return "0m";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
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
  return new Intl.NumberFormat("en-US", {
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
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Days from now (negative = overdue). */
export function daysUntil(value?: string | Date | null): number | null {
  if (!value) return null;
  return Math.round((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
