import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PackageCheck, Undo2 } from "lucide-react";
import type { TagKitItem, TagOverview } from "@shared/tagsApi";
import { TAG_MAX_BATCH_QUANTITY } from "@shared/tags";
import { ADMIN_TAGS_KEY, STALE_MS, errorMessage, getJson, invalidateAdminTags, sendJson, withQuery } from "./api";
import { BTN_GHOST, CARD, Empty, INPUT, SectionTitle, Stat } from "./ui";
import { ConfirmDialog, ErrorLine, Loading, ResellerSelect } from "./batches-shared";
import { GiveKitForm, parseCodes } from "./kits-give-form";
import { KitList, useReturnToHouse } from "./kits-list";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { tagsMessages } from "@/i18n/messages/tags";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { useToast } from "@/hooks/use-toast";
import { formatCents } from "@/pages/xpot/utils";

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
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorLine>{t("acquisitionsLoadFailed")}</ErrorLine>;
  if (!pending.length) return <Empty>{t("noPendingAcquisitions")}</Empty>;
  return (
    <div className="space-y-3">
      {pending.map((item) => {
        const expected = item.lines.reduce((sum, line) => sum + line.quantity, 0);
        const total = item.lines.reduce((sum, line) => sum + line.subtotalCents, 0);
        const parsed = parseCodes(codesById[item.acquisition.id] ?? "");
        const valid = parsed.invalid.length === 0 && parsed.codes.length === expected;
        return (
          <div key={item.acquisition.id} className={`${CARD} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{item.repName ?? `#${item.acquisition.repId}`}</p>
                <p className="mt-0.5 text-xs text-white/40">{item.acquisition.externalRef ?? item.acquisition.source} · {formatCents(total, item.acquisition.currency)}</p>
              </div>
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">{t.plural("acquisitionPiecesExpected", expected)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.lines.map((line) => <span key={line.id} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-white/55">{line.externalSku ?? t("catalogProduct")} · {line.quantity}</span>)}
            </div>
            <textarea value={codesById[item.acquisition.id] ?? ""}
              onChange={(event) => setCodesById((current) => ({ ...current, [item.acquisition.id]: event.target.value }))}
              rows={3} className={`${INPUT} mt-3 resize-y font-mono`} placeholder={t("acquisitionCodesPlaceholder")} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-xs ${parsed.invalid.length ? "text-red-300" : "text-white/40"}`}>
                {parsed.invalid.length ? t("notACode", { codes: parsed.invalid.slice(0, 6).join(", ") }) : t("acquisitionCodesProgress", { count: parsed.codes.length, expected })}
              </p>
              <button type="button" className={BTN_GHOST} disabled={!valid || fulfill.isPending}
                onClick={() => fulfill.mutate({ id: item.acquisition.id, codes: parsed.codes })}>
                <PackageCheck className="h-4 w-4" /> {t("fulfillAcquisition")}
              </button>
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
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("returnCodesPlaceholder")}
        className={`${INPUT} resize-y font-mono`}
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
        <button type="submit" className={BTN_GHOST} disabled={!valid || ret.isPending}>
          <Undo2 className="h-4 w-4" />
          {t("returnToHouseStock")}
        </button>
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
  const [repFilter, setRepFilter] = useState<number | null>(null);
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`${CARD} col-span-2 border-blue-500/30 bg-blue-500/[0.06] p-4`} data-testid="admin-tags-house-stock">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/80">{t("houseStock")}</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-white">{stock.data ? stock.data.stock.house : "—"}</p>
          <p className="mt-0.5 text-xs text-white/45">{t("houseStockCardHint")}</p>
        </div>
        <Stat label={t("withResellers")} value={stock.data ? stock.data.stock.withResellers : "—"} hint={t("withResellersKitHint")} />
        <Stat
          label={repFilter ? t("thisResellersKits") : t("kitsGiven")}
          value={kits.data ? list.length : "—"}
          hint={kits.data ? `${tt.plural("pieces", totals.pieces)} · ${t.plural("unsoldCount", totals.unsold)}` : undefined}
        />
      </div>

      <section>
        <SectionTitle>{t("stuscleInbox")}</SectionTitle>
        <AcquisitionInbox />
      </section>

      <section>
        <SectionTitle>{t("giveAKit")}</SectionTitle>
        <div className={`${CARD} p-4`}>
          <GiveKitForm />
        </div>
      </section>

      <section>
        <SectionTitle
          right={
            <div className="w-56">
              <ResellerSelect value={repFilter} onChange={setRepFilter} includeAll includeInactive />
            </div>
          }
        >
          {ts("manageKits")}
        </SectionTitle>
        {kits.isLoading ? (
          <Loading />
        ) : kits.isError ? (
          <ErrorLine>{tm("couldNotLoad", { what: t("theKits") })}</ErrorLine>
        ) : list.length === 0 ? (
          <Empty>{repFilter ? t("noKitsForReseller") : t("noKitsYet")}</Empty>
        ) : (
          <KitList kits={list} go={go} />
        )}
      </section>

      <section>
        <SectionTitle>{t("returnByCode")}</SectionTitle>
        <div className={`${CARD} p-4`}>
          <ReturnByCodes />
        </div>
      </section>
    </div>
  );
}
