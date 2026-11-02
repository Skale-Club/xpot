import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, Nfc, RotateCw, Smartphone } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic, isIos } from "./lib";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BottomSheet, CARD, CopyButton, EYEBROW_MUTED, SHEET_TITLE, SheetActions, Spinner, StepList, TapAnimation, type Identity } from "./ui";
import { canLockChip, mapNfcError, nfcMode, readBack, writeContent } from "./webNfc";
import { contentKindOf } from "@shared/chipContent";
import { ContinueOnPhone } from "./ContinueOnPhone";
import { ChipSaveTimeout, saveChipProgress } from "./saveChipProgress";

export interface WriteResult {
  method: "web_nfc" | "manual";
  /** True only when the chip was read back and matched exactly. */
  verified: boolean;
  readbackUrl: string | null;
}

interface Props {
  open: boolean;
  url: string;
  identity: Identity;
  onClose: () => void;
  /** Report the result. May throw: the sheet shows the message and lets the user retry. */
  onDone: (result: WriteResult, signal?: AbortSignal) => Promise<void> | void;
  /** This screen on the phone; desktop shows it as a QR. */
  continueUrl?: string;
  continueHint?: string;
  /** Offered once the chip is written: seal it so nobody can rewrite it (LockSheet). */
  onLock?: () => void;
  /** Xpot pieces: the chip was confirmed by a real tap (server side), e.g. after an iPhone write. */
  confirmed?: boolean;
  /**
   * Report the write as soon as the chip holds the link, before the confirming tap: a chip that was written but never
   * confirmed (the sheet closed, the phone died) still counts as written. Xpot pieces; a direct write is one record.
   */
  registerWrite?: boolean;
}

type Phase = "idle" | "writing" | "verifying" | "saving" | "done" | "error";

/** NFC Tools on a phone without Web NFC: the record to add depends on what is written. */
export function manualSteps(value: string) {
  const kind = contentKindOf(value);
  // The chip antenna sits at the top of an iPhone, at the back of an Android phone.
  const last = isIos() ? "manual5" : "manual5Phone";
  if (kind === "vcard") return ["manual1", "manual2", "manual3Contact", "manual4Contact", last] as const;
  if (kind === "email" || kind === "phone") return ["manual1", "manual2", "manual3Uri", "manual4", last] as const;
  return ["manual1", "manual2", "manual3", "manual4", last] as const;
}

/** The heading over those steps: "On iPhone…" only on an iPhone. */
export const manualTitle = (): "iphoneTitle" | "nfcToolsTitle" => (isIos() ? "iphoneTitle" : "nfcToolsTitle");

