import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { BackLink } from "@/components/xpot/PageHeader";
import { EYEBROW, GLASS_CLASS, GLASS_SUBTLE_CLASS } from "@/components/xpot/surface";
import { formatDate, formatTime } from "@/lib/format";
import { VisitNoteMarks } from "./VisitsTable";
import { LocationExceptionBadge, StatusBadge, StatusPicker } from "./VisitStatus";
import type { VisitStatus } from "./VisitStatus";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VoiceRecorder } from "./VoiceRecorder";
import { InlineField } from "./InlineField";
import { formatCents, formatDuration, formatVisitWhen } from "../utils";
import type { SalesLead, SalesVisitNote } from "../types";
import { Building2, CalendarClock, Clock3, DollarSign, ExternalLink, Mic, Sparkles, Trash2 } from "lucide-react";
import { LeadCardBody } from "./LeadCardBody";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { VisitActionsPanel } from "./sales/VisitActions";
import { Link, useLocation } from "wouter";
import { fileSrc } from "@/lib/files";
import { CompanyInlineEditor } from "./leads/CompanyInlineEditor";

export type VisitLike = {
  id: number;
  leadId: number;
  lead?: SalesLead & { locations?: any[] };
  status: string;
  scheduledAt?: string | Date | null;
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  durationSeconds?: number | null;
  note?: SalesVisitNote | null;
  visitSales?: { transactions: number; pieces: number; totalCents: number };
};

function VisitOutcomeEditor({ visit }: { visit: VisitLike }) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const [status, setStatus] = useState(visit.status);

  useEffect(() => setStatus(visit.status), [visit.status]);

  async function handleStatusChange(newStatus: VisitStatus) {
    setStatus(newStatus);
    try {
      await apiRequest("PATCH", `/api/xpot/visits/${visit.id}`, { status: newStatus });
      toast({ title: t("statusUpdated"), variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      setStatus(visit.status);
      toast({ title: t("statusUpdateFailed"), description: err.message, variant: "destructive" });
    }
  }

  if (status === "planned") return null;
  return <StatusPicker value={status} onChange={handleStatusChange} layout="wide" />;
}
function DetailSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.07] py-6 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className={`mb-4 flex items-center gap-2 ${EYEBROW}`}>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
function VisitMetric({ icon, label, value, detail, className = "" }: { icon: ReactNode; label: string; value: string; detail?: string; className?: string }) {
  return (
    <div className={`min-w-0 border-white/[0.06] px-4 py-4 sm:px-5 ${className}`}>
      <span className="mb-3 flex items-center gap-2 text-white/40">
        {icon}
        <span className={EYEBROW}>{label}</span>
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-base font-semibold text-white/90">{value}</strong>
        {detail ? <span className="mt-0.5 block truncate text-[11px] text-white/35">{detail}</span> : null}
      </span>
    </div>
  );
}

