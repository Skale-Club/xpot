import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ChevronRight, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompactDataTable, type CompactDataColumn } from "@/components/xpot/CompactDataTable";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { INTEGRATION_TONE, Pill } from "@/components/xpot/StatusPill";
import { apiRequest } from "@/lib/queryClient";
import { describeApiError } from "@/lib/apiErrors";
import { useToast } from "@/hooks/use-toast";
import { useT, type Translate } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import { systemHealthMessages } from "@/i18n/messages/systemHealth";
import type { ServiceStatus, ServicesResponse } from "@shared/integrations-registry";
import type { SyncProblem } from "@shared/system-health";
import { REFRESH_MS, useAgo } from "../systemHealthUi";
import { serviceName, STATUS_LABEL_KEYS } from "./ProviderCard";
import { CAUSE_ANCHOR, serviceHref, SERVICES_KEY, SYNC_PROBLEMS_KEY } from "./servicesUi";

// Admin › Status: the Services list (the same one Integrations reads, so the
// two screens agree) and the records that did not reach the CRM, with Retry.

type PlatT = Translate<typeof platformAdminMessages.en>;

export function useServices() {
  return useQuery<ServicesResponse>({ queryKey: [...SERVICES_KEY], refetchInterval: REFRESH_MS, refetchIntervalInBackground: false });
}

export function useSyncProblems() {
  return useQuery<{ problems: SyncProblem[] }>({ queryKey: [...SYNC_PROBLEMS_KEY], refetchInterval: REFRESH_MS, refetchIntervalInBackground: false });
}

