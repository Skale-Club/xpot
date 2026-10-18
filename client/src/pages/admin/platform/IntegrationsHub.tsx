import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bot, ChevronRight, Map, MessageSquareText, Mic, Plug, Server, Smartphone, Webhook, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { ErrorState } from "@/components/xpot/EmptyState";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { INTEGRATION_TONE, Pill } from "@/components/xpot/StatusPill";
import { GLASS_CLASS } from "@/components/xpot/surface";
import {
  INFRA_SERVICES,
  INTEGRATION_PROVIDERS,
  SERVICES_BY_JOB,
  type ServiceJob,
  type ServiceStatus,
  type ServicesResponse,
} from "@shared/integrations-registry";
import { useT } from "@/i18n";
import { integrationsMessages } from "@/i18n/messages/integrations";
import { platformAdminMessages } from "@/i18n/messages/platformAdmin";
import {
  INTEGRATIONS_KEY,
  Meta,
  ProviderCard,
  serviceName,
  STATUS_LABEL_KEYS,
  useServiceLines,
  variantName,
  type IntegrationsResponse,
} from "./ProviderCard";
import { activeInChain, serviceAnchor, servicesNeedingAttention, SERVICES_KEY } from "./servicesUi";

// Admin › Integrations › Services: one section per job Xpot needs done, not per
// vendor. Each provider card says whether it works with the same words Status
// uses (both read the services list); env-only parts are listed, never edited.

const JOB_ICONS: Record<ServiceJob, LucideIcon> = {
  signIn: Smartphone,
  maps: Map,
  voice: Mic,
  ai: MessageSquareText,
  crm: Webhook,
  assistants: Bot,
  infra: Server,
};

function JobSection({ job, children, testId }: { job: ServiceJob; children: ReactNode; testId?: string }) {
  const tp = useT(platformAdminMessages);
  return (
    <SectionCard title={tp(`job_${job}`)} icon={JOB_ICONS[job]} accent="account" testId={testId ?? `integrations-job-${job}`}>
      <p className="mb-4 text-sm text-white/50">{tp(`jobHint_${job}`)}</p>
      <div className="space-y-4">{children}</div>
    </SectionCard>
  );
}

