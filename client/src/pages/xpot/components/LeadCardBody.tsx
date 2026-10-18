import { Building2, Navigation, Package, Boxes } from "lucide-react";
import { displayPhone, formatCents } from "../utils";
import { useT } from "@/i18n";
import { salesModuleMessages } from "@/i18n/messages/salesModule";
import { leadsMessages } from "@/i18n/messages/leads";
import { Pill } from "@/components/xpot/StatusPill";
import { fileSrc } from "@/lib/files";

type LeadLike = {
  name: string;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  ghlContactId?: string | null;
  photos?: string[] | null;
  salesLifetimeCents?: number;
  unitsOnShelf?: number;
  locations?: {
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    lat?: string | number | null;
    lng?: string | number | null;
  }[];
};

export function buildRouteUrl(loc?: NonNullable<LeadLike["locations"]>[number]): string | null {
  if (!loc) return null;
  if (loc.lat && loc.lng)
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  const dest = [loc.addressLine1, loc.city, loc.state, loc.postalCode]
    .filter(Boolean)
    .join(", ");
  return dest
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
    : null;
}

/**
 * Shared body used by LeadCard (XpotLeads) and VisitRow.
 * Renders: avatar column (photo/icon + route link) + info column (name, address, phone, website, industry).
 *
 * @param subtitle  Extra row below the info lines (e.g. date/time in VisitRow)
 * @param right     Slot on the far right (e.g. StatusBadge in VisitRow, action buttons in LeadCard)
 */
export function LeadCardBody({
  lead,
  subtitle,
  right,
}: {
  lead: LeadLike;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const t = useT(salesModuleMessages);
  const tl = useT(leadsMessages);
  const loc = lead.locations?.[0];
  const photo = lead.photos?.[0];
  const routeUrl = buildRouteUrl(loc);

  return (
    <div className="flex items-center gap-3">
      {/* Avatar + route */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        {photo ? (
          <img src={fileSrc(photo)} alt="" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
            <Building2 className="h-7 w-7 text-white/40" aria-hidden="true" />
          </div>
        )}
        {routeUrl && (
          <a
            href={routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={tl("directions")}
            title={tl("directions")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Navigation className="h-5 w-5" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[15px] font-semibold text-white">{lead.name}</div>
          {lead.ghlContactId && <Pill tone="slate" className="shrink-0">GHL</Pill>}
        </div>
        <div className="mt-0.5 space-y-0.5">
          {loc?.addressLine1 && (
            <div className="truncate text-[11px] font-medium text-white/40">
              {loc.addressLine1}
              {loc.city ? `, ${loc.city}` : ""}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[11px] font-medium text-white/35">
            {lead.phone && <span>{displayPhone(lead.phone)}</span>}
            {lead.phone && lead.website && <span className="text-white/15">·</span>}
            {lead.website && (
              <span className="truncate max-w-[140px]">
                {lead.website.replace(/^https?:\/\//, "")}
              </span>
            )}
            {(lead.phone || lead.website) && lead.industry && (
              <span className="text-white/15">·</span>
            )}
            {lead.industry && <span>{lead.industry}</span>}
          </div>
        </div>
        {(lead.salesLifetimeCents || lead.unitsOnShelf) ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11px] font-medium">
            {lead.salesLifetimeCents ? (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <Package className="h-3 w-3" aria-hidden="true" /> {t("soldAmount", { amount: formatCents(lead.salesLifetimeCents) })}
              </span>
            ) : null}
            {lead.unitsOnShelf ? (
              <span className="inline-flex items-center gap-1 text-white/55">
                <Boxes className="h-3 w-3" aria-hidden="true" /> {t("onShelfN", { count: lead.unitsOnShelf })}
              </span>
            ) : null}
          </div>
        ) : null}
        {subtitle && <div className="mt-1">{subtitle}</div>}
      </div>

      {/* Right slot */}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
