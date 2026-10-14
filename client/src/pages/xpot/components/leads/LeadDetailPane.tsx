import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Building2, DollarSign, ExternalLink, MapPinned, Nfc, PackageCheck, Trash2, UserRoundCheck, UsersRound } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { checkinMessages } from "@/i18n/messages/checkin";
import { buildRouteUrl } from "../LeadCardBody";
import { StatusBadge } from "../VisitStatus";
import { InlineField } from "../InlineField";
import { LeadSalesPanel } from "../sales/LeadSalesPanel";
import { LeadContacts } from "./LeadContacts";
import { CompanyInlineEditor } from "./CompanyInlineEditor";
import { CompanyGoogleProfileButton } from "./CompanyGoogleProfileButton";
import { CompanyTaskButton } from "./CompanyTaskButton";
import type { EnrichedSalesVisit, FullSalesLead } from "../../types";
import { ModuleBadge } from "@/components/xpot/ModuleBadge";
import { fileSrc } from "@/lib/files";
import { formatCents } from "../../utils";

function Section({ title, icon, children, badge }: { title: string; icon?: ReactNode; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.022]">
      <header className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-4">
        {icon ? <span className="text-indigo-300">{icon}</span> : null}
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{title}</h2>
        {badge}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Metric({ icon, label, value, accent = "text-white/90" }: { icon: ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 border-b border-white/[0.06] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-5">
      <span className="mb-3 flex items-center gap-2 text-indigo-300">{icon}<span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</span></span>
      <strong className={`block truncate text-lg font-semibold tabular-nums ${accent}`}>{value}</strong>
    </div>
  );
}

function CompanyStateBadge({ status }: { status: string }) {
  const t = useT(leadsMessages);
  const styles: Record<string, string> = {
    prospect: "border-violet-300/20 bg-violet-400/10 text-violet-200",
    lead: "border-blue-300/20 bg-blue-400/10 text-blue-200",
    active: "border-cyan-300/20 bg-cyan-400/10 text-cyan-200",
    inactive: "border-white/10 bg-white/[0.05] text-white/45",
    customer: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200",
  };
  const labels: Record<string, string> = {
    prospect: t("stateProspect"), lead: t("stateLead"), active: t("stateActive"), inactive: t("stateInactive"), customer: t("stateCustomer"),
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${styles[status] ?? styles.inactive}`}>{labels[status] ?? status}</span>;
}

/** One company profile. Lead/customer are states of this same record. */
export function LeadDetailPane({ lead, pieces, visits, onClose, onDelete, onConvertToCustomer, converting = false }: {
  lead: FullSalesLead;
  pieces?: LeadTagSummary;
  visits: EnrichedSalesVisit[];
  onClose: () => void;
  onDelete: () => void;
  onConvertToCustomer?: () => void;
  converting?: boolean;
}) {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const tCheckin = useT(checkinMessages);
  const location = lead.locations?.[0];
  const photo = lead.photos?.[0];
  const routeUrl = buildRouteUrl(location);
  const address = [location?.addressLine1, location?.city, location?.state].filter(Boolean).join(", ");

  function saveName(name: string) {
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { name: name || undefined })
      .then(() => {
        toast({ title: t("leadUpdated"), variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      })
      .catch((error: Error) => toast({ title: t("leadUpdateFailed"), description: error.message, variant: "destructive" }));
  }

  return (
    <div className="space-y-6" data-testid="lead-detail-pane">
      <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button type="button" onClick={onClose} aria-label={t("backToLeads")} title={t("backToLeads")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft className="h-4 w-4" /></button>
          {photo ? <img src={fileSrc(photo)} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-indigo-400/15 bg-indigo-500/[0.08] text-indigo-300"><Building2 className="h-6 w-6" /></span>}
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/75">{t("companyProfile")}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-[220px] max-w-xl flex-1"><InlineField label="" large value={lead.name} onSave={saveName} /></div>
              <CompanyStateBadge status={lead.status} />
              {lead.ghlContactId ? <span className="rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-300">GHL</span> : null}
            </div>
            {address ? <p className="mt-1 truncate text-xs text-white/40">{address}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <CompanyTaskButton lead={lead} />
              <CompanyGoogleProfileButton lead={lead} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-12 sm:pl-[7.5rem] lg:pl-0">
          {routeUrl ? <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/10 hover:text-indigo-200"><MapPinned className="h-3.5 w-3.5" />{t("directions")}</a> : null}
          {lead.status !== "customer" && onConvertToCustomer ? <button type="button" onClick={onConvertToCustomer} disabled={converting} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.07] px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/[0.12] disabled:opacity-40"><UserRoundCheck className="h-3.5 w-3.5" />{t("promote")}</button> : null}
        </div>
      </header>

      <div className="grid overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4">
        <Metric icon={<DollarSign className="h-3.5 w-3.5" />} label={t("colSold")} value={formatCents(lead.salesLifetimeCents ?? 0)} accent="text-emerald-300" />
        <Metric icon={<PackageCheck className="h-3.5 w-3.5" />} label={t("colShelf")} value={String(lead.unitsOnShelf ?? 0)} />
        <Metric icon={<Nfc className="h-3.5 w-3.5" />} label={t("sectionPieces")} value={String(pieces?.pieces ?? 0)} />
        <Metric icon={<UsersRound className="h-3.5 w-3.5" />} label={t("sectionVisits")} value={String(visits.length)} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Section title={t("sectionDetails")} icon={<Building2 className="h-3.5 w-3.5" />}><CompanyInlineEditor lead={lead} /></Section>
          <Section title={t("sectionContacts")} icon={<UsersRound className="h-3.5 w-3.5" />}><LeadContacts leadId={lead.id} contacts={lead.contacts ?? []} /></Section>
        </div>
        <div className="space-y-6">
          <Section title={t("sectionSales")} icon={<DollarSign className="h-3.5 w-3.5" />}><LeadSalesPanel leadId={lead.id} leadName={lead.name} compact /></Section>
          {pieces && pieces.pieces > 0 ? (
            <Section title={t("sectionPieces")} icon={<Nfc className="h-3.5 w-3.5" />} badge={<ModuleBadge module="tags" />}>
              <Link href={`/tags/pieces?lead=${lead.id}&name=${encodeURIComponent(lead.name)}`} className="flex items-center gap-2 rounded-xl border border-violet-300/10 bg-violet-400/[0.07] px-3 py-3 text-xs font-semibold text-violet-200 transition hover:bg-violet-400/[0.12]">
                <span className="flex-1">{[t.plural("piecesCount", pieces.pieces), t("piecesLive", { n: pieces.live }), t("piecesScans", { n: pieces.scansLast30 })].join(" · ")}</span>{t("openPieces")}<ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Section>
          ) : null}
          <Section title={t("sectionVisits")} icon={<UsersRound className="h-3.5 w-3.5" />}>
            {visits.length === 0 ? <p className="text-xs text-white/35">{t("noVisitsYet")}</p> : (
              <div className="divide-y divide-white/[0.06]">{visits.slice(0, 6).map((visit) => (
                <Link key={visit.id} href={`/dashboard/history/${visit.id}`} className="flex items-center justify-between gap-3 py-3 text-xs first:pt-0 last:pb-0">
                  <span className="text-white/55">{visit.checkedInAt ? new Date(visit.checkedInAt).toLocaleString(tCheckin.locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</span><StatusBadge status={visit.status} />
                </Link>
              ))}</div>
            )}
          </Section>
        </div>
      </div>

      <div className="flex justify-end border-t border-white/[0.06] pt-4">
        <button type="button" onClick={onDelete} className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-red-300/45 transition hover:bg-red-500/[0.07] hover:text-red-300"><Trash2 className="h-3.5 w-3.5" />{t("delete")}</button>
      </div>
    </div>
  );
}
