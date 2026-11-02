import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Eraser, Lock, Nfc, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { pieceCustodyMessages } from "@/i18n/messages/pieceCustody";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import WriteSheet, { manualSteps, manualTitle, type WriteResult } from "@/pages/tags/WriteSheet";
import LockSheet from "@/pages/tags/LockSheet";
import EraseSheet from "@/pages/tags/EraseSheet";
import { canLockChip, nfcMode } from "@/pages/tags/webNfc";
import { tagPath } from "@/pages/tags/lib";
import { CARD, CopyButton, EYEBROW_MUTED, Pill, Spinner, StepList } from "@/pages/tags/ui";
import { usePiece, usePieceWrite, type PieceCommandsRef } from "./PieceContext";
import { usePieceChipLabel } from "./PieceStatusPill";
import { pieceChipState, type PieceChipState } from "./pieceStatus";
import { pieceSituation } from "./pieceView";

// The NFC chip, for every role: written right here on an Android phone; on an
// iPhone the link goes into NFC Tools and a tap that reads the chip confirms it
// (the host screen polls for that); on a computer the write continues on the
// phone (a QR). The global admin also gets the desktop writer (`desktopWriter`).
// Locking makes the chip read-only for good, and its sheet says so before the tap.
// A piece that is lost, not in stock yet, damaged or deactivated has nothing to write: it only says what the chip holds.
// The chip is the one brand button only when it is the piece's next step (pieceSituation); the red is a write that failed.

/** The chip's colour here: red only for a failed write, amber for what asks for a step, quiet where no chip is asked for yet. */
const CHIP_PILL_TONE: Record<PieceChipState, "slate" | "amber" | "red" | "green"> = { none: "slate", needsWriting: "amber", failed: "red", untested: "amber", fine: "green" };

