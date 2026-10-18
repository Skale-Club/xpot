import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Building2, CalendarDays, Camera, DollarSign, Navigation, Nfc, PackageCheck, Trash2, UserRoundCheck, UsersRound } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { visitsUiMessages } from "@/i18n/messages/visitsUi";
import { Button } from "@/components/ui/button";
import { DotsLoader } from "@/components/ui/spinner";
import { SectionCard } from "@/components/xpot/DashboardKit";
import { EmptyState } from "@/components/xpot/EmptyState";
import { BackLink } from "@/components/xpot/PageHeader";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { buildRouteUrl } from "../LeadCardBody";
import { StatusBadge } from "../VisitStatus";
import { InlineField } from "../InlineField";
import { LeadSalesPanel } from "../sales/LeadSalesPanel";
import { LeadContacts } from "./LeadContacts";
import { CompanyInlineEditor } from "./CompanyInlineEditor";
import { CompanyGoogleProfileButton } from "./CompanyGoogleProfileButton";
import { LeadPiecesPanel } from "./LeadPiecesPanel";
import { CompanyTaskButton } from "./CompanyTaskButton";
import type { EnrichedSalesVisit, FullSalesLead } from "../../types";
import { ModuleBadge } from "@/components/xpot/ModuleBadge";
import { fileSrc } from "@/lib/files";
import { formatCents, formatVisitWhen } from "../../utils";
import { useLeadSalesSnapshot } from "../../hooks/useSalesModule";
import { LeadStatePill } from "./LeadStatePill";

function Metric({ icon, label, value, accent = "text-white/90" }: { icon: ReactNode; label: string; value: string; accent?: string }) {
  return (
    // Two by two on a phone (four stacked rows pushed the details a screen down), one row from sm.
    <div className="min-w-0 border-white/[0.06] px-4 py-4 max-sm:odd:border-r max-sm:[&:nth-child(-n+2)]:border-b sm:border-r sm:px-5 sm:last:border-r-0">
      <span className="mb-3 flex items-center gap-2 text-white/40">{icon}<span className={EYEBROW}>{label}</span></span>
      <strong className={`block truncate text-lg font-semibold tabular-nums ${accent}`}>{value}</strong>
    </div>
  );
}

