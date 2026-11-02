import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Archive, ArrowUpRight, Ban, ChevronRight, Download, MoreHorizontal, RotateCcw, Truck, Undo2 } from "lucide-react";
import { planTransition } from "@shared/tags";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { Field, Input, Select } from "@/components/xpot/Field";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { Pill } from "@/components/xpot/StatusPill";
import { EYEBROW } from "@/components/xpot/surface";
import { formatDateTime } from "@/lib/dates";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { manageTagsBatchesMessages } from "@/i18n/messages/manageTagsBatches";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { formatCents } from "@/pages/xpot/utils";
import { CopyRow, useOrganizations, useReps } from "@/pages/admin/tags/pieces-shared";
import { catalogOptions, useTagCatalog } from "@/pages/admin/tags/batches-shared";
import { useTagLabels } from "@/pages/admin/tags/labels";
import { errorText } from "@/pages/tags/lib";
import { BottomSheet, CARD } from "@/pages/tags/ui";
import { PieceStatusChips } from "./PieceHeader";
import { usePiece, usePieceWrite } from "./PieceContext";
import { kitShort, pieceActionUrl, pieceCrossLink, pieceHasLocation, pieceIsSold, type PieceAction } from "./pieceView";

// Management (managers and admins): custody (batch, kit, holder, ownership,
// acquisition cost), Transfer / Take back through the stock rules
// (server setTagRep: it records the movement and keeps custody in step), the
// piece's own settings, its QR files and links, and the rare, heavy actions
// (retire, restore, mark damaged) behind "More actions", each with what it does
// and whether it can be undone.

type HeavyAction = Extract<PieceAction, "retire" | "restore" | "damage">;

const HOUSE = "house";

