import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Building2, Globe, Loader2, Mail, MapPinned, Nfc, Pencil, Phone, Send, Tag, Trash2, UserCheck, X } from "lucide-react";
import type { LeadTagSummary } from "@shared/tagsApi";
import { useT } from "@/i18n";
import { leadsMessages } from "@/i18n/messages/leads";
import { checkinMessages } from "@/i18n/messages/checkin";
import { EditLeadForm } from "../EditLeadDialog";
import { buildRouteUrl } from "../LeadCardBody";
import { StatusBadge } from "../VisitStatus";
import { LeadSalesPanel } from "../sales/LeadSalesPanel";
import { LeadContacts } from "./LeadContacts";
import type { EnrichedSalesVisit, FullSalesLead } from "../../types";
import { ModuleBadge } from "@/components/xpot/ModuleBadge";

function Section({ title, children, badge }: { title: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-white/[0.06] px-5 py-4">
      <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  );
}

function IconButton({ title, onClick, children, tone = "neutral", disabled }: {
  title: string; onClick: () => void; children: ReactNode; tone?: "neutral" | "danger" | "purple" | "emerald"; disabled?: boolean;
}) {
  const hover = {
    neutral: "hover:bg-white/10 hover:text-white",
    danger: "hover:bg-red-500/15 hover:text-red-400",
    purple: "hover:bg-purple-500/15 hover:text-purple-300",
    emerald: "hover:bg-emerald-500/15 hover:text-emerald-300",
  }[tone];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white/60 transition-colors disabled:opacity-40 ${hover}`}
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {children}
    </button>
  );
}

/** Everything about one company, beside the list on desktop. */
export function LeadDetailPane({
  lead,
  isProspect,
  pieces,
  visits,
  onClose,
  onDelete,
  onPromote,
  onSyncGhl,
  isSyncing,
}: {
  lead: FullSalesLead;
  isProspect: boolean;
  pieces?: LeadTagSummary;
  visits: EnrichedSalesVisit[];
  onClose: () => void;
  onDelete: () => void;
  onPromote: () => void;
  onSyncGhl: () => void;
  isSyncing: boolean;
}) {
  const t = useT(leadsMessages);
  const tCheckin = useT(checkinMessages);
  const [editing, setEditing] = useState(false);
  const loc = lead.locations?.[0];
  const photo = lead.photos?.[0];
  const routeUrl = buildRouteUrl(loc);
  const address = [loc?.addressLine1, loc?.city, loc?.state].filter(Boolean).join(", ");
  const socials = (lead.socialUrls ?? []).filter((s) => s.url);

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
      data-testid="lead-detail-pane"
    >
      {/* Header */}
      <div className="flex items-start gap-4 p-5">
        {photo ? (
          <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
            <Building2 className="h-8 w-8 text-indigo-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-tight text-white">{lead.name}</h2>
            {isProspect && (
              <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                {t("prospectBadge")}
              </span>
            )}
            {lead.ghlContactId && (
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400" style={{ background: "rgba(16,185,129,0.12)" }}>
                GHL
              </span>
            )}
          </div>
          {address && <p className="mt-1 text-xs text-white/45">{address}</p>}
          {routeUrl && (
            <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300">
              <MapPinned className="h-3.5 w-3.5" /> {t("directions")}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closePane")}
          title={t("closePane")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/35 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          <IconButton title={t("edit")} onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> {t("edit")}
          </IconButton>
          {isProspect && (
            <IconButton title={t("promote")} onClick={onPromote} tone="purple">
              <UserCheck className="h-3.5 w-3.5" /> {t("promote")}
            </IconButton>
          )}
          {isProspect && (
            <IconButton title={t("sendGhl")} onClick={onSyncGhl} tone="emerald" disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {t("sendGhl")}
            </IconButton>
          )}
          <IconButton title={t("delete")} onClick={onDelete} tone="danger">
            <Trash2 className="h-3.5 w-3.5" /> {t("delete")}
          </IconButton>
        </div>
      )}

      {editing ? (
        <div className="border-t border-white/[0.06] px-5 py-4">
          <EditLeadForm lead={lead} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <Section title={t("sectionDetails")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              {lead.phone && (
                <>
                  <dt className="pt-0.5 text-white/30"><Phone className="h-3.5 w-3.5" /></dt>
                  <dd><a href={`tel:${lead.phone}`} className="text-white/80 hover:text-white">{lead.phone}</a></dd>
                </>
              )}
              {lead.email && (
                <>
                  <dt className="pt-0.5 text-white/30"><Mail className="h-3.5 w-3.5" /></dt>
                  <dd className="min-w-0 truncate"><a href={`mailto:${lead.email}`} className="text-white/80 hover:text-white">{lead.email}</a></dd>
                </>
              )}
              {lead.website && (
                <>
                  <dt className="pt-0.5 text-white/30"><Globe className="h-3.5 w-3.5" /></dt>
                  <dd className="min-w-0 truncate">
                    <a href={/^https?:\/\//.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white">
                      {lead.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </>
              )}
              {lead.industry && (
                <>
                  <dt className="pt-0.5 text-white/30"><Tag className="h-3.5 w-3.5" /></dt>
                  <dd className="text-white/80">{lead.industry}</dd>
                </>
              )}
            </dl>
            {socials.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {socials.map((s, i) => (
                  <a
                    key={i}
                    href={/^https?:\/\//.test(s.url) ? s.url : `https://${s.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg px-2 py-1 text-[11px] font-semibold capitalize text-white/60 hover:text-white"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {s.platform}
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title={t("sectionContacts")}>
            <LeadContacts leadId={lead.id} contacts={lead.contacts ?? []} />
          </Section>

          <Section title={t("sectionSales")}>
            <LeadSalesPanel leadId={lead.id} leadName={lead.name} compact />
          </Section>

          {pieces && pieces.pieces > 0 && (
            <Section title={t("sectionPieces")} badge={<ModuleBadge module="tags" />}>
              <Link
                href={`/tags/pieces?lead=${lead.id}&name=${encodeURIComponent(lead.name)}`}
                className="flex items-center gap-2 rounded-xl bg-violet-400/10 px-3 py-2.5 text-xs font-semibold text-violet-300 hover:bg-violet-400/15"
              >
                <Nfc className="h-4 w-4" />
                <span className="flex-1">
                  {[t.plural("piecesCount", pieces.pieces), t("piecesLive", { n: pieces.live }), t("piecesScans", { n: pieces.scansLast30 })].join(" · ")}
                </span>
                <span>{t("openPieces")} →</span>
              </Link>
            </Section>
          )}

          <Section title={t("sectionVisits")}>
            {visits.length === 0 ? (
              <p className="text-xs text-white/35">{t("noVisitsYet")}</p>
            ) : (
              <div className="space-y-1">
                {visits.slice(0, 6).map((v) => (
                  <Link
                    key={v.id}
                    href={`/visits/${v.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs hover:bg-white/[0.04]"
                  >
                    <span className="text-white/60">
                      {v.checkedInAt ? new Date(v.checkedInAt).toLocaleString(tCheckin.locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                    </span>
                    <StatusBadge status={v.status} />
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
