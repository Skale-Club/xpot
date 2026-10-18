// Dates follow the app's language, not the browser's. Shared by the admin
// screens (Tags management, System health, Organizations…).

import { currentLocale } from "@/i18n";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(currentLocale(), { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(currentLocale(), { timeStyle: "short" });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(currentLocale(), { dateStyle: "medium" });
}
