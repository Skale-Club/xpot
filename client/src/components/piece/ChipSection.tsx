import { useEffect, useState, type ReactNode } from "react";
import { Lock, Nfc, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import WriteSheet, { manualSteps, manualTitle, type WriteResult } from "@/pages/tags/WriteSheet";
import LockSheet from "@/pages/tags/LockSheet";
import { canLockChip, nfcMode } from "@/pages/tags/webNfc";
import { tagPath } from "@/pages/tags/lib";
import { CARD, CHIP_TONE, CopyButton, EYEBROW_MUTED, Pill, Spinner, StepList } from "@/pages/tags/ui";
import { usePiece, usePieceWrite } from "./PieceContext";

// The NFC chip, for every role: written right here on an Android phone; on an
// iPhone the link goes into NFC Tools and a tap that reads the chip confirms it
// (the host screen polls for that); on a computer the write continues on the
// phone (a QR). The global admin also gets the desktop writer (`desktopWriter`).
// Locking makes the chip read-only for good, and its sheet says so before the tap.

export function ChipSection({ desktopWriter }: {
  /** The admin's desktop NFC writer card (pages/admin/tags), under the phone controls. */
  desktopWriter?: ReactNode;
}) {
  const { tag, viewer } = usePiece();
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const write = usePieceWrite();
  // A phone without Web NFC (iPhone): written with NFC Tools, confirmed by a real tap.
  // A computer or an iPad has no NFC: the write continues on the phone (a QR).
  const nfc = nfcMode();
  const manualFlow = nfc === "app";
  const [writeOpen, setWriteOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  // iPhone: the NFC Tools steps, shown by themselves until the chip is confirmed, then on "Rewrite".
  const [manualOpen, setManualOpen] = useState(false);

  const locked = tag.nfcStatus === "locked";
  const chipMissing = tag.nfcStatus === "not_programmed" || tag.nfcStatus === "failed";
  const chipConfirmed = tag.nfcStatus === "verified";
  const retired = tag.status === "retired" || tag.stockStatus === "damaged";
  // Another phone locks only a chip a tap confirmed (lock a wrong chip and it is lost);
  // a computer cannot lock, so it gets no padlock.
  const canLock = !locked && !retired && (manualFlow ? chipConfirmed : nfc === "web" && canLockChip() && !chipMissing);

  // "Continue on the phone" (…?write=1) opens the write straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("write") !== "1") return;
    params.delete("write");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    // On an iPhone the steps are already at the top of the section.
    if (!manualFlow) setWriteOpen(true);
  }, [tag.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onWritten = async (result: WriteResult) => {
    await write("POST", `/api/xpot/tags/${tag.id}/nfc-written`, { readbackUrl: result.readbackUrl, method: result.method });
  };

  return (
    <section className={`${CARD} p-4`} data-testid="chip-card">
      <div className="flex items-center justify-between gap-2">
        <p className={EYEBROW_MUTED}>{t("chipTitle")}</p>
        <div className="flex items-center gap-1">
          <Pill tone={CHIP_TONE[tag.nfcStatus] ?? "amber"}>{t(`chip_${tag.nfcStatus}` as "chip_verified")}</Pill>
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
      ) : retired ? null : manualFlow && (!chipConfirmed || manualOpen) ? (
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
        <Button
          type="button"
          variant={chipMissing ? "brand" : "secondary"}
          accent="tags"
          size="lg"
          onClick={() => (manualFlow ? setManualOpen(true) : setWriteOpen(true))}
          className="mt-3 w-full"
          data-testid="button-write-chip"
        >
          <Nfc className="!size-5" />
          {chipMissing ? t("writeChip") : t("rewriteChip")}
        </Button>
      )}

      {desktopWriter && viewer.isAdmin ? <div className="mt-4">{desktopWriter}</div> : null}

      <LockSheet
        open={lockOpen}
        identity="xpot"
        onClose={() => setLockOpen(false)}
        onLocked={async () => {
          await write("POST", `/api/xpot/tags/${tag.id}/nfc-locked`);
        }}
      />
      <WriteSheet
        open={writeOpen}
        url={tag.nfcUrl}
        identity="xpot"
        onClose={() => setWriteOpen(false)}
        onDone={onWritten}
        onLock={() => setLockOpen(true)}
        confirmed={tag.nfcStatus === "verified" || tag.nfcStatus === "locked"}
        continueUrl={`${window.location.origin}${tagPath(tag.publicCode)}?write=1`}
      />
    </section>
  );
}
