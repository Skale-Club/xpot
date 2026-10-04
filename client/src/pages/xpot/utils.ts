import {
  Activity,
  Building2,
  Clock3,
  DollarSign,
  MapPinned,
} from "lucide-react";
import type { GooglePlaceResult, FullSalesLead } from "./types";
import { currentLocale, translate } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";

/** Bottom-nav tabs; `labelKey` is a key of shellMessages. */
export const tabs = [
  { id: "check-in", labelKey: "tabCheckIn", icon: MapPinned },
  { id: "visits", labelKey: "tabVisits", icon: Clock3 },
  { id: "leads", labelKey: "tabLeads", icon: Building2 },
  { id: "sales", labelKey: "tabSales", icon: DollarSign },
  { id: "dashboard", labelKey: "tabDashboard", icon: Activity },
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