/** A visit's dedicated history page with its editable record kept in context. */
export function VisitSummaryPage({ visit, onBack, onDelete }: { visit: VisitLike; onBack: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tl = useT(leadsMessages);
  const lead = visit.lead as (SalesLead & { locations?: { addressLine1?: string | null; city?: string | null; state?: string | null }[]; photos?: string[] | null }) | undefined;
  const photo = lead?.photos?.[0];
  const visitAt = visit.checkedInAt ?? visit.scheduledAt;
  const visitDate = visitAt
    ? formatDate(visitAt, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : t("dateNotRecorded");

  function handleLeadNameSave(name: string) {
    if (!lead) return;
    apiRequest("PATCH", `/api/xpot/leads/${lead.id}`, { name: name || undefined })
      .then(() => {
        toast({ title: t("saved"), variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
      })
      .catch((err: Error) => toast({ title: t("saveFailed"), description: err.message, variant: "destructive" }));
  }

  async function handleSummaryAudioUpload({ audioBlob, durationSeconds }: { audioBlob: Blob; durationSeconds: number }) {
    if (audioBlob.size > 3 * 1024 * 1024) {
      toast({ title: t("recordingTooLarge"), description: t("recordingTooLargeDesc"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    const audioData = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(audioBlob);
    });
    const response = await apiRequest("POST", `/api/xpot/visits/${visit.id}/audio`, { audioData, durationSeconds });
    const result = await response.json() as { readyToAnalyze: boolean };
    let detected = 0;
    if (result.readyToAnalyze) {
      try {
        const analyzed = await apiRequest("POST", `/api/xpot/visits/${visit.id}/analyze`, {});
        detected = ((await analyzed.json()) as { actions?: unknown[] }).actions?.length ?? 0;
      } catch {
        // The recording is saved even when analysis needs to be retried later.
      }
    }
    toast({
      variant: "success",
      title: detected > 0 ? t.plural("actionsDetected", detected) : t("audioSaved"),
      description: detected > 0 ? t("actionsReviewBelow") : undefined,
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits", visit.id, "actions"] }),
    ]);
  }

  return (
    <div className="min-w-0 space-y-6" data-testid="visit-summary-page">
      <BackLink onBack={onBack}>{t("backToHistory")}</BackLink>
      <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          {photo ? (
            <img src={fileSrc(photo)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/40">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={`mb-1 ${EYEBROW}`}>{t("visitSummary")}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 max-w-xl flex-1 basis-48">
                <InlineField label="" large value={lead?.name || tl("leadNumber", { id: visit.leadId })} onSave={handleLeadNameSave} />
              </div>
              <StatusBadge status={visit.status} />
              <LocationExceptionBadge visit={visit} />
            </div>
            <p className="mt-1 capitalize text-xs text-white/40">{visitDate}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/leads/${visit.leadId}`}>
              {t("openCompany")} <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className={`grid overflow-hidden rounded-2xl sm:grid-cols-2 xl:grid-cols-4 ${GLASS_SUBTLE_CLASS}`}>
        <VisitMetric className="border-b sm:border-r xl:border-b-0" icon={<CalendarClock className="h-3.5 w-3.5" />} label={t("checkIn")} value={formatTime(visit.checkedInAt ?? visit.scheduledAt)} />
        <VisitMetric className="border-b xl:border-b-0 xl:border-r" icon={<CalendarClock className="h-3.5 w-3.5" />} label={t("checkOut")} value={formatTime(visit.checkedOutAt)} />
        <VisitMetric className="border-b sm:border-b-0 sm:border-r" icon={<Clock3 className="h-3.5 w-3.5" />} label={t("duration")} value={formatDuration(visit.durationSeconds)} />
        <VisitMetric icon={<DollarSign className="h-3.5 w-3.5" />} label={t("visitSales")} value={formatCents(visit.visitSales?.totalCents ?? 0)} detail={t("visitSalesCount", { sales: visit.visitSales?.transactions ?? 0, pieces: visit.visitSales?.pieces ?? 0 })} />
      </div>

      {visit.status !== "planned" ? (
        <section className={`rounded-2xl px-4 py-4 sm:px-6 ${GLASS_SUBTLE_CLASS}`}>
          <VisitOutcomeEditor visit={visit} />
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(400px,0.75fr)] lg:gap-6">
        <main className={`min-w-0 rounded-2xl px-4 py-6 sm:px-7 ${GLASS_SUBTLE_CLASS}`}>
          {(visit.note?.summary || visit.note?.outcome || visit.note?.nextStep) ? (
            <DetailSection title={t("visitSummary")} icon={<Sparkles className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />}>
              {visit.note.summary ? <div className="border-l-2 border-blue-400/45 pl-4 sm:pl-5"><p className="text-[15px] leading-7 text-white/75">{visit.note.summary}</p></div> : null}
              {(visit.note.outcome || visit.note.nextStep) ? (
                <dl className={`${visit.note.summary ? "mt-6" : ""} grid gap-5 sm:grid-cols-2`}>
                  {visit.note.outcome ? <div><dt className={EYEBROW}>{t("outcome")}</dt><dd className="mt-1.5 text-sm leading-6 text-white/65">{visit.note.outcome}</dd></div> : null}
                  {visit.note.nextStep ? <div><dt className={EYEBROW}>{t("nextStep")}</dt><dd className="mt-1.5 text-sm leading-6 text-white/65">{visit.note.nextStep}</dd></div> : null}
                </dl>
              ) : null}
            </DetailSection>
          ) : null}

          <DetailSection title={t("voiceNote")} icon={<Mic className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />}>
            {!visit.note?.audioUrl ? (
              <div className="mb-5">
                <h3 className="text-base font-semibold text-white/85">{t("recordVisit")}</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-white/40">{t("recordVisitHint")}</p>
              </div>
            ) : null}
            <div className={`rounded-2xl p-4 sm:p-5 ${GLASS_CLASS}`}>
              <VoiceRecorder
                onUpload={handleSummaryAudioUpload}
                existingAudio={fileSrc(visit.note?.audioUrl)}
                existingDuration={visit.note?.audioDurationSeconds}
                existingTranscription={visit.note?.audioTranscription}
              />
            </div>
          </DetailSection>

          <VisitActionsPanel visitId={visit.id} surface="plain" />
        </main>

        <aside className={`min-w-0 overflow-hidden rounded-2xl ${GLASS_SUBTLE_CLASS}`}>
          <div className="border-b border-white/[0.07] px-4 py-4 sm:px-5">
            <h2 className={`flex items-center gap-2 ${EYEBROW}`}><Building2 className="h-3.5 w-3.5" aria-hidden="true" />{t("companyDetails")}</h2>
          </div>
          <div className="px-4 py-5 sm:px-5">
            {visit.lead ? <CompanyInlineEditor lead={visit.lead} /> : null}
          </div>
        </aside>
      </div>

      <div className="flex justify-end border-t border-white/[0.06] pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-red-300/70 hover:bg-red-500/[0.08] hover:text-red-300">
          <Trash2 aria-hidden="true" /> {t("deleteVisit")}
        </Button>
      </div>

    </div>
  );
}

/** Confirms and deletes a visit. */
export function VisitDeleteConfirm({ visitId, open, onOpenChange, onDeleted }: {
  visitId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { toast } = useToast();
  const t = useT(visitsMessages);
  const tc = useT(commonMessages);

  // Stays open with the loader until the server answers; a failure keeps it open.
  async function handleDelete() {
    try {
      await apiRequest("DELETE", `/api/xpot/visits/${visitId}`);
    } catch (err: any) {
      toast({ title: t("deleteFailed"), description: err.message, variant: "destructive" });
      throw err;
    }
    toast({ title: t("visitDeleted"), variant: "success" });
    onDeleted?.();
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
    queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={t("deleteVisitTitle")}
      description={t("deleteVisitDesc")}
      confirmLabel={t("delete")}
      cancelLabel={tc("cancel")}
      onConfirm={handleDelete}
    />
  );
}

/**
 * A visit card. Every viewport opens the same dedicated history route.
 */
export function VisitRow({ visit, onOpen }: { visit: VisitLike; onOpen?: () => void }) {
  const [, navigate] = useLocation();
  const tl = useT(leadsMessages);
  const openVisit = onOpen ?? (() => navigate(`/dashboard/history/${visit.id}`));
  const when = formatVisitWhen(visit);

  return (
    <button
      type="button"
      onClick={openVisit}
      className={`w-full rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.06] ${GLASS_CLASS}`}
    >
      <LeadCardBody
        lead={{
          name: visit.lead?.name || tl("leadNumber", { id: visit.leadId }),
          phone: visit.lead?.phone,
          website: visit.lead?.website,
          industry: visit.lead?.industry,
          ghlContactId: (visit.lead as any)?.ghlContactId,
          photos: (visit.lead as any)?.photos,
          locations: visit.lead?.locations,
        }}
        subtitle={
          <div className="text-[11px] tabular-nums text-white/40">
            {when ? `${when.date} · ${when.time}` : "—"}
          </div>
        }
        right={<div className="flex flex-col items-end gap-1"><StatusBadge status={visit.status} /><LocationExceptionBadge visit={visit} /><VisitNoteMarks visit={visit} /></div>}
      />
    </button>
  );
}

