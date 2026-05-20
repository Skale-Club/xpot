import { Building2, MapPinned } from "lucide-react";

type LeadLike = {
  name: string;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  ghlContactId?: string | null;
  photos?: string[] | null;
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
  const loc = lead.locations?.[0];
  const photo = lead.photos?.[0];
  const routeUrl = buildRouteUrl(loc);

  return (
    <div className="flex items-center gap-3">
      {/* Avatar + route */}
      <div className="flex shrink-0 flex-col items-center gap-3">
        {photo ? (
          <img src={photo} alt="" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10">
            <Building2 className="h-7 w-7 text-indigo-400" />
          </div>
        )}
        {routeUrl && (
          <a
            href={routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center text-white/40 transition-colors hover:text-white"
          >
            <MapPinned className="h-5 w-5" />
          </a>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[15px] font-semibold text-white">{lead.name}</div>
          {lead.ghlContactId && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400"
              style={{ background: "rgba(16,185,129,0.12)" }}
            >
              GHL
            </span>
          )}
        </div>
        <div className="mt-0.5 space-y-0.5">
          {loc?.addressLine1 && (
            <div className="truncate text-[11px] font-medium text-white/40">
              {loc.addressLine1}
              {loc.city ? `, ${loc.city}` : ""}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[11px] font-medium text-white/35">
            {lead.phone && <span>{lead.phone}</span>}
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
        {subtitle && <div className="mt-1">{subtitle}</div>}
      </div>

      {/* Right slot */}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