export function ServicesSection({ query }: { query: ReturnType<typeof useServices> }) {
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const ago = useAgo(useT(systemHealthMessages));
  const [, navigate] = useLocation();

  const columns: CompactDataColumn<ServiceStatus>[] = [
    {
      key: "service",
      label: tp("colService"),
      render: (s) => (
        <div className="min-w-0">
          <p className="font-medium text-white/90">{serviceName(tp, s.id)}</p>
          <p className="text-xs text-white/40">{tp(`job_${s.job}`)}</p>
          {/* On a phone the error line sits under the name. */}
          {s.lastError && <p className="mt-1 line-clamp-2 break-words text-xs text-red-300 sm:hidden">{s.lastError.message}</p>}
        </div>
      ),
    },
    {
      key: "status",
      label: tp("colStatus"),
      render: (s) => (
        <div className="flex flex-col items-start gap-1">
          <Pill tone={INTEGRATION_TONE[s.status] ?? "slate"} dot>{t(STATUS_LABEL_KEYS[s.status])}</Pill>
          <span className="text-[11px] text-white/40">{tp(`source_${s.source}`)}</span>
        </div>
      ),
    },
    {
      key: "success",
      label: tp("colLastSuccess"),
      headerClassName: "hidden md:table-cell",
      cellClassName: "hidden md:table-cell whitespace-nowrap text-white/60",
      render: (s) => (s.lastSuccessAt ? ago(s.lastSuccessAt) : "—"),
    },
    {
      key: "error",
      label: tp("colLastError"),
      headerClassName: "hidden sm:table-cell",
      cellClassName: "hidden sm:table-cell",
      render: (s) =>
        s.lastError ? (
          <div className="max-w-xs">
            <p className="line-clamp-2 break-words text-xs text-red-300">{s.lastError.message}</p>
            {s.lastError.eventId ? (
              <Link href={`/admin/health/events/${s.lastError.eventId}`} className="text-[11px] text-white/45 underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                {ago(s.lastError.at)}
              </Link>
            ) : (
              <p className="text-[11px] text-white/45">{ago(s.lastError.at)}</p>
            )}
          </div>
        ) : (
          <span className="text-white/35">—</span>
        ),
    },
    {
      key: "open",
      label: <span className="sr-only">{tp("open")}</span>,
      width: 40,
      render: () => <ChevronRight className="h-4 w-4 text-white/30" aria-hidden="true" />,
    },
  ];

  return (
    <div id={CAUSE_ANCHOR.services} className="scroll-mt-24">
      <SectionCard title={tp("servicesTitle")} icon={Plug} accent="account" testId="status-services" bodyClassName="p-0">
        <p className="px-4 pt-3 text-xs text-white/45">{tp("servicesHint")}</p>
        <div className="p-3">
          {query.isLoading ? (
            <ListSkeleton rows={4} rowClassName="h-12 rounded-xl" />
          ) : query.isError || !query.data ? (
            <ErrorState compact message={tp("servicesLoadFailed")} onRetry={() => void query.refetch()} />
          ) : (
            <CompactDataTable
              columns={columns}
              rows={query.data.services}
              getRowKey={(s) => s.id}
              onRowClick={(s) => navigate(serviceHref(s.id))}
              getRowAriaLabel={(s) => `${serviceName(tp, s.id)}: ${t(STATUS_LABEL_KEYS[s.status])}`}
              getRowTestId={(s) => `status-service-${s.id}`}
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function entityLabel(tp: PlatT, type: string) {
  const key = `entity_${type}`;
  return key in platformAdminMessages.en ? tp(key as keyof typeof platformAdminMessages.en) : type;
}

function providerName(tp: PlatT, provider: string) {
  const key = `provider_${provider}`;
  return key in platformAdminMessages.en ? tp(key as keyof typeof platformAdminMessages.en) : provider;
}

export function SyncProblemsSection({ query }: { query: ReturnType<typeof useSyncProblems> }) {
  const tp = useT(platformAdminMessages);
  const ago = useAgo(useT(systemHealthMessages));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<number | null>(null);

  // The Dashboard's own retry: an Xpot admin may send any rep's record (sync.ts checks isManagerOrAdmin).
  const retry = useMutation({
    mutationFn: async (problem: SyncProblem) => {
      setRetrying(problem.id);
      const res = await apiRequest("POST", "/api/xpot/sync/retry", { entityType: problem.entityType, entityId: problem.entityId });
      return res.json() as Promise<{ synced?: boolean; message?: string; results?: unknown }>;
    },
    onSuccess: (result) => {
      if (result.synced) toast({ title: tp("syncRetried"), variant: "success" });
      else toast({ title: tp("syncRetryFailed"), description: result.message ? tp("syncStillFailing", { message: result.message }) : undefined, variant: "destructive" });
    },
    onError: (e: Error) => toast({ title: tp("syncRetryFailed"), description: describeApiError(e), variant: "destructive" }),
    onSettled: () => {
      setRetrying(null);
      void queryClient.invalidateQueries({ queryKey: [...SYNC_PROBLEMS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [...SERVICES_KEY] });
    },
  });

  const problems = query.data?.problems ?? [];
  return (
    <div id={CAUSE_ANCHOR.sync} className="scroll-mt-24">
      <SectionCard
        title={tp("syncTitle")}
        icon={RefreshCw}
        accent="account"
        testId="status-sync"
        actions={problems.length ? <Pill tone="red" bordered>{problems.length}</Pill> : undefined}
      >
        <p className="mb-3 text-xs text-white/45">{tp("syncHint")}</p>
        {query.isLoading ? (
          <ListSkeleton rows={3} rowClassName="h-14 rounded-xl" />
        ) : query.isError ? (
          <ErrorState compact message={tp("syncLoadFailed")} onRetry={() => void query.refetch()} />
        ) : problems.length === 0 ? (
          <EmptyState compact dense icon={RefreshCw} title={tp("syncEmpty")} cardStyle={{}} />
        ) : (
          <ul className="divide-y divide-white/5">
            {problems.map((problem) => (
              <li key={problem.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between" data-testid="status-sync-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={problem.provider === "xphere" ? "blue" : "muted"}>{providerName(tp, problem.provider)}</Pill>
                    <Pill tone={problem.status === "failed" ? "red" : "amber"} bordered>{tp(`syncState_${problem.status}`)}</Pill>
                    <span className="text-xs text-white/45">{entityLabel(tp, problem.entityType)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white/90">
                    {problem.href && problem.entityName ? (
                      <Link href={problem.href} className="underline-offset-2 hover:underline">{problem.entityName}</Link>
                    ) : (
                      problem.entityName ?? <span className="text-white/45">{tp("recordGone")} · #{problem.entityId}</span>
                    )}
                  </p>
                  {problem.lastError && <p className="mt-0.5 break-words text-xs text-red-300">{problem.lastError}</p>}
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {[problem.repName, tp.plural("attempts", problem.attemptCount), problem.at ? ago(problem.at) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {problem.retryable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 self-start"
                    loading={retry.isPending && retrying === problem.id}
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(problem)}
                    data-testid="status-sync-retry"
                  >
                    <RefreshCw />
                    {tp("syncRetry")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
