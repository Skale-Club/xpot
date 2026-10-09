import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, Nfc, Smartphone, X } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic } from "./lib";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, BottomSheet, CopyButton, EYEBROW_MUTED, SHEET_TITLE, Spinner, TapAnimation, type Identity } from "./ui";
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
function manualSteps(value: string) {
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

  const errorBox = phase === "error" && error && (
    <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100">
      {error}
    </p>
  );

  return (
    <BottomSheet open={open} onClose={close} title={t("writeTitle")}>
      <div className="flex items-center justify-between">
        <h2 className={SHEET_TITLE}>{t("writeTitle")}</h2>
        <button type="button" onClick={close} aria-label={tc("close")} className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 active:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
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
              <div className="mt-3 rounded-2xl border border-blue-400/25 bg-blue-500/[0.08] p-3 text-left" data-testid="iphone-confirm">
                <p className="flex items-center gap-2 text-sm font-bold text-white">
                  <Spinner className="h-4 w-4 text-blue-300" />
                  {t("iphoneConfirmTitle")}
                </p>
                <p className="mt-1 text-sm text-white/60">{t("iphoneConfirmHint")}</p>
              </div>
            )
          ) : (
            !lastVerified && <p className="mt-1 text-sm text-white/50">{t("notReadBack")}</p>
          )}
          <button type="button" onClick={close} className={`${BTN_PRIMARY} mt-5`}>
            {tc("done")}
          </button>
          {/* Android locks right away; an iPhone once a real tap confirmed the write (lock a wrong chip and it is lost). */}
          {onLock && (supported || confirmed) && (
            <button
              type="button"
              onClick={() => {
                close();
                onLock();
              }}
              className={`${BTN_TERTIARY} mt-2`}
              data-testid="button-write-then-lock"
            >
              <Lock className="h-5 w-5 text-amber-300" />
              {t("lockNow")}
            </button>
          )}
        </div>
      ) : phase === "writing" ? (
        <>
          <TapAnimation identity={identity} icon={Nfc} label={t("holdChip")} sub={t("holdChipSub")} />
          <button
            type="button"
            onClick={() => {
              cancel();
              setPhase("idle");
            }}
            className={BTN_TERTIARY}
          >
            {tc("cancel")}
          </button>
        </>
      ) : phase === "verifying" ? (
        <>
          <TapAnimation identity={identity} icon={Nfc} label={t("tapAgain")} sub={t("tapAgainSub")} />
          <button type="button" onClick={skipVerify} className={BTN_TERTIARY}>
            {t("skipCheck")}
          </button>
        </>
      ) : phase === "saving" ? (
        <div className="flex flex-col items-center py-8 text-white/60">
          <Spinner className="h-8 w-8" />
          <p className="mt-3 text-sm">{t("saving")}</p>
        </div>
      ) : supported ? (
        <div className="mt-5 space-y-3">
          {errorBox}
          <button type="button" onClick={() => void startWrite()} className={BTN_PRIMARY} data-testid="button-write-now">
            <Nfc className="h-5 w-5" />
            {phase === "error" ? tc("retry") : t("writeNow")}
          </button>
          <button
            type="button"
            onClick={() => void report({ method: "manual", verified: false, readbackUrl: null })}
            className="min-h-[44px] w-full text-sm font-semibold text-white/45 active:text-white"
          >
            {t("wroteElsewhere")}
          </button>
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
              <ol className="mt-3 space-y-2">
                {manualSteps(url).map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm text-white/75">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-300">{i + 1}</span>
                    <span className="pt-0.5">{t(step)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {errorBox && <div className="mt-4">{errorBox}</div>}
          <button
            type="button"
            onClick={() => void report({ method: "manual", verified: false, readbackUrl: null })}
            className={`${BTN_SECONDARY} mt-5`}
            data-testid="button-mark-written"
          >
            <Check className="h-5 w-5" />
            {t("markWritten")}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
