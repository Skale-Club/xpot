import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import {
  TAG_DESTINATION_TYPES,
  TAG_PRODUCT_TYPES,
  TAG_STATUSES,
  type TagDestinationType,
  type TagProductType,
} from "@shared/tags";
import type { TagBatchItem } from "@shared/tagsApi";
import { Loader2 } from "@/components/ui/loader";
import { AdminHttpError, ADMIN_TAGS_KEY, errorMessage, getJson, STALE_MS } from "./api";
import { CARD, INPUT } from "./ui";

// Labels, pickers and small pieces shared by the Overview / Pieces / Team tabs.

export const PRODUCT_LABELS: Record<TagProductType, string> = {
  google_review_sign: "Google Review sign",
  business_card: "NFC card",
  keychain: "NFC keychain",
  safety_tag: "Safety tag",
  menu_tag: "Menu tag",
  booking_tag: "Booking tag",
  custom: "Custom piece",
};

export const DESTINATION_LABELS: Record<TagDestinationType, string> = {
  google_review: "Google review",
  website: "Website",
  booking: "Booking",
  vcard: "Contact card",
  menu: "Menu",
  social: "Social profile",
  custom: "Other",
};

export const NFC_LABELS: Record<string, string> = {
  not_programmed: "Not written",
  programmed: "Written",
  verified: "Verified",
  locked: "Locked",
  failed: "Failed",
};

export const productLabel = (type: string | null | undefined) =>
  type ? PRODUCT_LABELS[type as TagProductType] ?? type : "—";

export const destinationLabel = (type: string | null | undefined) =>
  type ? DESTINATION_LABELS[type as TagDestinationType] ?? type : "—";

export const PRODUCT_OPTIONS = TAG_PRODUCT_TYPES.map((value) => ({ value, label: PRODUCT_LABELS[value] }));
export const DESTINATION_OPTIONS = TAG_DESTINATION_TYPES.map((value) => ({ value, label: DESTINATION_LABELS[value] }));
export const STATUS_OPTIONS = TAG_STATUSES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

export const EVENT_LABELS: Record<string, string> = {
  redirect: "Opened destination",
  inventory_scan: "Scanned while not activated",
  disabled_scan: "Scanned while disabled",
  misconfigured_scan: "Scanned — destination invalid",
};

// ─── Pickers' data ────────────────────────────────────────────────────────────

export interface RepOption {
  id: number;
  displayName: string;
  role: string;
  isActive: boolean;
}

export interface LeadOption {
  id: number;
  name: string;
}

/** Resellers (Xpot reps), for "move to reseller" and the reseller filter. */
export function useReps() {
  return useQuery<RepOption[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "reps"],
    queryFn: async () => {
      const reps = await getJson<RepOption[]>("/api/xpot/admin/reps");
      return reps
        .map((r) => ({ id: r.id, displayName: r.displayName, role: r.role, isActive: r.isActive }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    staleTime: STALE_MS,
  });
}

/** Every lead (managers see all), trimmed to what a picker needs. */
export function useLeads() {
  return useQuery<LeadOption[]>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "leads"],
    queryFn: async () => {
      const leads = await getJson<LeadOption[]>("/api/xpot/leads");
      return leads.map((l) => ({ id: l.id, name: l.name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: STALE_MS,
  });
}

export function useBatchOptions() {
  return useQuery<Array<{ id: string; batchCode: string }>>({
    queryKey: [ADMIN_TAGS_KEY, "pickers", "batches"],
    queryFn: async () => (await getJson<TagBatchItem[]>("/api/xpot/admin/tag-batches")).map((b) => ({ id: b.id, batchCode: b.batchCode })),
    staleTime: STALE_MS,
  });
}

export function repOptionLabel(r: RepOption): string {
  return r.isActive ? r.displayName : `${r.displayName} (off)`;
}

// ─── Small UI ─────────────────────────────────────────────────────────────────

/** Native select in the admin look. The empty choice (placeholder) means "none / no filter". */
export function Select({
  value,
  onChange,
  placeholder,
  options,
  className = "",
  testId,
  disabled,
  allowEmpty = true,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
  testId?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={`${INPUT} ${className}`}
      data-testid={testId}
      disabled={disabled}
    >
      {allowEmpty || !value ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Loading({ className = "py-16" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
    </div>
  );
}

/** Load failure, with the server's reason (e.g. "Manager access required" on a 403). */
export function LoadError({ what, error }: { what: string; error: unknown }) {
  const forbidden = error instanceof AdminHttpError && (error.status === 401 || error.status === 403);
  return (
    <div className={`${CARD} px-6 py-8 text-center text-sm`}>
      <p className="text-red-400">{forbidden ? "You do not have access to this." : `Could not load ${what}.`}</p>
      <p className="mt-1 text-xs text-white/40">{errorMessage(error)}</p>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** Shared "card with a title" block. */
export function Panel({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