export function ChipSection({ desktopWriter, commands }: {
  /** The admin's desktop NFC writer card (pages/admin/tags), under the phone controls. */
  desktopWriter?: ReactNode;
  /** The body's main action button starts the write from here (PieceCommands). */
  commands?: PieceCommandsRef;
}) {
  const { tag, viewer } = usePiece();
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tcu = useT(pieceCustodyMessages);
  const tm = useT(manageTagsPiecesMessages);
  const write = usePieceWrite();
  // A phone without Web NFC (iPhone): written with NFC Tools, confirmed by a real tap.
  // A computer or an iPad has no NFC: the write continues on the phone (a QR).
  const nfc = nfcMode();
  const manualFlow = nfc === "app";
  const [writeOpen, setWriteOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  // iPhone: the NFC Tools steps, shown by themselves until the chip is confirmed, then on "Rewrite".
  // Closed until "Write chip" is tapped (or the write was continued from a computer): a piece nobody is writing shows no steps.
  const [manualOpen, setManualOpen] = useState(() => new URLSearchParams(window.location.search).get("write") === "1");

  const locked = tag.nfcStatus === "locked";
  const chipMissing = tag.nfcStatus === "not_programmed" || tag.nfcStatus === "failed";
  const chipConfirmed = tag.nfcStatus === "verified";
  const retired = tag.status === "retired" || tag.stockStatus === "damaged";
  // Nothing to write on a piece that is gone or not here yet.
  const idle = retired || tag.stockStatus === "lost" || tag.stockStatus === "pending";
  const chipState = pieceChipState(tag);
  // Where the chip asks for a step it says it in the words of the lists ("Not written", "Not tested").
  const chipWords = usePieceChipLabel()(tag);
  const chipAsksForStep = chipState === "needsWriting" || chipState === "failed" || chipState === "untested";
  const chipIsNextStep = pieceSituation(tag, viewer).action?.kind === "writeChip";
  const pillTone = chipState === "none" && (tag.nfcStatus === "verified" || tag.nfcStatus === "locked") ? "green" : CHIP_PILL_TONE[chipState];
  // Another phone locks only a chip a tap confirmed (lock a wrong chip and it is lost);
  // a computer cannot lock, so it gets no padlock.
  const canLock = !locked && !idle && (manualFlow ? chipConfirmed : nfc === "web" && canLockChip() && !chipMissing);
  // Erasing a written chip (testing the piece, or starting over) needs a phone; a locked chip can't be erased.
  const canErase = !locked && !idle && nfc !== "none" && tag.nfcStatus !== "not_programmed";

  useEffect(() => {
    // On an iPhone the steps are already shown until the chip is confirmed; the button opens them again.
    if (commands) commands.current.writeChip = () => (manualFlow ? setManualOpen(true) : setWriteOpen(true));
  });

  // "Continue on the phone" (…?write=1) opens the write straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("write") !== "1") return;
    params.delete("write");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    // On an iPhone the steps are already open (see manualOpen).
    if (!manualFlow) setWriteOpen(true);
  }, [tag.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onWritten = async (result: WriteResult, signal?: AbortSignal) => {
    await write("POST", `/api/xpot/tags/${tag.id}/nfc-written`, { readbackUrl: result.readbackUrl, method: result.method }, signal);
  };

  return (
    <section className={`${CARD} p-4`} data-testid="chip-card">
      <div className="flex items-center justify-between gap-2">
        <p className={EYEBROW_MUTED}>{t("chipTitle")}</p>
        <div className="flex items-center gap-1">
          <Pill tone={pillTone}>{chipAsksForStep ? chipWords.label : t(`chip_${tag.nfcStatus}` as "chip_verified")}</Pill>
          {canLock && (
            // Neutral: locking is optional; the green "Chip locked" pill is what it leads to.
            <button
              type="button"
              onClick={() => setLockOpen(true)}
              aria-label={t("lockNow")}
              title={t("lockNow")}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white active:bg-white/10"
              data-testid="button-lock-chip"
            >
              <Lock className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {locked ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-white/60">
          <Lock className="h-4 w-4 shrink-0 text-emerald-300" />
          {t("lockedHint")}
        </p>
      ) : idle ? null : manualFlow && manualOpen ? (
        <div className="mt-3 space-y-3" data-testid="chip-manual">
          <div className={`${CARD} p-3`}>
            <p className={EYEBROW_MUTED}>{t("writeUrl")}</p>
            <p className="mt-1 break-all font-mono text-sm tracking-wide text-white" data-testid="text-write-url">
              {tag.nfcUrl}
            </p>
          </div>
          <CopyButton text={tag.nfcUrl} label={t("copyLink")} large />
          <p className="flex items-center gap-2 pt-1 text-sm font-bold text-white">
            <Smartphone className="h-4 w-4" />
            {t(manualTitle())}
          </p>
          <StepList
            steps={[
              ...manualSteps(tag.nfcUrl).map((step) => ({ key: step, text: t(step) })),
              { key: "iphoneConfirmTitle", text: t("iphoneConfirmTitle"), hint: t("iphoneConfirmHint") },
            ]}
          />
          {chipConfirmed ? (
            <Button type="button" variant="secondary" size="lg" onClick={() => setManualOpen(false)} className="w-full">
              {tc("done")}
            </Button>
          ) : (
            <div data-testid="chip-waiting-read">
              <InlineAlert tone="info" title={t("chipWaitingRead")} action={<Spinner className="h-4 w-4 text-blue-300" />} />
            </div>
          )}
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant={chipIsNextStep ? "brand" : "secondary"}
            accent="tags"
            size="lg"
            onClick={() => (manualFlow ? setManualOpen(true) : setWriteOpen(true))}
            className="mt-3 w-full"
            data-testid="button-write-chip"
          >
            <Nfc className="!size-5" />
            {chipMissing ? t("writeChip") : t("rewriteChip")}
          </Button>
          {canErase && (
            <Button type="button" variant="ghost" onClick={() => setEraseOpen(true)} className="mt-2 w-full" data-testid="button-erase-chip">
              <Eraser className="!size-4" />
              {tcu("eraseChip")}
            </Button>
          )}
        </>
      )}

      {/* The desk writer is another way to write the same chip: inside this card, open when the chip is the next step. */}
      {desktopWriter && viewer.isAdmin && !idle ? (
        <details className="group mt-3 border-t border-white/10 pt-2" open={chipIsNextStep} data-testid="chip-desk-writer">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            {tm("nfcCardTitle")}
          </summary>
          <div className="mt-2">{desktopWriter}</div>
        </details>
      ) : null}

      <LockSheet
        open={lockOpen}
        identity="xpot"
        onClose={() => setLockOpen(false)}
        onLocked={async (signal) => {
          await write("POST", `/api/xpot/tags/${tag.id}/nfc-locked`, {}, signal);
        }}
      />
      <EraseSheet
        open={eraseOpen}
        identity="xpot"
        onClose={() => setEraseOpen(false)}
        onErased={async (signal) => {
          await write("POST", `/api/xpot/tags/${tag.id}/nfc-erased`, {}, signal);
        }}
      />
      <WriteSheet
        open={writeOpen}
        url={tag.nfcUrl}
        identity="xpot"
        onClose={() => setWriteOpen(false)}
        onDone={onWritten}
        registerWrite
        onLock={() => setLockOpen(true)}
        confirmed={tag.nfcStatus === "verified" || tag.nfcStatus === "locked"}
        continueUrl={`${window.location.origin}${tagPath(tag.publicCode)}?write=1`}
      />
    </section>
  );
}