export default function WriteSheet({ open, url, identity, onClose, onDone, continueUrl, continueHint, onLock, confirmed, registerWrite }: Props) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const nfc = nfcMode();
  const supported = nfc === "web";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastVerified, setLastVerified] = useState(false);
  const [chipWritten, setChipWritten] = useState(false);
  // The read-back found another link: verifying again cannot help, only writing again can.
  const [otherLink, setOtherLink] = useState(false);
  // "I wrote it with another app" asks once before it marks anything.
  const [askElsewhere, setAskElsewhere] = useState(false);
  // The early save (registerWrite): kept apart from abortRef so closing the sheet never cancels it.
  const earlyRef = useRef<Promise<boolean> | null>(null);
  // The chip is written but saving that failed: a retry saves again instead of asking for another tap.
  const [unsaved, setUnsaved] = useState<WriteResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      cancel();
      setPhase("idle");
      setError(null);
      setUnsaved(null);
      setChipWritten(false);
      setOtherLink(false);
      setAskElsewhere(false);
    }
    return cancel;
  }, [open, cancel]);

  const report = useCallback(
    async (result: WriteResult, signal?: AbortSignal) => {
      if (signal?.aborted) return;
      cancel();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError(null);
      setPhase("saving");
      // The early save went first: the later report never lands before it.
      await earlyRef.current;
      if (ctrl.signal.aborted) return;
      try {
        await saveChipProgress((request) => onDone(result, request), ctrl.signal);
        if (ctrl.signal.aborted) return;
        haptic([60, 40, 60]);
        setUnsaved(null);
        setLastVerified(result.verified);
        setPhase("done");
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setUnsaved(result);
        setError(err instanceof ChipSaveTimeout ? t("chipSaveTimeout") : errorText(err, tc("requestFailed")));
        setPhase("error");
      }
    },
    [onDone, cancel, t, tc],
  );

  // The chip now holds the link: say so before anything else is asked of the person, so closing the sheet loses nothing.
  const registerEarly = useCallback(() => {
    if (!registerWrite) return;
    const ctrl = new AbortController();
    earlyRef.current = saveChipProgress((request) => onDone({ method: "web_nfc", verified: false, readbackUrl: null }, request), ctrl.signal).then(
      () => true,
      () => false,
    );
  }, [registerWrite, onDone]);

  const startWrite = useCallback(async (verifyOnly = false) => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setUnsaved(null);
    setOtherLink(false);
    setPhase(verifyOnly ? "verifying" : "writing");
    try {
      if (!verifyOnly) {
        setChipWritten(false);
        earlyRef.current = null;
        await writeContent(url, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setChipWritten(true);
        haptic(40);
        registerEarly();
        setPhase("verifying");
      }
      const readback = await readBack(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (readback === url) return await report({ method: "web_nfc", verified: true, readbackUrl: readback }, ctrl.signal);
      setOtherLink(!!readback);
      setError(readback ? t("chipOtherLink", { url: readback }) : t("chipNoLink"));
      setPhase("error");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const e = mapNfcError(err);
      if (e.silent) return;
      setError(t(e.code));
      setPhase("error");
    }
  }, [url, cancel, report, registerEarly, t]);

  const skipVerify = useCallback(async () => {
    cancel();
    // Already registered when the chip was written: nothing left to save, only to say so.
    if (earlyRef.current && (await earlyRef.current)) {
      setLastVerified(false);
      setPhase("done");
      return;
    }
    void report({ method: "web_nfc", verified: false, readbackUrl: null });
  }, [cancel, report]);

  const close = () => {
    cancel();
    onClose();
  };

  const errorBox = phase === "error" && error && <InlineAlert tone="error">{error}</InlineAlert>;

  // The chip was written with another app: Xpot cannot see that, so it asks once before it records it.
  const elsewhere = askElsewhere ? (
    <div className="space-y-2 rounded-xl border border-white/10 p-3" data-testid="write-elsewhere-ask">
      <p className="text-sm text-white/70">{t("wroteElsewhereAsk")}</p>
      <Button type="button" variant="secondary" onClick={() => void report({ method: "manual", verified: false, readbackUrl: null })} className="w-full" data-testid="button-write-elsewhere-yes">
        {t("wroteElsewhereYes")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setAskElsewhere(false)} className="w-full">
        {tc("cancel")}
      </Button>
    </div>
  ) : (
    <Button type="button" variant="ghost" onClick={() => setAskElsewhere(true)} className="w-full" data-testid="button-write-elsewhere">
      {t("wroteElsewhere")}
    </Button>
  );

  return (
    <BottomSheet open={open} onClose={close} title={t("writeTitle")} closeOnBack>
      <div className={`${CARD} p-4`}>
        <p className={EYEBROW_MUTED}>{t("writeUrl")}</p>
        <p className="mt-1 whitespace-pre-wrap break-all font-mono text-sm tracking-wide text-white" data-testid="text-write-url">
          {url}
        </p>
      </div>
      <div className="mt-3">
        <CopyButton text={url} label={t("copyLink")} large />
      </div>

      {phase === "done" ? (
        <div className="mt-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-10 w-10" />
          </div>
          <p className={`mt-3 ${SHEET_TITLE}`}>{lastVerified ? t("writtenChecked") : t("writtenMarked")}</p>
          {/* No read-back (NFC Tools on a phone): a real tap on the chip confirms it on the server. */}
          {!lastVerified && identity === "xpot" && nfc === "app" ? (
            confirmed ? (
              <p className="mt-2 text-sm font-semibold text-emerald-300" data-testid="iphone-confirmed">{t("iphoneConfirmed")}</p>
            ) : (
              <div className="mt-3 text-left" data-testid="iphone-confirm">
                <InlineAlert tone="info" title={t("iphoneConfirmTitle")} action={<Spinner className="h-4 w-4 text-blue-300" />}>
                  {t("iphoneConfirmHint")}
                </InlineAlert>
              </div>
            )
          ) : (
            !lastVerified && <p className="mt-1 text-sm text-white/50">{t("notReadBack")}</p>
          )}
          <SheetActions className="mt-5">
            <Button type="button" variant="brand" accent="tags" size="lg" onClick={close} className="w-full">
              {tc("done")}
            </Button>
            {/* Chrome on Android locks right away; another phone once a real tap confirmed the
                write (lock a wrong chip and it is lost); a computer cannot lock at all. */}
            {onLock && ((supported && canLockChip()) || (nfc === "app" && confirmed)) && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => {
                  close();
                  onLock();
                }}
                className="w-full"
                data-testid="button-write-then-lock"
              >
                <Lock className="!size-5" />
                {t("lockNow")}
              </Button>
            )}
          </SheetActions>
        </div>
      ) : phase === "writing" ? (
        <>
          <TapAnimation identity={identity} icon={Nfc} label={t("holdChip")} sub={t("holdChipSub")} />
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => {
              cancel();
              setPhase("idle");
            }}
            className="w-full"
          >
            {tc("cancel")}
          </Button>
        </>
      ) : phase === "verifying" ? (
        <>
          <TapAnimation identity={identity} icon={Nfc} label={t("tapAgain")} sub={t("tapAgainSub")} />
          <Button type="button" variant="secondary" size="lg" onClick={() => void skipVerify()} className="w-full">
            {t("skipCheck")}
          </Button>
        </>
      ) : phase === "saving" ? (
        <div className="flex flex-col items-center py-8 text-white/60">
          <Spinner className="h-8 w-8" />
          <p className="mt-3 text-sm">{t("saving")}</p>
        </div>
      ) : supported ? (
        <div className="mt-5 space-y-3">
          {errorBox}
          {chipWritten && !unsaved && !otherLink && <p className="text-sm text-white/70">{t("writtenNeedsCheck")}</p>}
          <SheetActions>
            {/* A chip that holds another link is wrong for good: the only way on is to write it again. */}
            <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void (unsaved ? report(unsaved) : otherLink ? startWrite() : startWrite(chipWritten))} className="w-full" data-testid="button-write-now">
              {phase === "error" ? <RotateCw className="!size-5" /> : <Nfc className="!size-5" />}
              {otherLink && !unsaved ? t("rewriteChip") : chipWritten && !unsaved ? t("verifyAgain") : phase === "error" ? tc("retry") : t("writeNow")}
            </Button>
            {chipWritten && !unsaved && !otherLink && (
              <>
                <Button type="button" variant="secondary" onClick={() => void startWrite()} className="w-full">{t("rewriteChip")}</Button>
                <Button type="button" variant="ghost" onClick={() => void skipVerify()} className="w-full">{t("skipCheck")}</Button>
              </>
            )}
            {otherLink ? null : elsewhere}
          </SheetActions>
        </div>
      ) : (
        <div className="mt-5">
          {nfc === "none" && continueUrl ? (
            <ContinueOnPhone url={continueUrl} hint={continueHint} />
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Smartphone className="h-4 w-4" />
                {t(manualTitle())}
              </div>
              <StepList className="mt-3" steps={manualSteps(url).map((step) => ({ key: step, text: t(step) }))} />
            </>
          )}
          {errorBox && <div className="mt-4">{errorBox}</div>}
          {nfc === "none" && continueUrl ? (
            // A computer writes nothing: the way on is the phone, so nothing here marks the chip as written at one click.
            <SheetActions className="mt-5">
              <Button type="button" variant="secondary" size="lg" onClick={close} className="w-full" data-testid="button-write-close">
                {tc("close")}
              </Button>
              {elsewhere}
            </SheetActions>
          ) : (
            // The last step of NFC Tools on an iPhone: the write is done, this says so.
            <Button
              type="button"
              variant="brand"
              accent="tags"
              size="lg"
              onClick={() => void report({ method: "manual", verified: false, readbackUrl: null })}
              className="mt-5 w-full"
              data-testid="button-mark-written"
            >
              <Check className="!size-5" />
              {t("markWritten")}
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
