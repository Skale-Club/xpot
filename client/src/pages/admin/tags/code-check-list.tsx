import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ListChecks, X } from "lucide-react";
import type { DistributionCheck, DistributionCheckItem } from "@shared/tagDistribution";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Pill } from "@/components/xpot/StatusPill";
import { GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { useT } from "@/i18n";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { ADMIN_TAGS_KEY, errorMessage, sendJson } from "./api";
import { reasonKey } from "./distribution-model";
import { useTagLabels } from "./labels";

// The code list Hand out and Take back build: every code with the server's dry-run answer (can it go / come back,
// and why not), newest first, each removable. The dry run moves nothing (POST …/tag-kits/check, …/return/check).

export type CheckKind = "handOut" | "takeBack";

const CHECK_URL: Record<CheckKind, string> = {
  handOut: "/api/xpot/admin/tag-kits/check",
  takeBack: "/api/xpot/admin/tag-kits/return/check",
};

/** The dry run for the current list; refreshed whenever the list changes. */
export function useCodeCheck(kind: CheckKind, codes: readonly string[]) {
  return useQuery<DistributionCheck>({
    queryKey: [ADMIN_TAGS_KEY, "code-check", kind, codes.join(",")],
    queryFn: () => sendJson("POST", CHECK_URL[kind], { codes }),
    enabled: codes.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

/** The check of one code, when the server has answered for it. */
export function checkFor(check: DistributionCheck | undefined, code: string): DistributionCheckItem | undefined {
  return check?.items.find((i) => i.code === code);
}

export function CodeCheckList({
  kind,
  codes,
  check,
  checking,
  error,
  onRemove,
  onRemoveBlocked,
  onClear,
  testId,
}: {
  kind: CheckKind;
  codes: readonly string[];
  check: DistributionCheck | undefined;
  checking: boolean;
  error: unknown;
  onRemove: (code: string) => void;
  onRemoveBlocked: () => void;
  onClear: () => void;
  testId?: string;
}) {
  const t = useT(adminTagsFlowMessages);
  const labels = useTagLabels();
  if (codes.length === 0) {
    return <EmptyState compact dense tone="tags" icon={ListChecks} title={t(kind === "handOut" ? "listEmptyHandOut" : "listEmptyTakeBack")} cardStyle={{}} />;
  }
  const answered = codes.map((code) => checkFor(check, code));
  const ok = answered.filter((a) => a?.ok).length;
  const blocked = answered.filter((a) => a && !a.ok).length;
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-white/70" aria-live="polite">
          <span className="font-semibold text-white">{t.plural("listCount", codes.length)}</span>
          {" · "}
          {t.plural(kind === "handOut" ? "listReady" : "listCanComeBack", ok)}
          {blocked ? <span className="text-amber-300">{` · ${t.plural(kind === "handOut" ? "listBlocked" : "listCannotComeBack", blocked)}`}</span> : null}
          {checking ? <span className="text-white/40">{` · ${t("listChecking")}`}</span> : null}
        </p>
        <span className="flex gap-1">
          {blocked ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemoveBlocked} data-testid="code-list-remove-blocked">
              {t("listRemoveBlocked")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>{t("listClear")}</Button>
        </span>
      </div>
      {error ? <InlineAlert tone="error">{errorMessage(error)}</InlineAlert> : null}
      <ol className={`max-h-[420px] divide-y divide-white/5 overflow-y-auto rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
        {codes.map((code, index) => ({ code, index, item: answered[index] })).reverse().map(({ code, index, item }) => {
          const key = item ? reasonKey(kind, item.reason) : null;
          const where = item?.repName ? [item.repName, item.kitCode].filter(Boolean).join(" · ") : null;
          return (
            <li key={code} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid={`code-row-${code}`}>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-white/30">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-white">{code}</p>
                <p className="truncate text-xs text-white/40">
                  {item?.batchCode ? `${item.batchCode}${item.serialNumber ? ` #${item.serialNumber}` : ""}` : null}
                  {item?.productType ? ` · ${labels.product(item.productType)}` : null}
                  {where ? ` · ${where}` : null}
                </p>
              </div>
              {/* On phones the answer takes its own line under the code, so a long reason never overflows. */}
              <span className="order-last w-full pl-9 sm:order-none sm:w-auto sm:pl-0">
                {!item ? (
                  <Pill tone="muted">{t("listChecking")}</Pill>
                ) : item.ok ? (
                  <Pill tone="violet">{t(kind === "handOut" ? "statusReady" : "statusCanComeBack")}</Pill>
                ) : (
                  <Pill tone={item.reason === "unknown" ? "red" : "amber"} className="!whitespace-normal text-left">
                    {key ? t(key, { name: item.repName ?? "" }) : item.reason}
                  </Pill>
                )}
              </span>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onRemove(code)} aria-label={t("listRemove", { code })}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