/** A row for something that is not edited here (env-only, or set up in another tab). */
function SummaryRow({
  service,
  title,
  description,
  statusLabel,
  children,
  action,
}: {
  service: ServiceStatus | undefined;
  title: string;
  description?: string;
  statusLabel: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tone = INTEGRATION_TONE[service?.status ?? "off"] ?? "slate";
  return (
    <div
      id={service ? serviceAnchor(service.id) : undefined}
      className="scroll-mt-24 flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={service ? `service-row-${service.id}` : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-white">{title}</p>
          <Pill tone={tone} dot>{statusLabel}</Pill>
        </div>
        {description && <p className="mt-1 text-xs text-white/50">{description}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function ProviderChain({ job, ids, data, services }: { job: ServiceJob; ids: readonly string[]; data: IntegrationsResponse; services: ServiceStatus[] }) {
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const defs = ids.map((id) => INTEGRATION_PROVIDERS.find((p) => p.provider === id)!).filter(Boolean);
  const active = activeInChain(services, ids);
  const activeDef = defs.find((def) => def.provider === active?.id);
  return (
    <JobSection job={job}>
      <InlineAlert tone={active ? "info" : "warning"} className="-mt-1">
        {tp("chainOrder", { primary: serviceName(tp, defs[0].provider), fallback: serviceName(tp, defs[1].provider) })}{" "}
        {activeDef ? tp("chainActive", { name: serviceName(tp, activeDef.provider) }) : tp("chainNone")}
      </InlineAlert>
      <div className="grid gap-4 xl:grid-cols-2">
        {defs.map((def) => (
          <ProviderCard
            key={def.provider}
            def={def}
            status={data.status.find((s) => s.provider === def.provider)!}
            service={services.find((s) => s.id === def.provider)}
            badges={
              <>
                <Pill tone="slate">{t(def.role === "fallback" ? "roleFallback" : "rolePrimary")}</Pill>
                {active?.id === def.provider && <Pill tone="blue" bordered>{tp("inUseNow")}</Pill>}
              </>
            }
          />
        ))}
      </div>
    </JobSection>
  );
}

export function IntegrationsHub() {
  const t = useT(integrationsMessages);
  const tp = useT(platformAdminMessages);
  const lines = useServiceLines();
  const query = useQuery<IntegrationsResponse>({ queryKey: INTEGRATIONS_KEY });
  const servicesQuery = useQuery<ServicesResponse>({ queryKey: [...SERVICES_KEY] });
  const loaded = Boolean(query.data && servicesQuery.data);

  // Status links to a card with #service-<id>: open it there once the cards exist.
  useEffect(() => {
    if (!loaded) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    const element = document.getElementById(id);
    if (!element) return;
    const legacy = element.closest("details");
    if (legacy) legacy.open = true;
    element.scrollIntoView({ block: "start" });
  }, [loaded]);

  if (query.isLoading || servicesQuery.isLoading) {
    return <ListSkeleton rows={4} rowClassName="h-48 rounded-2xl" className="space-y-4" />;
  }
  if (query.isError || !query.data) {
    return <ErrorState message={t("integrationsLoadFailed")} onRetry={() => void query.refetch()} />;
  }
  if (servicesQuery.isError || !servicesQuery.data) {
    return <ErrorState message={tp("servicesLoadFailed")} onRetry={() => void servicesQuery.refetch()} />;
  }

  const data = query.data;
  const services = servicesQuery.data.services;
  const service = (id: string) => services.find((s) => s.id === id);
  const card = (id: string) => {
    const def = INTEGRATION_PROVIDERS.find((p) => p.provider === id)!;
    return <ProviderCard def={def} status={data.status.find((s) => s.provider === id)!} service={service(id)} />;
  };
  const attention = servicesNeedingAttention(services);
  const routeOptimization = service("route_optimization");
  const xphere = service("xphere");
  const mcp = service("mcp");
  const configuredLabel = (s: ServiceStatus | undefined) => (s?.status === "live" ? tp("configured") : tp("notConfigured"));

  return (
    <div className="space-y-5" data-testid="integrations-hub">
      <div className="flex items-start gap-2 text-sm text-white/55">
        <Plug className="mt-0.5 h-4 w-4 shrink-0" />
        {tp("hubIntro")}
      </div>

      {attention.length > 0 && (
        <div data-testid="integrations-attention">
          <InlineAlert tone="warning">
            {tp.plural("attention", attention.length)}{" "}
            {attention.map((s, index) => (
              <span key={s.id}>
                {index > 0 && ", "}
                <a href={`#${serviceAnchor(s.id)}`} className="font-semibold underline underline-offset-2">{serviceName(tp, s.id)}</a>
              </span>
            ))}
          </InlineAlert>
        </div>
      )}

      <JobSection job="signIn">{card("twilio")}</JobSection>

      <JobSection job="maps">
        {card("google_places")}
        <SummaryRow
          service={routeOptimization}
          title={tp("routeOptimization")}
          description={routeOptimization?.status === "live" ? tp("routeOptimizationOn") : tp("routeOptimizationOff")}
          statusLabel={configuredLabel(routeOptimization)}
        />
      </JobSection>

      <ProviderChain job="voice" ids={SERVICES_BY_JOB.voice} data={data} services={services} />
      <ProviderChain job="ai" ids={SERVICES_BY_JOB.ai} data={data} services={services} />

      <JobSection job="crm">
        <SummaryRow
          service={xphere}
          title={tp("svc_xphere")}
          statusLabel={t(STATUS_LABEL_KEYS[xphere?.status ?? "off"])}
          description={xphere?.count ? tp.plural("xpherePeople", xphere.count) : tp("xphereNobody")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/integrations/xphere">{tp("xphereSetUp")}<ChevronRight /></Link>
            </Button>
          }
        >
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <Meta label={tp("lastSuccess")}>{xphere?.lastSuccessAt ? lines.ago(xphere.lastSuccessAt) : "—"}</Meta>
            {lines.lastError(xphere) && <Meta label={tp("lastError")} tone="bad">{lines.lastError(xphere)}</Meta>}
          </dl>
        </SummaryRow>
        <details className={`group rounded-2xl ${GLASS_CLASS}`} data-testid="integrations-legacy">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white/80">{tp("legacyTitle")}</span>
              <span className="block text-xs text-white/45">{tp("legacyHint")}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Pill tone={INTEGRATION_TONE[service("gohighlevel")?.status ?? "off"] ?? "slate"} dot>
                {t(STATUS_LABEL_KEYS[service("gohighlevel")?.status ?? "off"])}
              </Pill>
              <span className="text-lg font-light text-white/35 transition-transform group-open:rotate-45">+</span>
            </span>
          </summary>
          <div className="border-t border-white/[0.07] p-3">{card("gohighlevel")}</div>
        </details>
      </JobSection>

      <JobSection job="assistants">
        <SummaryRow
          service={mcp}
          title={tp("svc_mcp")}
          statusLabel={t(STATUS_LABEL_KEYS[mcp?.status ?? "off"])}
          description={mcp?.count ? tp.plural("assistants", mcp.count) : tp("assistantsNone")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/integrations/mcp">{tp("assistantsManage")}<ChevronRight /></Link>
            </Button>
          }
        >
          {mcp?.lastSuccessAt && <p className="mt-1 text-xs text-white/45">{tp("lastUsed", { time: lines.ago(mcp.lastSuccessAt) })}</p>}
        </SummaryRow>
      </JobSection>

      <JobSection job="infra">
        <div className="grid gap-3 lg:grid-cols-2">
          {INFRA_SERVICES.map((id) => {
            const row = service(id);
            const error = lines.lastError(row);
            return (
              <SummaryRow
                key={id}
                service={row}
                title={tp(`svc_${id}`)}
                description={tp(`infraDesc_${id}`)}
                statusLabel={row?.variant ? variantName(tp, row.variant) : configuredLabel(row)}
              >
                {error && <p className="mt-1 break-words text-xs text-red-300">{tp("lastError")}: {error}</p>}
              </SummaryRow>
            );
          })}
        </div>
      </JobSection>
    </div>
  );
}