function CompanyCoverPhoto({ lead }: { lead: FullSalesLead }) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tu = useT(visitsUiMessages);
  const inputRef = useRef<HTMLInputElement>(null);
  const storedPhoto = lead.photos?.[0] ?? null;
  const [preview, setPreview] = useState<string | undefined>(() => fileSrc(storedPhoto));
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPreview(fileSrc(storedPhoto));
  }, [lead.id, storedPhoto]);

  async function upload(file: File) {
    const previous = preview;
    setUploading(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error(tu("photoReadFailed")));
        reader.readAsDataURL(file);
      });
      setPreview(imageData);
      const response = await apiRequest("POST", `/api/xpot/leads/${lead.id}/photos`, { imageData });
      const result = await response.json() as { photo: string };
      setPreview(fileSrc(result.photo));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
      ]);
      toast({ title: t("photoAdded"), variant: "success" });
    } catch (error) {
      setPreview(previous);
      toast({ title: t("photoUploadFailed"), description: (error as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={t("addPhoto")}
        title={t("addPhoto")}
        className="group relative h-20 w-20 shrink-0 self-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-white/40 shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-[transform,border-color,box-shadow] hover:border-white/20 hover:shadow-[0_14px_36px_rgba(0,0,0,0.32)] active:scale-[0.96] disabled:cursor-wait disabled:opacity-70 sm:h-[116px] sm:w-[116px]"
        data-testid="company-cover-upload"
      >
        {preview ? (
          <img src={preview} alt={t("coverAlt")} className="h-full w-full object-cover ring-1 ring-inset ring-white/10" />
        ) : (
          <span className="flex h-full w-full items-center justify-center"><Building2 className="h-7 w-7" /></span>
        )}
        <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/85 shadow-[0_4px_12px_rgba(0,0,0,0.35)] ring-1 ring-white/15 transition-transform group-hover:scale-105 group-focus-visible:scale-105">
          {uploading ? <DotsLoader size="xs" tone="light" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
        </span>
      </button>
    </>
  );
}

/** One company profile. Lead/customer are states of this same record. */
export function LeadDetailPane({ lead, pieces, visits, onClose, backLabel, onDelete, onConvertToCustomer, converting = false }: {
  lead: FullSalesLead;
  pieces?: LeadTagSummary;
  visits: EnrichedSalesVisit[];
  onClose: () => void;
  /** The back link's text when it does not go to the companies list (opened from the Route, a task, a visit). */
  backLabel?: string;
  onDelete: () => void;
  onConvertToCustomer?: () => void;
  converting?: boolean;
}) {
  const { toast } = useToast();
  const t = useT(leadsMessages);
  const location = lead.locations?.[0];
  const routeUrl = buildRouteUrl(location);
  const address = [location?.addressLine1, location?.city, location?.state].filter(Boolean).join(", ");
  // The tiles read the same snapshot as the "Sales and stock" card below (one
  // cached query). They used the list's per-lead totals, which the company
  // page never has: /leads/:id loads the lead alone, so they always said $0.00 / 0.
  const salesSnapshot = useLeadSalesSnapshot(lead.id).data;
  const soldCents = salesSnapshot?.lifetimeCents ?? lead.salesLifetimeCents;
  const unitsOnShelf = salesSnapshot
    ? salesSnapshot.activeConsignments.reduce((sum, row) => sum + row.consignment.quantityOnHand, 0)
    : lead.unitsOnShelf;

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
    <div className="min-w-0 space-y-6" data-testid="lead-detail-pane">
      <BackLink onBack={onClose}>{backLabel ?? t("backToLeads")}</BackLink>
      <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <CompanyCoverPhoto lead={lead} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex min-h-5 flex-wrap items-center gap-2">
              <p className={EYEBROW}>{t("companyProfile")}</p>
              <LeadStatePill status={lead.status} />
              {lead.ghlContactId ? <Pill tone="slate">GHL</Pill> : null}
            </div>
            <div className="min-w-0 max-w-xl"><InlineField label="" large value={lead.name} onSave={saveName} /></div>
            {address ? <p className="mt-1 truncate text-xs text-white/40">{address}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <CompanyTaskButton lead={lead} />
              <CompanyGoogleProfileButton lead={lead} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:pl-0">
          {routeUrl ? (
            <Button asChild variant="secondary">
              <a href={routeUrl} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" />{t("directions")}</a>
            </Button>
          ) : null}
          {lead.status !== "customer" && onConvertToCustomer ? (
            <Button type="button" variant="secondary" onClick={onConvertToCustomer} loading={converting}>
              <UserRoundCheck aria-hidden="true" />{t("promote")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className={`grid grid-cols-2 overflow-hidden rounded-2xl sm:grid-cols-4 ${GLASS_SUBTLE_CLASS}`}>
        <Metric icon={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />} label={t("colSold")} value={soldCents == null ? "—" : formatCents(soldCents)} accent="text-emerald-300" />
        <Metric icon={<PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />} label={t("colShelf")} value={unitsOnShelf == null ? "—" : String(unitsOnShelf)} />
        <Metric icon={<Nfc className="h-3.5 w-3.5" aria-hidden="true" />} label={t("sectionPieces")} value={String(pieces?.pieces ?? 0)} />
        <Metric icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />} label={t("sectionVisits")} value={String(visits.length)} />
      </div>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-6">
          <SectionCard title={t("sectionDetails")} icon={Building2} bodyClassName="p-4 sm:p-5"><CompanyInlineEditor lead={lead} /></SectionCard>
          <SectionCard title={t("sectionContacts")} icon={UsersRound} bodyClassName="p-4 sm:p-5"><LeadContacts leadId={lead.id} contacts={lead.contacts ?? []} /></SectionCard>
        </div>
        <div className="min-w-0 space-y-6">
          <SectionCard title={t("sectionSales")} icon={DollarSign} bodyClassName="p-4 sm:p-5"><LeadSalesPanel leadId={lead.id} leadName={lead.name} compact /></SectionCard>
          {pieces && pieces.pieces > 0 ? (
            <SectionCard title={<span className="flex items-center gap-2">{t("sectionPieces")}<ModuleBadge module="tags" /></span>} icon={Nfc} bodyClassName="p-4 sm:p-5">
              <LeadPiecesPanel leadId={lead.id} leadName={lead.name} summary={pieces} />
            </SectionCard>
          ) : null}
          <SectionCard title={t("sectionVisits")} icon={CalendarDays} bodyClassName={visits.length ? "px-4 py-2 sm:px-5" : "p-4 sm:p-5"}>
            {visits.length === 0 ? <EmptyState compact dense icon={CalendarDays} title={t("noVisitsYet")} /> : (
              <div className="divide-y divide-white/[0.06]">{visits.slice(0, 6).map((visit) => {
                const when = formatVisitWhen(visit);
                return (
                  <Link key={visit.id} href={`/dashboard/history/${visit.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-xs">
                    <span className="tabular-nums text-white/55">{when ? `${when.date} · ${when.time}` : "—"}</span><StatusBadge status={visit.status} />
                  </Link>
                );
              })}</div>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="flex justify-end border-t border-white/[0.06] pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-red-300/70 hover:bg-red-500/[0.08] hover:text-red-300"><Trash2 aria-hidden="true" />{t("delete")}</Button>
      </div>
    </div>
  );
}
