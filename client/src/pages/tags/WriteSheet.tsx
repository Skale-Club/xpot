import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, Nfc, RotateCw, Smartphone } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic } from "./lib";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { BottomSheet, CARD, CopyButton, EYEBROW_MUTED, SHEET_TITLE, SheetActions, Spinner, StepList, TapAnimation, type Identity } from "./ui";
import { isWebNfcSupported, mapNfcError, readBack, writeContent } from "./webNfc";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { contentKindOf } from "@shared/chipContent";
import { ContinueOnPhone } from "./ContinueOnPhone";

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
  onDone: (result: WriteResult) => Promise<void> | void;
  /** This screen on the phone; desktop shows it as a QR. */
  continueUrl?: string;
  continueHint?: string;
  /** Offered once the chip is written: seal it so nobody can rewrite it (LockSheet). */
  onLock?: () => void;
  /** Xpot pieces: the chip was confirmed by a real tap (server side), e.g. after an iPhone write. */
  confirmed?: boolean;
}

type Phase = "idle" | "writing" | "verifying" | "saving" | "done" | "error";

/** NFC Tools on iPhone: the record to add depends on what is written. */
export function manualSteps(value: string) {
  const kind = contentKindOf(value);
  if (kind === "vcard") return ["manual1", "manual2", "manual3Contact", "manual4Contact", "manual5"] as const;
  if (kind === "email" || kind === "phone") return ["manual1", "manual2", "manual3Uri", "manual4", "manual5"] as const;
  return ["manual1", "manual2", "manual3", "manual4", "manual5"] as const;
}

export default function WriteSheet({ open, url, identity, onClose, onDone, continueUrl, continueHint, onLock, confirmed }: Props) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const supported = isWebNfcSupported();
  const isDesktop = useIsDesktop();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastVerified, setLastVerified] = useState(false);
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
    }
    return cancel;
  }, [open, cancel]);

  const report = useCallback(
    async (result: WriteResult) => {
      setPhase("saving");
      try {
        await onDone(result);
        haptic([60, 40, 60]);
        setLastVerified(result.verified);
        setPhase("done");
      } catch (err) {
        setError(errorText(err, tc("requestFailed")));
        setPhase("error");
      }
    },
    [onDone, tc],
  );

  const startWrite = useCallback(async () => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("writing");
    try {
      await writeContent(url, ctrl.signal);
      haptic(40);
      setPhase("verifying");
      const readback = await readBack(ctrl.signal);
      if (readback === url) return await report({ method: "web_nfc", verified: true, readbackUrl: readback });
      setError(readback ? t("chipOtherLink", { url: readback }) : t("chipNoLink"));
      setPhase("error");
    } catch (err) {
      const e = mapNfcError(err);
      if (e.silent) return;
      setError(t(e.code));
      setPhase("error");
    }
  }, [url, cancel, report, t]);

  const skipVerify = useCallback(() => {
    cancel();
    void report({ method: "web_nfc", verified: false, readbackUrl: null });
  }, [cancel, report]);

  const close = () => {
    cancel();
    onClose();
  };

  const errorBox = phase === "error" && error && <InlineAlert tone="error">{error}</InlineAlert>;

  return (
    <BottomSheet open={open} onClose={close} title={t("writeTitle")}>
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
          {/* No read-back (iPhone + NFC Tools): a real tap on the chip confirms it on the server. */}
          {!lastVerified && identity === "xpot" && !supported ? (
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
            {/* Android locks right away; an iPhone once a real tap confirmed the write (lock a wrong chip and it is lost). */}
            {onLock && (supported || confirmed) && (
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
          <Button type="button" variant="secondary" size="lg" onClick={skipVerify} className="w-full">
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
          <SheetActions>
            <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void startWrite()} className="w-full" data-testid="button-write-now">
              {phase === "error" ? <RotateCw className="!size-5" /> : <Nfc className="!size-5" />}
              {phase === "error" ? tc("retry") : t("writeNow")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void report({ method: "manual", verified: false, readbackUrl: null })} className="w-full">
              {t("wroteElsewhere")}
            </Button>
          </SheetActions>
        </div>
      ) : (
        <div className="mt-5">
          {isDesktop && continueUrl ? (
            <ContinueOnPhone url={continueUrl} hint={continueHint} />
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Smartphone className="h-4 w-4" />
                {t("iphoneTitle")}
              </div>
              <StepList className="mt-3" steps={manualSteps(url).map((step) => ({ key: step, text: t(step) }))} />
            </>
          )}
          {errorBox && <div className="mt-4">{errorBox}</div>}
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
        </div>
      )}
    </BottomSheet>
  );
}