function Rows({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">{children}</dl>;
}
function Row({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-white/45">{label}</dt>
      <dd className="min-w-0 truncate text-right text-white/80" data-testid={testId}>{value}</dd>
    </>
  );
}

export function ManagementSection() {
  const { tag, viewer } = usePiece();
  const tm = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const tp = useT(pieceScreenMessages);
  const [, navigate] = useLocation();
  const cross = pieceCrossLink(viewer, tag);
  const qrBase = `/api/xpot/admin/tags/${tag.id}`;
  const holder = tag.repId !== null ? tag.repName ?? tm("resellerNumber", { id: tag.repId }) : tm("houseStock");
  // Platform management sees every company's pieces: "Belongs to" names the company, not just "the company".
  const { data: organizations = [] } = useOrganizations(viewer.isAdmin);
  const ownerName = tag.ownershipType === "company" ? organizations.find((o) => o.id === tag.organizationId)?.name : undefined;
  // "With" only for a piece somebody has in stock; a sold piece says who sold it; a lost or not yet received one, nothing.
  const holderRow = pieceHasLocation(tag)
    ? { label: tp("rowHolder"), value: holder }
    : pieceIsSold(tag) && tag.repId !== null ? { label: tp("rowSoldBy"), value: holder } : null;
  const kit = kitShort(tag.kitId, tag.kitCode);

  return (
    <section className={`${CARD} min-w-0 space-y-4 p-4`} data-testid="piece-management">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={EYEBROW}>{tp("managementTitle")}</p>
        {cross ? (
          <Button asChild variant="outline" size="sm">
            <Link href={cross.href} data-testid={cross.to === "admin" ? "link-open-in-management" : "link-open-as-reseller"}>
              <ArrowUpRight />
              {cross.to === "admin" ? tp("openInManagement") : tp("openAsReseller")}
            </Link>
          </Button>
        ) : null}
      </div>

      <Rows>
        <Row
          label={tg("colBatch")}
          value={tag.batchCode ? (
            // Batches are the global admin's; a manager sees the code without the link.
            viewer.isAdmin && tag.batchId ? (
              <button type="button" className="font-mono hover:text-white hover:underline" onClick={() => navigate(`/admin/tags/batches/${tag.batchId}`)}>
                {tag.batchCode}{tag.serialNumber ? ` #${tag.serialNumber}` : ""}
              </button>
            ) : (
              <span className="font-mono">{tag.batchCode}{tag.serialNumber ? ` #${tag.serialNumber}` : ""}</span>
            )
          ) : "—"}
        />
        <Row label={tp("rowKit")} value={kit ? <span className="font-mono">{tp("locationKit", { id: kit })}</span> : tp("noKit")} />
        {holderRow ? <Row label={holderRow.label} value={holderRow.value} testId="piece-holder" /> : null}
        <Row label={tp("rowOwnership")} value={ownerName ?? tp(`ownership_${tag.ownershipType}` as "ownership_company")} />
        <Row label={tp("rowCost")} value={tag.acquisitionCostCents != null ? formatCents(tag.acquisitionCostCents) : tp("noCost")} />
        {tag.internalUseNote ? <Row label={tp("rowInternalUse")} value={tag.internalUseNote} /> : null}
      </Rows>

      {/* key: re-seed the form whenever the saved piece changes */}
      <TransferField key={`move-${tag.updatedAt}`} />

      <div className="flex flex-col items-start gap-4 border-t border-white/10 pt-4 sm:flex-row">
        <div className="w-36 shrink-0 rounded-xl bg-white p-2">
          <img src={`${qrBase}/qr.svg?v=${encodeURIComponent(tag.publicCode)}`} alt={tm("qrAlt", { code: tag.publicCode })} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className={EYEBROW}>{tm("downloadQr")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" className="min-h-10">
              <a href={`${qrBase}/qr.svg?download=1`} download={`${tag.publicCode}.svg`}>
                <Download className="h-3.5 w-3.5" />SVG
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm" className="min-h-10">
              <a href={`${qrBase}/qr.png?download=1`} download={`${tag.publicCode}.png`}>
                <Download className="h-3.5 w-3.5" />PNG
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Rarely needed: the QR is printed and the chip written by the NFC tools. */}
      <details className="group border-t border-white/10 pt-3" data-testid="admin-piece-technical">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          {tm("technicalDetails")}
        </summary>
        <div className="mt-3 space-y-3">
          <PieceStatusChips tag={tag} />
          <div>
            <CopyRow label={tm("qrUrlLabel")} value={tag.qrUrl} />
            <p className="mt-1 text-xs text-white/40">{tm("qrUrlHint")}</p>
          </div>
          <div>
            <CopyRow label={tm("nfcUrlLabel")} value={tag.nfcUrl} />
            <p className="mt-1 text-xs text-white/40">{tm("nfcUrlHint")}</p>
          </div>
          {/* Only the dates that happened. */}
          <Rows>
            {tag.assignedAt ? <Row label={tm("rowAssigned")} value={formatDateTime(tag.assignedAt)} /> : null}
            {tag.activatedAt ? <Row label={tm("rowActivated")} value={formatDateTime(tag.activatedAt)} /> : null}
            {tag.disabledAt ? <Row label={tm("rowDisabled")} value={formatDateTime(tag.disabledAt)} /> : null}
            <Row label={tm("colLastInteraction")} value={formatDateTime(tag.lastInteractionAt)} />
            <Row label={tm("rowCreated")} value={formatDateTime(tag.createdAt)} />
          </Rows>
        </div>
      </details>

      <PieceSettings key={`settings-${tag.updatedAt}`} />

      <HeavyActions />
    </section>
  );
}

/**
 * Transfer an unsold piece in stock to another reseller (they become its custodian of company stock), or
 * Take it back to house stock (a return that closes the reseller's purchase cost). Server: setTagRep.
 */
function TransferField() {
  const { tag, notify } = usePiece();
  const tm = useT(manageTagsPiecesMessages);
  const tc = useT(commonMessages);
  const tp = useT(pieceScreenMessages);
  const labels = useTagLabels();
  const write = usePieceWrite();
  const { data: reps = [], error } = useReps();
  const current = tag.repId ? String(tag.repId) : HOUSE;
  // Nothing is asked until a button is pressed: a piece in company stock is handed out, a piece with a reseller is taken back or moved.
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const [confirming, setConfirming] = useState<"house" | "rep" | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const options = reps.filter((r) => String(r.id) !== current).map((r) => ({ value: String(r.id), label: labels.repOption(r) }));
  const toHouse = confirming === "house";
  const target = toHouse ? tm("houseStockTarget") : options.find((o) => o.value === choice)?.label ?? tm("thisReseller");
  // The server's rules (repository setTagRep), said before the click.
  const blocker = tag.saleId !== null ? tm("moveBlockedSold")
    : tag.stockStatus !== "available" ? tm("moveBlockedStock")
    : tag.status !== "inventory" ? tm("moveBlockedSetUp")
    : null;
  const consequences = [
    toHouse ? tm("moveToHouseConsequence") : tm("moveToRepConsequence", { target }),
    tag.kitId ? tm("moveLeavesKit") : null,
  ].filter(Boolean).join(" ");
  const verb = toHouse ? tp("takeBack") : tm("move");
  // A piece nobody has in stock (not here yet, sold, lost, deactivated) cannot be moved, and says why only where it is not obvious.
  if (!pieceHasLocation(tag)) return null;

  const submit = async () => {
    setMoveError(null);
    try {
      await write("PATCH", `/api/xpot/admin/tags/${tag.id}/rep`, { repId: toHouse ? null : Number(choice) });
      notify({ tone: "ok", text: tm("resellerUpdated") });
    } catch (err) {
      setMoveError(errorText(err, tc("requestFailed")));
      throw err;
    }
  };

  return (
    <div className="space-y-2 border-t border-white/10 pt-4">
      {blocker ? (
        // No control for what cannot be done: the one sentence that says why.
        <p className="text-sm text-white/55" data-testid="admin-piece-move-blocked">{blocker}</p>
      ) : picking ? (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Select id={`piece-holder-${tag.id}`} aria-label={tm("chooseReseller")} value={choice} onChange={(e) => setChoice(e.target.value)} placeholder={tm("chooseReseller")} options={options} data-testid="admin-piece-rep" />
          </div>
          <Button type="button" variant="secondary" className="shrink-0" disabled={!choice} onClick={() => setConfirming("rep")} data-testid="admin-piece-rep-move">
            <Truck className="h-3.5 w-3.5" />{tm("move")}
          </Button>
          <Button type="button" variant="ghost" className="shrink-0" onClick={() => { setPicking(false); setChoice(""); }}>{tc("cancel")}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {current !== HOUSE ? (
            <Button type="button" variant="secondary" onClick={() => setConfirming("house")} data-testid="admin-piece-take-back">
              <Undo2 className="h-3.5 w-3.5" />{tp("takeBack")}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setPicking(true)} data-testid="admin-piece-give">
            <Truck className="h-3.5 w-3.5" />{current === HOUSE ? tm("giveToReseller") : tm("moveToAnotherReseller")}
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-red-300">{tm("resellersFailed")}</p> : null}
      <ConfirmDialog
        accent="tags"
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={toHouse ? tp("takeBackTitle", { code: tag.publicCode }) : tm("moveTitle", { code: tag.publicCode, target })}
        description={consequences}
        confirmLabel={verb}
        error={moveError}
        onConfirm={() => submit()}
      />
    </div>
  );
}

/** Piece type, face and internal label; the catalog product when missing (admin: without one it can never be sold). */
function PieceSettings() {
  const { tag, viewer, notify } = usePiece();
  const tm = useT(manageTagsPiecesMessages);
  const tg = useT(manageTagsMessages);
  const tb = useT(manageTagsBatchesMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const write = usePieceWrite();
  const [label, setLabel] = useState(tag.label ?? "");
  const [productType, setProductType] = useState<string>(tag.productType);
  const [face, setFace] = useState<string>(tag.ownFace ?? "");
  const missingProduct = viewer.isAdmin && tag.salesProductId === null;
  const [salesProductId, setSalesProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: catalog = [] } = useTagCatalog();
  const dirty = label.trim() !== (tag.label ?? "") || productType !== tag.productType || (face || null) !== tag.ownFace || !!salesProductId;
  if (tag.status === "retired" || tag.stockStatus === "damaged") return null;

  const save = async () => {
    setSaving(true);
    try {
      await write("PATCH", `/api/xpot/admin/tags/${tag.id}`, { label, productType, face: face || null, ...(salesProductId ? { salesProductId: Number(salesProductId) } : {}) });
      setSalesProductId("");
      notify({ tone: "ok", text: tm("pieceSaved") });
    } catch (err) {
      notify({ tone: "error", text: errorText(err, tc("requestFailed")) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="group border-t border-white/10 pt-3">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        {tm("pieceSettings")}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {missingProduct ? (
          <Field label={tb("fieldCatalogProduct")} hint={<span className="text-amber-300/80">{tm("noCatalogProduct")}</span>} className="sm:col-span-2">
            <Select value={salesProductId} onChange={(e) => setSalesProductId(e.target.value)} placeholder={tb("chooseCatalogProduct")} options={catalogOptions(catalog)} data-testid="admin-piece-catalog" />
          </Field>
        ) : null}
        <Field label={tm("productType")}>
          <Select value={productType} onChange={(e) => setProductType(e.target.value)} options={labels.productOptions} />
        </Field>
        <Field label={tm("internalLabel")}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder={tm("optional")} />
        </Field>
        <Field label={tg("printedOnPiece")} className="sm:col-span-2">
          <Select value={face} onChange={(e) => setFace(e.target.value)} placeholder={tag.batchCode ? tm("sameAsBatch") : tm("fromProduct")} options={labels.faceOptions} />
        </Field>
      </div>
      <Button type="button" variant="secondary" className="mt-3" disabled={!dirty || !productType} loading={saving} onClick={() => void save()}>
        {tm("saveDetails")}
      </Button>
    </details>
  );
}

/** Retire, restore, mark damaged: one sheet, each with what it does and whether it can be undone. */
function HeavyActions() {
  const { tag, viewer, notify } = usePiece();
  const tm = useT(manageTagsPiecesMessages);
  const tc = useT(commonMessages);
  const tp = useT(pieceScreenMessages);
  const write = usePieceWrite();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<HeavyAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const damaged = tag.stockStatus === "damaged";
  const canDamage = tag.status === "inventory" && tag.repId === null && tag.leadId === null && (tag.stockStatus === "available" || tag.stockStatus === "pending");
  // What cannot be done is not offered. A broken piece that is already out with a customer or a reseller has no path here: Deactivate it.
  const items: Array<{ action: HeavyAction; icon: typeof Archive; reversible: boolean }> = [];
  if (!damaged && planTransition(tag, "retire").ok) items.push({ action: "retire", icon: Archive, reversible: true });
  if (!damaged && planTransition(tag, "restore").ok) items.push({ action: "restore", icon: RotateCcw, reversible: true });
  if (!damaged && tag.status !== "retired" && canDamage) items.push({ action: "damage", icon: Ban, reversible: false });
  // Deactivating a piece the customer already paid for says so.
  const describe = (action: HeavyAction) => [tm(`action_${action}_description`), action === "retire" && pieceIsSold(tag) ? tm("retireSoldWarning") : null].filter(Boolean).join(" ");

  const confirm = async (reason: string) => {
    if (!pending) return;
    setActionError(null);
    try {
      await write("POST", pieceActionUrl(viewer.surface, pending, tag.id), { reason });
      notify({ tone: "ok", text: tm("pieceUpdated") });
    } catch (err) {
      setActionError(errorText(err, tc("requestFailed")));
      throw err;
    }
  };

  return (
    <div className="border-t border-white/10 pt-3">
      {damaged ? (
        <div data-testid="admin-piece-damaged-banner">
          <InlineAlert tone="error" icon={Ban}>{tm("damagedExplain")}</InlineAlert>
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)} disabled={items.length === 0} data-testid="button-piece-more">
          <MoreHorizontal className="!size-4" />
          {tp("moreActions")}
        </Button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title={tp("moreActionsTitle", { code: tag.publicCode })}>
        <ul className="space-y-2">
          {items.map(({ action, icon: Icon, reversible }) => (
            <li key={action}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setActionError(null);
                  setPending(action);
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.06]"
                data-testid={`piece-more-${action}`}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${action === "restore" ? "text-white/60" : "text-red-400"}`} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{tm(`action_${action}_confirm`)}</span>
                    <Pill tone={reversible ? "slate" : "red"}>{reversible ? tp("reversible") : tp("irreversible")}</Pill>
                  </span>
                  <span className="block text-sm text-white/55">{describe(action)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <ConfirmDialog
        accent="tags"
        open={pending !== null}
        onOpenChange={(v) => !v && setPending(null)}
        title={pending ? tm(`action_${pending}_title`) : ""}
        description={pending ? describe(pending) : null}
        confirmLabel={pending ? tm(`action_${pending}_confirm`) : null}
        tone={pending === "restore" ? "default" : "danger"}
        reason={pending === "damage" ? "required" : "optional"}
        // A reason is what a damaged piece asks for (the warning already says it cannot be undone), so it is asked in its own words and there is no second hurdle.
        reasonPlaceholder={pending === "damage" ? tm("reasonRequiredPlaceholder") : tm("reasonPlaceholder")}
        error={actionError}
        testId="admin-piece-action-confirm"
        onConfirm={(reason) => confirm(reason)}
      >
        {pending ? <Pill tone={pending === "damage" ? "red" : "slate"}>{pending === "damage" ? tp("irreversible") : tp("reversible")}</Pill> : null}
      </ConfirmDialog>
    </div>
  );
}
