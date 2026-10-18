import { useQuery } from "@tanstack/react-query";
import { BATCH_STAGE_TONE, BATCH_STATUS_TONE, Pill, toneOf } from "@/components/xpot/StatusPill";
import { Select } from "@/components/xpot/Field";
import type { TagBatchItem, TagListItem } from "@shared/tagsApi";
import { resellerHasTags } from "@shared/tagDistribution";
import { ADMIN_TAGS_KEY, STALE_MS, getJson, withQuery } from "./api";
import { useTagLabels } from "./labels";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";

// Shared bits for the Batches and Kits screens (and their helpers). The pieces table is piece-table.tsx.

// ─── Labels ───────────────────────────────────────────────────────────────────
// Product, face and status names: useTagLabels() in labels.ts.

export function BatchStatusPill({ status }: { status: string }) {
  const labels = useTagLabels();
  return <Pill tone={toneOf(BATCH_STATUS_TONE, status)}>{labels.batchStatus(status)}</Pill>;
}

/** The derived production stage: codes issued → print file → printed → receiving → in stock. */
export function BatchStagePill({ stage }: { stage: string }) {
  const labels = useTagLabels();
  return <Pill tone={toneOf(BATCH_STAGE_TONE, stage)}>{labels.batchStage(stage)}</Pill>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useBatches() {
  return useQuery<TagBatchItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "batches"],
    queryFn: () => getJson("/api/xpot/admin/tag-batches"),
    staleTime: STALE_MS,
  });
}

export interface Reseller {
  id: number;
  displayName: string;
  email: string | null;
  team: string | null;
  role: string;
  isActive: boolean;
  modules: string[] | null;
  costPolicy: "zero" | "acquisition";
  /** Set once an admin chose the cost rule (People); until then the default rule applies. */
  costPolicyConfiguredAt?: string | null;
  blockedAt?: string | null;
  wholesaleCode?: string | null;
}

export interface TagCatalogProduct {
  id: number;
  name: string;
  sku: string | null;
  basePriceCents: number;
  currency: string;
}

export function useTagCatalog() {
  return useQuery<TagCatalogProduct[]>({
    queryKey: [ADMIN_TAGS_KEY, "catalog"],
    queryFn: () => getJson("/api/xpot/tags/catalog"),
    staleTime: STALE_MS,
  });
}

/** Catalog products as picker options ("Name · SKU"). */
export function catalogOptions(catalog: readonly TagCatalogProduct[]) {
  return catalog.map((p) => ({ value: String(p.id), label: p.sku ? `${p.name} · ${p.sku}` : p.name }));
}

/** Can this person see Tags in the field app? Managers/admins always can (shared/tagDistribution.ts). */
export function hasTagsModule(rep: Reseller): boolean {
  return resellerHasTags(rep);
}

export function useResellers() {
  return useQuery<Reseller[]>({
    queryKey: [ADMIN_TAGS_KEY, "resellers"],
    queryFn: () => getJson("/api/xpot/admin/reps"),
    staleTime: STALE_MS,
  });
}

/** Pieces list (`GET /api/xpot/tags`) for a kit, a batch or house stock. */
export function usePieces(params: { kitId?: string; batchId?: string; house?: "1"; limit?: number }, enabled = true) {
  const url = withQuery("/api/xpot/tags", { ...params, limit: params.limit ?? 2000 });
  return useQuery<TagListItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "pieces", url],
    queryFn: () => getJson(url),
    staleTime: STALE_MS,
    enabled,
  });
}

// ─── Small UI ─────────────────────────────────────────────────────────────────

/** The kit Select of active resellers, flagging those without the Tags module. */
export function ResellerSelect({
  value,
  onChange,
  includeAll = false,
  includeInactive = false,
  id,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  includeAll?: boolean;
  includeInactive?: boolean;
  id?: string;
}) {
  const t = useT(manageTagsMessages);
  const { data: reps = [], isLoading } = useResellers();
  const list = reps.filter((r) => includeInactive || r.isActive || r.id === value);
  return (
    <Select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      disabled={isLoading}
      data-testid="admin-tags-reseller-select"
      placeholder={isLoading ? t("loadingOption") : includeAll ? t("allResellers") : t("chooseReseller")}
      options={list.map((r) => ({
        value: String(r.id),
        label: `${r.displayName}${r.team ? ` · ${r.team}` : ""}${!r.isActive ? t("resellerInactive") : !hasTagsModule(r) ? t("resellerNoTags") : ""}`,
      }))}
    />
  );
}
