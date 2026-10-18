import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Inbox, PackageCheck, PackageOpen, PackagePlus, Undo2, Users } from "lucide-react";
import { FilterBar, FilterSelect } from "@/components/xpot/filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { TagKitItem, TagOverview } from "@shared/tagsApi";
import { TAG_MAX_BATCH_QUANTITY } from "@shared/tags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Textarea } from "@/components/xpot/Field";
import { Stat } from "@/components/xpot/Stat";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_CLASS, MODULE_ACCENT } from "@/components/xpot/surface";
import { formatMoney } from "@/lib/format";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { hasTagsModule, useResellers } from "./batches-shared";
import { Loading, LoadError } from "./pieces-shared";
import { GiveKitForm, parseCodes } from "./kits-give-form";
import { KitList, useReturnToHouse } from "./kits-list";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { useToast } from "@/hooks/use-toast";

type AcquisitionInboxItem = {
  acquisition: {
    id: string;
    repId: number;
    source: string;
    externalRef: string | null;
    currency: string;
    status: string;
    purchasedAt: string;
  };
  repName: string | null;
  lines: Array<{
    id: string;
    externalSku: string | null;
    quantity: number;
    subtotalCents: number;
    fulfilledUnits: number;
  }>;
};

function AcquisitionInbox() {
  const t = useT(manageTagsBatchesMessages);
  const { toast } = useToast();
  const [codesById, setCodesById] = useState<Record<string, string>>({});
  const query = useQuery<AcquisitionInboxItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "acquisitions"],
    queryFn: () => getJson("/api/xpot/admin/tag-acquisitions"),
    staleTime: STALE_MS,
  });
  const fulfill = useMutation({
    mutationFn: ({ id, codes }: { id: string; codes: string[] }) =>
      sendJson("POST", `/api/xpot/admin/tag-acquisitions/${id}/fulfill`, { codes }),
    onSuccess: async () => {
      toast({ title: t("acquisitionFulfilled") });
      await invalidateAdminTags();
    },
    onError: (err) => toast({ title: t("acquisitionFulfillFailed"), description: errorMessage(err), variant: "destructive" }),
  });
  const pending = (query.data ?? []).filter((item) => item.acquisition.status === "pending");
  if (query.isLoading) return <Loading rows={2} />;
  if (query.isError) return <LoadError compact what={t("acquisitionsLoadFailed")} error={query.error} onRetry={() => void query.refetch()} />;
  if (!pending.length) return <EmptyState compact dense tone="tags" icon={Inbox} title={t("noPendingAcquisitions")} cardStyle={{}} />;
  return (
    <div className="space-y-3">
      {pending.map((item) => {
        const expected = item.lines.reduce((sum, line) => sum + line.quantity, 0);
        const total = item.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
        const parsed = parseCodes(codesById[item.acquisition.id] ?? "");
        const valid = parsed.invalid.length === 0 && parsed.codes.length === expected;
        return (
          <div key={item.acquisition.id} className={`rounded-2xl ${GLASS_CLASS} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{item.repName ?? `#${item.acquisition.repId}`}</p>
                <p className="mt-0.5 text-xs text-white/40">{item.acquisition.externalRef ?? item.acquisition.source} · {formatMoney(total, item.acquisition.currency)}</p>
              </div>
              <Pill tone="amber">{t.plural("acquisitionPiecesExpected", expected)}</Pill>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.lines.map((line) => <span key={line.id} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-white/55">{line.externalSku ?? t("catalogProduct")} · {line.quantity}</span>)}
            </div>
            <Textarea value={codesById[item.acquisition.id] ?? ""}
              onChange={(event) => setCodesById((current) => ({ ...current, [item.acquisition.id]: event.target.value }))}
              rows={3} className="mt-3 font-mono" placeholder={t("acquisitionCodesPlaceholder")} aria-label={t("acquisitionCodesPlaceholder")} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-xs ${parsed.invalid.length ? "text-red-300" : "text-white/40"}`}>
                {parsed.invalid.length ? t("notACode", { codes: parsed.invalid.slice(0, 6).join(", ") }) : t("acquisitionCodesProgress", { count: parsed.codes.length, expected })}
              </p>
              <Button type="button" variant="brand" accent="tags" disabled={!valid || fulfill.isPending} loading={fulfill.isPending && fulfill.variables?.id === item.acquisition.id}
                onClick={() => fulfill.mutate({ id: item.acquisition.id, codes: parsed.codes })}>
                <PackageCheck className="h-4 w-4" /> {t("fulfillAcquisition")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Return pieces a reseller handed back, by the codes printed on them. */
function ReturnByCodes() {
  const t = useT(manageTagsBatchesMessages);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const parsed = useMemo(() => parseCodes(text), [text]);
  const ret = useReturnToHouse(() => {
    setText("");
    setConfirm(false);
  });
  const valid = parsed.codes.length > 0 && parsed.invalid.length === 0 && parsed.codes.length <= TAG_MAX_BATCH_QUANTITY;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) setConfirm(true);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("returnCodesPlaceholder")}
        aria-label={t("returnCodesPlaceholder")}
        className="font-mono"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/40">
          {parsed.invalid.length > 0 ? (
            <span className="text-red-300">{t("notACode", { codes: parsed.invalid.slice(0, 6).join(", ") })}</span>
          ) : (
            t.plural("returnCodesCount", parsed.codes.length)
          )}
        </p>
        <Button type="submit" variant="secondary" disabled={!valid || ret.isPending}>
          <Undo2 className="h-4 w-4" />
          {t("returnToHouseStock")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t.plural("returnConfirmTitle", parsed.codes.length)}
        description={t("returnByCodesDesc")}
        confirmLabel={t("returnToHouse")}
        busy={ret.isPending}
        onConfirm={() => ret.mutate(parsed.codes)}
      />
    </form>
  );
}

/**
 * Kits: pieces handed from house stock to a reseller (agreed over WhatsApp,
 * recorded here), the kits given so far, and returns back to house stock.
 */
export function KitsTab({ go }: { go: (path: string) => void }) {
  // ?kitRep=12 — the kit list's reseller filter.
  const kitFilters = useUrlFilters({ kitRep: "" });
  const repFilter = /^\d+$/.test(kitFilters.values.kitRep) ? Number(kitFilters.values.kitRep) : null;
  const { data: resellers = [] } = useResellers();
  const t = useT(manageTagsBatchesMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(shellMessages);
  const tt = useT(tagsMessages);

  const stock = useQuery<TagOverview>({
    queryKey: [ADMIN_TAGS_KEY, "kits", "stock"],
    queryFn: () => getJson("/api/xpot/admin/tags/overview"),
    staleTime: STALE_MS,
  });
  const kitsUrl = withQuery("/api/xpot/admin/tag-kits", { repId: repFilter });
  const kits = useQuery<TagKitItem[]>({
    queryKey: [ADMIN_TAGS_KEY, "kits", kitsUrl],
    queryFn: () => getJson(kitsUrl),
    staleTime: STALE_MS,
  });

  const list = kits.data ?? [];
  const totals = list.reduce((acc, k) => ({ pieces: acc.pieces + k.pieceCount, unsold: acc.unsold + k.unsoldCount }), { pieces: 0, unsold: 0 });

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* The number this screen is about, in the Tags accent. */}
        <div className="col-span-2 min-w-0 rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4" data-testid="admin-tags-house-stock">
          <p className={EYEBROW.replace("text-white/40", MODULE_ACCENT.tags.text)}>{t("houseStock")}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{stock.data ? stock.data.stock.house : "—"}</p>
          <p className="mt-0.5 text-xs text-white/45">{t("houseStockCardHint")}</p>
        </div>
        <Stat card label={t("withResellers")} value={stock.data ? stock.data.stock.withResellers : "—"} detail={t("withResellersKitHint")} />
        <Stat
          card
          label={repFilter ? t("thisResellersKits") : t("kitsGiven")}
          value={kits.data ? list.length : "—"}
          detail={kits.data ? `${tt.plural("pieces", totals.pieces)} · ${t.plural("unsoldCount", totals.unsold)}` : undefined}
        />
      </div>
      {stock.isError ? <LoadError compact what={t("houseStock")} error={stock.error} onRetry={() => void stock.refetch()} /> : null}

      <SectionCard accent="tags" icon={Inbox} title={t("stuscleInbox")}>
        <AcquisitionInbox />
      </SectionCard>

      <SectionCard accent="tags" icon={PackagePlus} title={t("giveAKit")}>
        <GiveKitForm />
      </SectionCard>

      <SectionCard accent="tags" icon={PackageOpen} title={ts("manageKits")}>
        <FilterBar
          className="mb-3"
          testId="kits-filters"
          controls={
            <FilterSelect
              value={repFilter ? String(repFilter) : ""}
              onChange={(kitRep) => kitFilters.set({ kitRep })}
              placeholder={tm("allResellers")}
              icon={Users}
              options={resellers.map((r) => ({
                value: String(r.id),
                label: `${r.displayName}${r.team ? ` · ${r.team}` : ""}${!r.isActive ? tm("resellerInactive") : !hasTagsModule(r) ? tm("resellerNoTags") : ""}`,
              }))}
              testId="admin-tags-reseller-select"
            />
          }
          summary={{ shown: list.length, active: repFilter != null, onClear: () => kitFilters.reset() }}
        />
        {kits.isLoading ? (
          <Loading rows={3} />
        ) : kits.isError ? (
          <LoadError what={t("theKits")} error={kits.error} onRetry={() => void kits.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState compact tone="tags" icon={PackageOpen} title={repFilter ? t("noKitsForReseller") : t("noKitsYet")} cardStyle={{}} />
        ) : (
          <KitList kits={list} go={go} />
        )}
      </SectionCard>

      <SectionCard accent="tags" icon={Undo2} title={t("returnByCode")}>
        <ReturnByCodes />
      </SectionCard>
    </div>
  );
}
