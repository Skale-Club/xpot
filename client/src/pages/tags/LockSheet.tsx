import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, RotateCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic, isIos } from "./lib";
import { BottomSheet, SHEET_TITLE, SheetActions, Spinner, StepList, TapAnimation, type Identity } from "./ui";
import { canLockChip, lockChip, mapNfcError, nfcMode } from "./webNfc";

/**
 * Makes a written chip read-only for good, so nobody can rewrite it later.
 * An Xpot piece loses nothing (the chip only holds its code; the destination
 * lives on the server); a direct chip can never change what it opens again,
 * and the sheet says so before the tap.
 */
export default function LockSheet({ open, identity, onClose, onLocked }: {
  open: boolean;
  identity: Identity;
  onClose: () => void;
  /** Record the lock (Xpot pieces). May throw: the sheet shows the message. */
  onLocked?: () => Promise<void>;
}) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const [phase, setPhase] = useState<"idle" | "locking" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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

  const start = async () => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("locking");
    try {
      await lockChip(ctrl.signal);
      haptic([60, 40, 60]);
      setPhase("saving");
      await onLocked?.();
      setPhase("done");
    } catch (err) {
      const e = mapNfcError(err);
      if (e.silent) return setPhase("idle");
      setError(e.code === "nfcGeneric" ? errorText(err, t("nfcGeneric")) : t(e.code));
      setPhase("error");
    }
  };

  /** Another phone: locked with NFC Tools; record it. */
  const markLocked = async () => {
    setError(null);
    setPhase("saving");
    try {
      await onLocked?.();
      setPhase("done");
    } catch (err) {
      setError(errorText(err, t("nfcGeneric")));
      setPhase("error");
    }
  };

  const close = () => {
    cancel();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title={t("lockTitle")} icon={<Lock className="h-5 w-5 shrink-0 text-white/60" />}>
      {phase === "done" ? (
        <div className="mt-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-10 w-10" />
          </div>
          <p className={`mt-3 ${SHEET_TITLE}`}>{t("lockDone")}</p>
          <Button type="button" variant="brand" accent="tags" size="lg" onClick={close} className="mt-5 w-full">
            {tc("done")}
          </Button>
        </div>
      ) : phase === "locking" ? (
        <>
          <TapAnimation identity={identity} icon={Lock} label={t("lockHold")} sub={t("lockHoldSub")} />
          <Button type="button" variant="ghost" size="lg" onClick={() => { cancel(); setPhase("idle"); }} className="w-full">
            {tc("cancel")}
          </Button>
        </>
      ) : phase === "saving" ? (
        <div className="flex flex-col items-center py-8 text-white/60">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-white/70">{identity === "direct" ? t("lockExplainDirect") : t("lockExplainXpot")}</p>
          <InlineAlert tone="warning" icon={ShieldAlert}>
            <span className="font-semibold text-amber-100">{t("lockWarning")}</span>
          </InlineAlert>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          {canLockChip() ? (
            <SheetActions>
              <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void start()} className="w-full" data-testid="button-lock-now">
                {phase === "error" ? <RotateCw className="!size-5" /> : <Lock className="!size-5" />}
                {phase === "error" ? tc("retry") : t("lockNow")}
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={close} className="w-full">
                {tc("cancel")}
              </Button>
            </SheetActions>
          ) : nfcMode() === "app" ? (
            // Another phone: the app cannot lock; NFC Tools can, and the person tells us it is done.
            <>
              <StepList steps={(["lockIphone1", "lockIphone2", isIos() ? "lockIphone3" : "lockPhone3"] as const).map((step) => ({ key: step, text: t(step) }))} />
              <SheetActions>
                <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void markLocked()} className="w-full" data-testid="button-lock-marked">
                  <Lock className="!size-5" />
                  {t("lockIphoneDone")}
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={close} className="w-full">
                  {tc("cancel")}
                </Button>
              </SheetActions>
            </>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
