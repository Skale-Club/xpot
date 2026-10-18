import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Link2, MapPin, Package, Plus, Radio, ScanLine, Search, Star, Unlink } from "lucide-react";
import type { LeadTagSummary, TagListItem } from "@shared/tagsApi";
import { validateChipContent } from "@shared/chipContent";
import { guessDestinationType, normalizeUrlInput } from "@shared/tagApp";
import { stockBlock } from "@shared/tags";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { leadsMessages } from "@/i18n/messages/leads";
import { apiRequest } from "@/lib/queryClient";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { MasterDetail } from "@/components/xpot/MasterDetail";
import { GoogleLogo } from "@/components/ui/google-logo";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { InlineField, validateEmail } from "@/pages/xpot/components/InlineField";
import { InlineStateSelect } from "@/components/StateSelect";
import { useXpotModules } from "@/components/ModuleSwitch";
import { LeadContacts } from "@/pages/xpot/components/leads/LeadContacts";
import type { FullSalesLead, GoogleBusinessProfile, SalesLead, SalesLeadContact, SalesLeadLocation } from "@/pages/xpot/types";
import { usePlaceSearch } from "@/pages/xpot/usePlaceSearch";
import TagScreen from "./TagScreen";
import { APP_BASE, errorText, shortUrl, tagPath, tagsGet, tagsPost, useBanner, type BannerState } from "./lib";
import {
  Banner, BottomSheet, BTN_PRIMARY, BTN_TERTIARY, CARD, EYEBROW_MUTED, INPUT, LinkInput, ChipMark, PieceStatusPills, Spinner,
} from "./ui";

// One customer of the reseller: the company (its details, contacts and Google
// profile, all the same lead the Visits app edits) and the pieces it holds,
// with what can be done to them from here: open, link another, change the
// link of several at once, unlink.

/** GET /api/xpot/leads/:id. */
type LeadDetail = { lead: SalesLead; locations: SalesLeadLocation[]; contacts: SalesLeadContact[] };

const MINI_BTN =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.08] active:bg-white/10 disabled:opacity-40";

/** Pieces this person can link to a customer: their own, unconfigured, physically in hand. */
function isFreePiece(tag: TagListItem) {
  return !tag.leadId && tag.status === "inventory" && !stockBlock(tag.stockStatus);
}

