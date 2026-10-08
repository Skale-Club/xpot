import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, ShieldAlert, X } from "lucide-react";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic } from "./lib";
import { BTN_PRIMARY, BTN_TERTIARY, BottomSheet, SHEET_TITLE, Spinner, TapAnimation, type Identity } from "./ui";
import { canLockChip, lockChip, mapNfcError } from "./webNfc";

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

  const close = () => {
    cancel();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title={t("lockTitle")}>
      <div className="flex items-center justify-between">
        <h2 className={`${SHEET_TITLE} flex items-center gap-2`}>
          <Lock className="h-5 w-5 text-amber-300" />
          {t("lockTitle")}
        </h2>
        <button type="button" onClick={close} aria-label={tc("close")} className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 active:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      {phase === "done" ? (
        <div className="mt-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-10 w-10" />
          </div>
          <p className={`mt-3 ${SHEET_TITLE}`}>{t("lockDone")}</p>
          <button type="button" onClick={close} className={`${BTN_PRIMARY} mt-5`}>
            {tc("done")}
          </button>
        </div>
      ) : phase === "locking" ? (
        <>
          <TapAnimation identity={identity} icon={Lock} label={t("lockHold")} sub={t("lockHoldSub")} />
          <button type="button" onClick={() => { cancel(); setPhase("idle"); }} className={BTN_TERTIARY}>
            {tc("cancel")}
          </button>
        </>
      ) : phase === "saving" ? (
        <div className="flex flex-col items-center py-8 text-white/60">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-white/70">{identity === "direct" ? t("lockExplainDirect") : t("lockExplainXpot")}</p>
          <p className="flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
            {t("lockWarning")}
          </p>
          {error && (
            <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100">
              {error}
            </p>
          )}
          {canLockChip() ? (
            <button type="button" onClick={() => void start()} className={BTN_PRIMARY} data-testid="button-lock-now">
              <Lock className="h-5 w-5" />
              {phase === "error" ? tc("retry") : t("lockNow")}
            </button>
          ) : (
            <p className="text-sm text-white/50">{t("lockUnsupported")}</p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
