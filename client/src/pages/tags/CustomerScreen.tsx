import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Link2, Package, Plus, Radio, ScanLine } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/xpot/DashboardKit";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { ACCENT_SELECTED } from "@/components/xpot/surface";
import { TagPieceMention } from "@/components/xpot/TagProductThumbnail";
import { InlineField, validateEmail } from "@/pages/xpot/components/InlineField";
import { InlineStateSelect } from "@/components/StateSelect";
import { useXpotModules } from "@/components/ModuleSwitch";
import { LeadContacts } from "@/pages/xpot/components/leads/LeadContacts";
import type { FullSalesLead, SalesLead, SalesLeadContact, SalesLeadLocation } from "@/pages/xpot/types";
import { formatPhone } from "@/lib/format";
import TagScreen from "./TagScreen";
import { APP_BASE, errorText, myPiecesQuery, shortUrl, tagPath, tagsPost, useBanner } from "./lib";
import { formatCount } from "./charts";
import { CustomerAccess } from "./CustomerAccess";
import { GoogleProfile } from "./CustomerGoogle";
import { Panel } from "./CustomerPanel";
import {
  Banner, BottomSheet, CARD, EYEBROW_MUTED, LinkInput, ChipMark, PieceStatusPills, ScanCounts, SheetActions, TopBar,
} from "./ui";

// One customer of the reseller: the company (its details, contacts and Google
// profile, all the same lead the Visits app edits) and the pieces it holds,
// with what can be done to them from here: open, link another, change the
// link of several at once, unlink.

