import { useEffect, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StatusBadge, StatusPicker } from "./VisitStatus";
import type { VisitStatus } from "./VisitStatus";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VoiceRecorder } from "./VoiceRecorder";
import { InlineField } from "./InlineField";
import { formatCents, formatDateTime, formatDuration } from "../utils";
import type { SalesLead, SalesVisitNote } from "../types";
import { ArrowLeft, Building2, CalendarClock, Clock3, DollarSign, ExternalLink, Mic, Sparkles, Trash2 } from "lucide-react";
import { LeadCardBody } from "./LeadCardBody";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { leadsMessages } from "@/i18n/messages/leads";
import { visitsMessages } from "@/i18n/messages/visits";
import { VisitActionsPanel } from "./sales/VisitActions";
import { Link, useLocation } from "wouter";
import { fileSrc } from "@/lib/files";
import { CompanyInlineEditor } from "./leads/CompanyInlineEditor";
import { CheckInFlag, CheckInValidationNotice, type CheckInValidationFields } from "./CheckInValidation";

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
} & CheckInValidationFields;

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
      <h2 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
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
      <span className="mb-3 flex items-center gap-2 text-indigo-300">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</span>
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
    ? new Date(visitAt).toLocaleDateString(t.locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : t("dateNotRecorded");
  const formatTime = (value?: string | Date | null) => value
    ? new Date(value).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" })
    : "—";

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
    <div className="space-y-6" data-testid="visit-summary-page">
      <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("backToHistory")}
            title={t("backToHistory")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {photo ? (
            <img src={fileSrc(photo)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-400/15 bg-indigo-500/[0.08] text-indigo-300">
              <Building2 className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-300/75">{t("visitSummary")}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-[220px] max-w-xl flex-1">
                <InlineField label="" large value={lead?.name || tl("leadNumber", { id: visit.leadId })} onSave={handleLeadNameSave} />
              </div>
              <StatusBadge status={visit.status} />
            </div>
            <p className="mt-1 capitalize text-xs text-white/40">{visitDate}</p>
          </div>
        </div>
        <div className="flex gap-2 pl-12 sm:pl-[7.25rem] lg:pl-0">
          <Link href={`/leads/${visit.leadId}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/10 hover:text-indigo-200">
            {t("openCompany")} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <div className="grid overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] sm:grid-cols-2 xl:grid-cols-4">
        <VisitMetric className="border-b sm:border-r xl:border-b-0" icon={<CalendarClock className="h-3.5 w-3.5" />} label={t("checkIn")} value={formatTime(visit.checkedInAt ?? visit.scheduledAt)} />
        <VisitMetric className="border-b xl:border-b-0 xl:border-r" icon={<CalendarClock className="h-3.5 w-3.5" />} label={t("checkOut")} value={formatTime(visit.checkedOutAt)} />
        <VisitMetric className="border-b sm:border-b-0 sm:border-r" icon={<Clock3 className="h-3.5 w-3.5" />} label={t("duration")} value={formatDuration(visit.durationSeconds)} />
        <VisitMetric icon={<DollarSign className="h-3.5 w-3.5" />} label={t("visitSales")} value={formatCents(visit.visitSales?.totalCents ?? 0)} detail={t("visitSalesCount", { sales: visit.visitSales?.transactions ?? 0, pieces: visit.visitSales?.pieces ?? 0 })} />
      </div>

      <CheckInValidationNotice visit={visit} />

      {visit.status !== "planned" ? (
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 py-4 sm:px-6">
          <VisitOutcomeEditor visit={visit} />
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(400px,0.75fr)] lg:gap-6">
        <main className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 py-6 sm:px-7">
          {(visit.note?.summary || visit.note?.outcome || visit.note?.nextStep) ? (
            <DetailSection title={t("visitSummary")} icon={<Sparkles className="h-3.5 w-3.5 text-indigo-300" />}>
              {visit.note.summary ? <div className="border-l-2 border-indigo-400/45 pl-4 sm:pl-5"><p className="text-[15px] leading-7 text-white/75">{visit.note.summary}</p></div> : null}
              {(visit.note.outcome || visit.note.nextStep) ? (
                <dl className={`${visit.note.summary ? "mt-6" : ""} grid gap-5 sm:grid-cols-2`}>
                  {visit.note.outcome ? <div><dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">{t("outcome")}</dt><dd className="mt-1.5 text-sm leading-6 text-white/65">{visit.note.outcome}</dd></div> : null}
                  {visit.note.nextStep ? <div><dt className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">{t("nextStep")}</dt><dd className="mt-1.5 text-sm leading-6 text-white/65">{visit.note.nextStep}</dd></div> : null}
                </dl>
              ) : null}
            </DetailSection>
          ) : null}

          <DetailSection title={t("voiceNote")} icon={<Mic className="h-3.5 w-3.5 text-indigo-300" />}>
            {!visit.note?.audioUrl ? (
              <div className="mb-5">
                <h3 className="text-base font-semibold text-white/85">{t("recordVisit")}</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-white/40">{t("recordVisitHint")}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-indigo-300/15 bg-indigo-500/[0.055] p-4 sm:p-5">
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

        <aside className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018]">
          <div className="border-b border-white/[0.07] px-5 py-4">
            <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40"><Building2 className="h-3.5 w-3.5 text-indigo-300" />{t("companyDetails")}</h2>
          </div>
          <div className="px-5 py-5">
            {visit.lead ? <CompanyInlineEditor lead={visit.lead} /> : null}
          </div>
        </aside>
      </div>

      <div className="flex justify-end border-t border-white/[0.06] pt-4">
        <button type="button" onClick={onDelete} className="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-red-300/45 transition hover:bg-red-500/[0.07] hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" /> {t("deleteVisit")}
        </button>
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

  async function handleDelete() {
    try {
      await apiRequest("DELETE", `/api/xpot/visits/${visitId}`);
      toast({ title: t("visitDeleted"), variant: "success" });
      onDeleted?.();
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] });
    } catch (err: any) {
      toast({ title: t("deleteFailed"), description: err.message, variant: "destructive" });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-xs rounded-2xl border-0 p-6"
        style={{ background: "#0e1117", boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-white">{t("deleteVisitTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-white/45">
            {t("deleteVisitDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-row gap-2 sm:space-x-0">
          <AlertDialogCancel
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white/60 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="flex-1 rounded-xl border-0 text-sm font-medium text-white"
            style={{ background: "rgba(239,68,68,0.85)" }}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A visit card. Every viewport opens the same dedicated history route.
 */
export function VisitRow({ visit, onOpen }: { visit: VisitLike; onOpen?: () => void }) {
  const [, navigate] = useLocation();
  const tl = useT(leadsMessages);
  const openVisit = onOpen ?? (() => navigate(`/dashboard/history/${visit.id}`));

  return (
    <button
      type="button"
      onClick={openVisit}
      className="w-full rounded-2xl p-4 text-left transition-all"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      }}
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
          <div className="text-[10px] uppercase tracking-wider text-white/25">
            {formatDateTime(visit.checkedInAt ?? visit.scheduledAt)}
          </div>
        }
        right={<span className="flex items-center gap-2"><CheckInFlag visit={visit} /><StatusBadge status={visit.status} /></span>}
      />
    </button>
  );
}