/** The link most of a customer's pieces already open, offered as the default for a new one. */
function usualLink(pieces: TagListItem[]): string {
  const counts = new Map<string, number>();
  for (const p of pieces) if (p.destinationUrl) counts.set(p.destinationUrl, (counts.get(p.destinationUrl) ?? 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function Metric({ icon: Icon, value, label }: { icon: ComponentType<{ className?: string }>; value: number; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-400/[0.09] text-violet-300/80">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <strong className="block text-base font-bold leading-none tabular-nums text-white/90">{value}</strong>
        <span className="mt-1 block truncate text-[10px] font-medium text-white/35">{label}</span>
      </span>
    </div>
  );
}

function Panel({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={EYEBROW_MUTED}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** The company's Google Business Profile: live rating when linked, a search to link it when not. */
function GoogleProfile({ lead, onDone, banner }: { lead: FullSalesLead; onDone: (text: string, ok: boolean) => void; banner: BannerState }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(Boolean(lead.googlePlaceId));
  const profile = useQuery<GoogleBusinessProfile>({
    queryKey: ["/api/xpot/leads", lead.id, "google-profile"],
    enabled: connected,
    staleTime: 5 * 60_000,
  });
  const results = usePlaceSearch(search, picking, {});

  useEffect(() => {
    setConnected(Boolean(lead.googlePlaceId));
  }, [lead.googlePlaceId]);

  const savePlace = async (placeId: string | null) => {
    setBusy(true);
    try {
      const response = await apiRequest("POST", `/api/xpot/leads/${lead.id}/google-profile`, { placeId });
      const data = await response.json() as { profile: GoogleBusinessProfile };
      setConnected(Boolean(placeId));
      qc.setQueryData(["/api/xpot/leads", lead.id, "google-profile"], data.profile);
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads", lead.id, "google-profile"] });
      setPicking(false);
      setSearch("");
      onDone(placeId ? t("customerGoogleSaved") : t("customerGoogleRemoved"), true);
    } catch (err) {
      onDone(errorText(err, tc("requestFailed")), false);
    } finally {
      setBusy(false);
    }
  };

  const p = profile.data;
  return (
    <Panel
      title={<span className="flex items-center gap-1.5"><GoogleLogo className="h-3.5 w-3.5" />{t("customerGoogle")}</span>}
      right={connected ? (
        <button type="button" disabled={busy} onClick={() => void savePlace(null)} className="text-[11px] font-semibold text-white/25 transition hover:text-red-300 disabled:opacity-40">
          {t("customerGoogleUnlink")}
        </button>
      ) : null}
    >
      {connected ? (
        profile.isLoading ? (
          <div className="flex justify-center py-3 text-white/40"><Spinner /></div>
        ) : (
          <div className="space-y-2">
            {p?.rating != null && (
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                <strong className="text-2xl font-extrabold tabular-nums text-white">{p.rating.toFixed(1)}</strong>
                {p.reviewCount != null && <span className="text-sm text-white/45">{t.plural("customerGoogleReviews", p.reviewCount)}</span>}
              </div>
            )}
            {p?.openNow != null && (
              <p className={`text-xs font-semibold ${p.openNow ? "text-emerald-300" : "text-white/40"}`}>
                {p.openNow ? t("customerGoogleOpen") : t("customerGoogleClosed")}
              </p>
            )}
            {p?.mapsUrl && (
              <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 hover:text-blue-200">
                {t("customerGoogleMaps")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-white/45">{t("customerGoogleNone")}</p>
          <button type="button" className={`${MINI_BTN} mt-3`} onClick={() => { setSearch(lead.name); setPicking(true); }}>
            <GoogleLogo className="h-4 w-4" />
            {t("customerGoogleLink")}
          </button>
        </>
      )}

      <BottomSheet open={picking} onClose={() => setPicking(false)} title={t("customerGoogleLink")} banner={banner}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customerGoogleSearch")}
            aria-label={t("customerGoogleSearch")}
            className={`${INPUT} pl-10`}
            data-testid="input-google-search"
          />
        </div>
        <div className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto">
          {results.isFetching && !results.data ? (
            <div className="flex justify-center py-6 text-white/40"><Spinner /></div>
          ) : results.data?.results.length ? (
            results.data.results.map((place) => (
              <button
                key={place.placeId}
                type="button"
                disabled={busy}
                onClick={() => void savePlace(place.placeId)}
                className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.07] disabled:opacity-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{place.name}</span>
                  <span className="block truncate text-xs text-white/45">{place.address}</span>
                </span>
              </button>
            ))
          ) : search.trim().length >= 2 && !results.isFetching ? (
            <p className="py-6 text-center text-sm text-white/40">{t("customerGoogleNoResults")}</p>
          ) : null}
        </div>
      </BottomSheet>
    </Panel>
  );
}

export default function CustomerScreen({ leadId }: { leadId: number }) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tl = useT(leadsMessages);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const isDesktop = useIsDesktop();
  const canEditAddress = useXpotModules().includes("visits");
  const { banner, show } = useBanner();

  // The company itself, not a search through the leads list: that list is paged and
  // scoped, and a customer holding the person's pieces must open whoever created it.
  const leadQuery = useQuery<LeadDetail>({ queryKey: ["/api/xpot/leads", leadId], staleTime: 60_000 });
  const lead = useMemo<FullSalesLead | null>(
    () => (leadQuery.data?.lead ? { ...leadQuery.data.lead, locations: leadQuery.data.locations ?? [], contacts: leadQuery.data.contacts ?? [] } : null),
    [leadQuery.data],
  );
  // Every piece the person holds: this customer's, and the free ones that can be linked to it.
  const piecesQuery = useQuery({
    queryKey: ["tags", "list", null, null],
    queryFn: () => tagsGet<TagListItem[]>("/api/xpot/tags?mine=1"),
    staleTime: 15_000,
  });
  const pieces = useMemo(() => (piecesQuery.data ?? []).filter((p) => p.leadId === leadId), [piecesQuery.data, leadId]);
  const freePieces = useMemo(() => (piecesQuery.data ?? []).filter(isFreePiece), [piecesQuery.data]);
  const live = useMemo(() => pieces.filter((p) => p.status === "active").length, [pieces]);
  // The same 30-day count the Customers list shows; the pieces' own counters are all-time.
  const summariesQuery = useQuery<LeadTagSummary[]>({ queryKey: ["/api/xpot/tags/by-lead"], staleTime: 15_000 });
  const scans30 = summariesQuery.data?.find((s) => s.leadId === leadId)?.scansLast30 ?? 0;

  const [openCode, setOpenCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [linkPieceId, setLinkPieceId] = useState<string>("");
  const [changing, setChanging] = useState(false);
  const [link, setLink] = useState("");
  const [unlinking, setUnlinking] = useState<TagListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["tags"] }),
    qc.invalidateQueries({ queryKey: ["/api/xpot/tags/by-lead"] }),
  ]);
  const saveLead = async (key: "name" | "industry" | "phone" | "email" | "website", value: string) => {
    const v = value.trim();
    try {
      // An emptied field clears it (null), rather than being skipped.
      await apiRequest("PATCH", `/api/xpot/leads/${leadId}`, { [key]: v || null });
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      show({ tone: "ok", text: t("customerSaved") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    }
  };
  // The location endpoint replaces the whole address, so send it whole with the one field changed.
  const saveLocation = async (key: "addressLine1" | "city" | "state" | "postalCode", value: string) => {
    const loc = lead?.locations?.[0];
    const v = value.trim();
    try {
      await apiRequest("PATCH", `/api/xpot/leads/${leadId}/location`, {
        label: loc?.label,
        addressLine1: loc?.addressLine1 ?? "",
        addressLine2: loc?.addressLine2 ?? null,
        city: loc?.city ?? null,
        state: loc?.state ?? null,
        postalCode: loc?.postalCode ?? null,
        country: loc?.country,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        geofenceRadiusMeters: loc?.geofenceRadiusMeters,
        [key]: key === "addressLine1" ? v : v || null,
      });
      await qc.invalidateQueries({ queryKey: ["/api/xpot/leads"] });
      show({ tone: "ok", text: t("customerSaved") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    }
  };
  const openPiece = (code: string) => (isDesktop ? setOpenCode(code) : navigate(tagPath(code)));
  const closePiece = () => {
    setOpenCode(null);
    void refresh();
  };
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const targets = selected.size ? pieces.filter((p) => selected.has(p.id)) : pieces;

  const checkedLink = () => {
    const check = validateChipContent(normalizeUrlInput(link), { allowHttp: true });
    if (!check.ok) {
      show({ tone: "error", text: t("invalidLink") });
      return null;
    }
    return check.value;
  };

  const linkPiece = async () => {
    const url = checkedLink();
    if (!url || !linkPieceId) return;
    setBusy(true);
    try {
      await tagsPost(`/api/xpot/tags/${linkPieceId}/quick-activate`, { leadId, destinationUrl: url, destinationType: guessDestinationType(url) });
      await refresh();
      setLinking(false);
      show({ tone: "ok", text: t("customerLinked") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const changeLink = async () => {
    const url = checkedLink();
    if (!url) return;
    setBusy(true);
    let ok = 0;
    let lastError = "";
    for (const piece of targets) {
      try {
        await tagsPost(`/api/xpot/tags/${piece.id}/destination`, { destinationUrl: url, destinationType: guessDestinationType(url) });
        ok += 1;
      } catch (err) {
        lastError = errorText(err, tc("requestFailed"));
      }
    }
    await refresh();
    setBusy(false);
    setChanging(false);
    setSelected(new Set());
    const failed = targets.length - ok;
    show(failed
      ? { tone: "error", text: t("customerChangeLinkPartial", { ok, failed, error: lastError }) }
      : { tone: "ok", text: t("customerChangeLinkDone") });
  };

  const unlink = async () => {
    if (!unlinking) return;
    setBusy(true);
    try {
      await tagsPost(`/api/xpot/tags/${unlinking.id}/unassign`, {});
      await refresh();
      show({ tone: "ok", text: t("customerUnlinked") });
    } catch (err) {
      show({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setBusy(false);
      setUnlinking(null);
    }
  };

  if (leadQuery.isLoading || piecesQuery.isLoading) {
    return <div className="flex justify-center py-20 text-white/40"><Spinner className="h-7 w-7" /></div>;
  }
  if (!lead) {
    return (
      <div className={`${CARD} px-6 py-12 text-center`}>
        <p className="text-base font-bold text-white">{t("customerNotFound")}</p>
        <Link href={`${APP_BASE}/customers`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300">
          <ArrowLeft className="h-4 w-4" />{t("customersTitle")}
        </Link>
      </div>
    );
  }

  const location = lead.locations?.[0];
  const address = [location?.addressLine1, location?.city, location?.state].filter(Boolean).join(", ");
  const subtitle = [lead.industry, [location?.city, location?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const allSelected = pieces.length > 0 && selected.size === pieces.length;

  const piecesPanel = (
    <section className={`${CARD} overflow-hidden`} data-testid="customer-pieces">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
        <h2 className={EYEBROW_MUTED}>{t("customerPieces")}</h2>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={MINI_BTN} disabled={!pieces.length} onClick={() => { setLink(usualLink(targets)); setChanging(true); }} data-testid="customer-change-link">
            <Link2 className="h-4 w-4" />
            {t("customerChangeLink")}{selected.size ? ` (${selected.size})` : ""}
          </button>
          <button
            type="button"
            className={MINI_BTN}
            onClick={() => { setLinkPieceId(freePieces[0]?.id ?? ""); setLink(usualLink(pieces)); setLinking(true); }}
            data-testid="customer-link-piece"
          >
            <Plus className="h-4 w-4" />
            {t("customerLinkPiece")}
          </button>
        </div>
      </div>
      {pieces.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/40">{t("customerNoPieces")}</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          <li className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-white/35">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(pieces.map((p) => p.id)))}
              aria-label={t("customerSelectAll")}
              className="h-4 w-4 accent-blue-500"
            />
            <span className="flex-1">{t("colCode")}</span>
            <span className="hidden w-48 md:block">{t("colLink")}</span>
            <span className="w-24">{t("colStatus")}</span>
            <span className="w-20 text-right">{t("colScans")}</span>
            <span className="w-9" />
          </li>
          {pieces.map((p) => (
            <li
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03] ${selected.has(p.id) ? "bg-blue-500/[0.08]" : ""}`}
              onClick={() => openPiece(p.publicCode)}
              data-testid={`customer-piece-${p.publicCode}`}
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(p.id)}
                aria-label={t("customerSelectPiece", { code: p.publicCode })}
                className="h-4 w-4 shrink-0 accent-blue-500"
              />
              <TagPieceMention publicCode={p.publicCode} productType={p.productType} face={p.face} batchCode={p.batchCode} details={p.label ?? undefined} className="min-w-0 flex-1" />
              <span className="hidden w-48 truncate text-xs text-white/45 md:block">{p.destinationUrl ? shortUrl(p.destinationUrl) : "—"}</span>
              <span className="flex w-24 flex-wrap items-center gap-1">
                <PieceStatusPills tag={p} />
                <ChipMark tag={p} />
              </span>
              <span className="w-20 text-right tabular-nums">
                {p.qrInteractions + p.nfcInteractions > 0 ? (
                  <>
                    <span className="block font-semibold text-white">{p.qrInteractions + p.nfcInteractions}</span>
                    <span className="block text-[11px] text-white/40">{p.qrInteractions} QR · {p.nfcInteractions} NFC</span>
                  </>
                ) : <span className="text-white/20">—</span>}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setUnlinking(p); }}
                aria-label={t("customerUnlink")}
                title={t("customerUnlink")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/35 hover:bg-white/[0.08] hover:text-red-300"
                data-testid={`customer-unlink-${p.publicCode}`}
              >
                <Unlink className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <section data-testid="tags-customer-screen">
      {/* One identity surface: company first, operational numbers second. */}
      <header className="mb-4 rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4 lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Link
            href={`${APP_BASE}/customers`}
            aria-label={tc("back")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white active:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/[0.1] text-violet-300 sm:flex">
            <Package className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1" data-testid="customer-name">
            <InlineField label="" large value={lead.name} onSave={(v) => void saveLead("name", v)} validate={(v) => (v.trim() ? null : t("customerNameRequired"))} />
            {subtitle && <p className="truncate text-sm text-white/45">{subtitle}</p>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.06] rounded-xl border border-white/[0.06] bg-black/[0.12] lg:mt-0 lg:w-[420px] lg:shrink-0">
          <Metric icon={Package} value={pieces.length} label={t("customersPieces")} />
          <Metric icon={Radio} value={live} label={t("customersLive")} />
          <Metric icon={ScanLine} value={scans30} label={t("customersScans30")} />
        </div>
      </header>
      <Banner banner={banner} />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MasterDetail
          popup
          closeLabel={t("closePane")}
          onClose={closePiece}
          list={piecesPanel}
          detail={openCode ? <TagScreen key={openCode} code={openCode} onClose={closePiece} /> : null}
        />

        <div className="space-y-4">
          <Panel title={t("customerCompany")}>
            {/* Click any line to edit it; Enter or leaving the field saves, Escape cancels. */}
            <div className="grid grid-cols-2 gap-x-4" data-testid="customer-company">
              <InlineField label={tl("fieldIndustry")} value={lead.industry ?? ""} onSave={(v) => void saveLead("industry", v)} />
              <InlineField label={tl("fieldPhone")} value={lead.phone ?? ""} onSave={(v) => void saveLead("phone", v)} linkable={!!lead.phone} linkHref={lead.phone ? `tel:${lead.phone}` : undefined} />
              <InlineField label={tl("fieldEmail")} value={lead.email ?? ""} onSave={(v) => void saveLead("email", v)} linkable={!!lead.email} linkHref={lead.email ? `mailto:${lead.email}` : undefined} validate={validateEmail} />
              <InlineField label={tl("fieldWebsite")} value={lead.website ?? ""} onSave={(v) => void saveLead("website", v)} linkable={!!lead.website} />
              <div className="col-span-2 my-2 h-px bg-white/[0.06]" />
              {canEditAddress ? (
                <>
                  <div className="col-span-2">
                    <InlineField label={tl("fieldStreet")} value={location?.addressLine1 ?? ""} onSave={(v) => void saveLocation("addressLine1", v)} linkable={!!address} linkHref={address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : undefined} />
                  </div>
                  <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_72px_96px] gap-x-3">
                    <InlineField label={tl("fieldCity")} value={location?.city ?? ""} onSave={(v) => void saveLocation("city", v)} />
                    <InlineStateSelect label={tl("fieldState")} value={location?.state ?? ""} onSave={(v) => void saveLocation("state", v)} placeholder={tl("fieldState")} />
                    <InlineField label={tl("fieldPostal")} value={location?.postalCode ?? ""} onSave={(v) => void saveLocation("postalCode", v)} />
                  </div>
                </>
              ) : (
                // The address drives Visits check-ins, so only Visits users change it.
                <div className="col-span-2 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{tl("fieldAddress")}</span>
                  <p className="mt-0.5 text-sm text-white/80">{address || "\u2014"}</p>
                </div>
              )}
              <div className="col-span-2 mt-3 border-t border-white/[0.06] pt-3">
                <h3 className={`${EYEBROW_MUTED} mb-2.5`}>{t("customerContacts")}</h3>
                <LeadContacts leadId={lead.id} contacts={lead.contacts ?? []} />
              </div>
            </div>
          </Panel>

          <GoogleProfile lead={lead} banner={banner} onDone={(text, ok) => show({ tone: ok ? "ok" : "error", text })} />
        </div>
      </div>

      <BottomSheet open={linking} onClose={() => setLinking(false)} title={t("customerLinkPieceTitle", { name: lead.name })} banner={banner}>
        {freePieces.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">{t("customerNoStock")}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/50">{t("customerLinkPieceHint")}</p>
            <div className="max-h-[36vh] space-y-1.5 overflow-y-auto">
              {freePieces.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 ${linkPieceId === p.id ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                >
                  <input type="radio" name="link-piece" checked={linkPieceId === p.id} onChange={() => setLinkPieceId(p.id)} className="accent-blue-500" />
                  <TagPieceMention publicCode={p.publicCode} productType={p.productType} face={p.face} batchCode={p.batchCode} className="min-w-0 flex-1" />
                </label>
              ))}
            </div>
            <LinkInput key={linkPieceId} value={link} onChange={setLink} face={freePieces.find((p) => p.id === linkPieceId)?.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
            <button type="button" className={BTN_PRIMARY} disabled={busy || !linkPieceId || !link.trim()} onClick={() => void linkPiece()}>
              {busy ? <Spinner /> : <Plus className="h-5 w-5" />}
              {t("customerLinkPiece")}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={changing} onClose={() => setChanging(false)} title={t.plural("customerChangeLinkTitle", targets.length)} banner={banner}>
        <div className="space-y-4">
          <p className="text-sm text-white/50">{t("customerChangeLinkHint")}</p>
          <LinkInput value={link} onChange={setLink} face={targets[0]?.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
          <button type="button" className={BTN_PRIMARY} disabled={busy || !link.trim()} onClick={() => void changeLink()}>
            {busy ? <Spinner /> : <Link2 className="h-5 w-5" />}
            {t("customerChangeLink")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={unlinking != null} onClose={() => setUnlinking(null)} title={unlinking ? t("customerUnlinkTitle", { code: unlinking.publicCode }) : undefined} banner={banner}>
        <div className="space-y-4">
          <p className="text-sm text-white/55">{t("customerUnlinkHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={BTN_TERTIARY} onClick={() => setUnlinking(null)}>{tc("cancel")}</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void unlink()}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 text-base font-bold text-white active:bg-red-600 disabled:opacity-50"
              data-testid="customer-unlink-confirm"
            >
              {busy ? <Spinner /> : <Unlink className="h-5 w-5" />}
              {t("customerUnlink")}
            </button>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}