/** GET /api/xpot/leads/:id. */
type LeadDetail = { lead: SalesLead; locations: SalesLeadLocation[]; contacts: SalesLeadContact[] };

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
  // The same key and request as My pieces (PiecesScreen): whichever screen fills the cache, it holds every piece.
  const piecesQuery = useQuery(myPiecesQuery());
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
  const [busy, setBusy] = useState(false);
  // The company's own details are a form: open on a computer, one tap away on a phone.
  const [detailsOpen, setDetailsOpen] = useState(isDesktop);

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
        // Coordinates and radius are left out: the server keeps them while the
        // address is the same and re-places the company when it changes.
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

  if (leadQuery.isLoading || piecesQuery.isLoading) {
    return (
      <>
        <TopBar title={t("customersTitle")} back={`${APP_BASE}/customers`} />
        <ListSkeleton rows={4} />
      </>
    );
  }
  if (!lead) {
    return (
      <>
        <TopBar title={t("customersTitle")} back={`${APP_BASE}/customers`} />
        <EmptyState
          tone="tags"
          icon={Building2}
          title={t("customerNotFound")}
          action={
            <Button type="button" variant="secondary" onClick={() => navigate(`${APP_BASE}/customers`)}>
              {t("customersTitle")}
            </Button>
          }
        />
      </>
    );
  }

  const location = lead.locations?.[0];
  const address = [location?.addressLine1, location?.city, location?.state].filter(Boolean).join(", ");
  const subtitle = [lead.industry, [location?.city, location?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const allSelected = pieces.length > 0 && selected.size === pieces.length;
  // One piece has nothing to choose among; with several, the button says how far it reaches before anything is changed.
  const pickable = pieces.length > 1;
  const changeLabel = !pickable ? t("customerChangeLink") : selected.size ? t("customerChangeSelected", { count: selected.size }) : t("customerChangeAll", { count: pieces.length });

  const piecesPanel = (
    <section className={`${CARD} overflow-hidden`} data-testid="customer-pieces">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
        <h2 className={EYEBROW_MUTED}>{t("customerPieces")}</h2>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="secondary" size="sm" disabled={!pieces.length} onClick={() => { setLink(usualLink(targets)); setChanging(true); }} data-testid="customer-change-link">
            <Link2 />
            {changeLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { setLinkPieceId(freePieces[0]?.id ?? ""); setLink(usualLink(pieces)); setLinking(true); }}
            data-testid="customer-link-piece"
          >
            <Plus />
            {t("customerLinkPiece")}
          </Button>
        </div>
      </div>
      {piecesQuery.error && !piecesQuery.data ? (
        <div className="p-4">
          <ErrorState compact message={errorText(piecesQuery.error, tc("requestFailed"))} onRetry={() => void piecesQuery.refetch()} />
        </div>
      ) : pieces.length === 0 ? (
        <EmptyState compact tone="tags" icon={Package} title={t("customerNoPieces")} cardStyle={{}} />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          <li className={`flex items-center gap-3 px-4 py-2 ${EYEBROW_MUTED}`}>
            {pickable && (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(pieces.map((p) => p.id)))}
                aria-label={t("customerSelectAll")}
                className="h-4 w-4 accent-violet-500"
              />
            )}
            <span className="flex-1">{t("colCode")}</span>
            <span className="hidden w-48 md:block">{t("colLink")}</span>
            <span className="hidden w-24 sm:block">{t("colStatus")}</span>
            <span className="hidden w-24 text-right sm:block">{t("colScans")}</span>
          </li>
          {pieces.map((p) => (
            <li
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03] ${selected.has(p.id) ? ACCENT_SELECTED.tags.row : ""}`}
              onClick={() => openPiece(p.publicCode)}
              data-testid={`customer-piece-${p.publicCode}`}
            >
              {pickable && (
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(p.id)}
                  aria-label={t("customerSelectPiece", { code: p.publicCode })}
                  className="h-4 w-4 shrink-0 accent-violet-500"
                />
              )}
              <span className="min-w-0 flex-1">
                <TagPieceMention publicCode={p.publicCode} productType={p.productType} face={p.face} batchCode={p.batchCode} details={p.label ?? undefined} className="w-full" />
                {/* A phone has no room for a status column: the state sits under the code. */}
                <span className="mt-1.5 flex flex-wrap items-center gap-1 pl-12 sm:hidden">
                  <PieceStatusPills tag={p} />
                  <ChipMark tag={p} />
                </span>
              </span>
              <span className="hidden w-48 truncate text-xs text-white/45 md:block">{p.destinationUrl ? shortUrl(p.destinationUrl) : "—"}</span>
              <span className="hidden w-24 flex-wrap items-center gap-1 sm:flex">
                <PieceStatusPills tag={p} />
                <ChipMark tag={p} />
              </span>
              <span className="hidden w-24 text-right sm:block">
                <ScanCounts qr={p.qrInteractions} nfc={p.nfcInteractions} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <section data-testid="tags-customer-screen">
      {/* The same TopBar as every Tags screen; the name is edited in the Company panel. */}
      <div data-testid="customer-name">
        <TopBar title={lead.name} back={`${APP_BASE}/customers`} sub={subtitle ? <p className="truncate text-sm text-white/45">{subtitle}</p> : undefined} />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 lg:max-w-xl">
        <KpiTile accent="violet" icon={Package} value={formatCount(pieces.length, t.locale)} label={t("customersPieces")} />
        <KpiTile accent="violet" icon={Radio} value={formatCount(live, t.locale)} label={t("customersLive")} />
        <KpiTile accent="violet" icon={ScanLine} value={formatCount(scans30, t.locale)} label={t("customersScans30")} />
      </div>
      <Banner banner={banner} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <MasterDetail
          popup
          closeLabel={t("closePane")}
          onClose={closePiece}
          list={piecesPanel}
          detail={openCode ? <TagScreen key={openCode} code={openCode} onClose={closePiece} /> : null}
        />

        <div className="space-y-4">
          <Panel
            title={t("customerDetails")}
            collapsed={!detailsOpen}
            right={
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
                aria-label={t("customerDetails")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/45 active:bg-white/10 lg:hidden"
                data-testid="customer-details-toggle"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              </button>
            }
          >
            {/* Click any line to edit it; Enter or leaving the field saves, Escape cancels. */}
            <div className={`grid grid-cols-2 gap-x-4 ${detailsOpen ? "" : "hidden lg:grid"}`} data-testid="customer-company">
              <div className="col-span-2">
                <InlineField label={t("customerName")} value={lead.name} onSave={(v) => void saveLead("name", v)} validate={(v) => (v.trim() ? null : t("customerNameRequired"))} />
              </div>
              <InlineField label={tl("fieldIndustry")} value={lead.industry ?? ""} onSave={(v) => void saveLead("industry", v)} />
              <InlineField label={tl("fieldPhone")} value={lead.phone ?? ""} display={formatPhone} onSave={(v) => void saveLead("phone", v)} linkable={!!lead.phone} linkHref={lead.phone ? `tel:${lead.phone}` : undefined} />
              <div className="col-span-2">
                <InlineField label={tl("fieldEmail")} value={lead.email ?? ""} onSave={(v) => void saveLead("email", v)} linkable={!!lead.email} linkHref={lead.email ? `mailto:${lead.email}` : undefined} validate={validateEmail} />
              </div>
              <div className="col-span-2">
                <InlineField label={tl("fieldWebsite")} value={lead.website ?? ""} onSave={(v) => void saveLead("website", v)} linkable={!!lead.website} />
              </div>
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
                  <span className={EYEBROW_MUTED}>{tl("fieldAddress")}</span>
                  <p className="mt-0.5 text-sm text-white/80">{address || "\u2014"}</p>
                </div>
              )}
              <div className="col-span-2 mt-3 border-t border-white/[0.06] pt-3">
                <h3 className={`${EYEBROW_MUTED} mb-2.5`}>{t("customerContacts")}</h3>
                <LeadContacts leadId={lead.id} contacts={lead.contacts ?? []} accent="tags" />
              </div>
            </div>
          </Panel>

          <GoogleProfile lead={lead} banner={banner} onDone={(text, ok) => show({ tone: ok ? "ok" : "error", text })} />

          {/* The phones that read this customer's plates at /my; nothing while the server has the panel off. */}
          <CustomerAccess leadId={lead.id} onDone={(text, ok) => show({ tone: ok ? "ok" : "error", text })} />
        </div>
      </div>

      <BottomSheet open={linking} onClose={() => setLinking(false)} title={t("customerLinkPieceTitle", { name: lead.name })} banner={banner}>
        {freePieces.length === 0 ? (
          <div className="space-y-4">
            <EmptyState compact tone="tags" icon={Package} title={t("customerNoStock")} />
            <Button type="button" variant="ghost" size="lg" onClick={() => setLinking(false)} className="w-full">
              {tc("close")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/50">{t("customerLinkPieceHint")}</p>
            <div className="max-h-[36vh] space-y-1.5 overflow-y-auto">
              {freePieces.map((p) => (
                <label
                  key={p.id}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${linkPieceId === p.id ? `border-violet-400/50 ${ACCENT_SELECTED.tags.row}` : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                >
                  <input type="radio" name="link-piece" checked={linkPieceId === p.id} onChange={() => setLinkPieceId(p.id)} className="accent-violet-500" />
                  <TagPieceMention publicCode={p.publicCode} productType={p.productType} face={p.face} batchCode={p.batchCode} className="min-w-0 flex-1" />
                </label>
              ))}
            </div>
            <LinkInput key={linkPieceId} value={link} onChange={setLink} face={freePieces.find((p) => p.id === linkPieceId)?.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
            <SheetActions>
              <Button type="button" variant="brand" accent="tags" size="lg" loading={busy} disabled={!linkPieceId || !link.trim()} onClick={() => void linkPiece()} className="w-full">
                <Plus className="!size-5" />
                {t("customerLinkPiece")}
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => setLinking(false)} className="w-full">
                {tc("cancel")}
              </Button>
            </SheetActions>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={changing} onClose={() => setChanging(false)} title={t.plural("customerChangeLinkTitle", targets.length)} banner={banner}>
        <div className="space-y-4">
          <p className="text-sm text-white/50">{t("customerChangeLinkHint")}</p>
          <LinkInput value={link} onChange={setLink} face={targets[0]?.face} placeholder={t("linkPlaceholder")} onPasteFailed={() => show({ tone: "error", text: tc("pasteFailed") })} />
          <SheetActions>
            <Button type="button" variant="brand" accent="tags" size="lg" loading={busy} disabled={!link.trim()} onClick={() => void changeLink()} className="w-full">
              <Link2 className="!size-5" />
              {t("customerChangeLink")}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setChanging(false)} className="w-full">
              {tc("cancel")}
            </Button>
          </SheetActions>
        </div>
      </BottomSheet>

    </section>
  );
}
