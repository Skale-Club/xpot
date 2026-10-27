import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { pieceCustodyMessages } from "@/i18n/messages/pieceCustody";
import { tagsMessages } from "@/i18n/messages/tags";
import { errorText, haptic } from "./lib";
import { BottomSheet, SHEET_TITLE, SheetActions, Spinner, StepList, TapAnimation, type Identity } from "./ui";
import { eraseChip, mapNfcError, nfcMode } from "./webNfc";
import { ChipSaveTimeout, saveChipProgress } from "./saveChipProgress";

/**
 * Erases a chip (an empty NDEF message) so it opens nothing until written again: testing a piece,
 * or starting a write over. Chrome on Android erases it here; another phone erases it with NFC
 * Tools and says so. Like every chip operation, it never moves the piece's stock.
 */
export default function EraseSheet({ open, identity, onClose, onErased }: {
  open: boolean;
  identity: Identity;
  onClose: () => void;
  /** Record the erase. May throw: the sheet shows the message and lets the user retry. */
  onErased: (signal?: AbortSignal) => Promise<void>;
}) {
  const t = useT(tagsMessages);
  const tp = useT(pieceCustodyMessages);
  const tc = useT(commonMessages);
  const [phase, setPhase] = useState<"idle" | "erasing" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // The chip was erased but recording it failed: a retry only records it.
  const [chipErased, setChipErased] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mode = nfcMode();

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      cancel();
      setPhase("idle");
      setError(null);
      setChipErased(false);
    }
    return cancel;
  }, [open, cancel]);

  const record = async () => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("saving");
    try {
      await saveChipProgress((request) => onErased(request), ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPhase("done");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof ChipSaveTimeout ? t("chipSaveTimeout") : errorText(err, tc("requestFailed")));
      setPhase("error");
    }
  };

  const start = async () => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setPhase("erasing");
    try {
      await eraseChip(ctrl.signal);
      if (ctrl.signal.aborted) return;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const e = mapNfcError(err);
      if (e.silent) return setPhase("idle");
      setError(e.code === "nfcGeneric" ? errorText(err, t("nfcGeneric")) : t(e.code));
      setPhase("error");
      return;
    }
    haptic([60, 40, 60]);
    setChipErased(true);
    await record();
  };

  const close = () => {
    cancel();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title={tp("eraseTitle")} icon={<Eraser className="h-5 w-5 shrink-0 text-white/60" />} closeOnBack>
      {phase === "done" ? (
        <div className="mt-6 text-center" data-testid="erase-done">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-10 w-10" />
          </div>
          <p className={`mt-3 ${SHEET_TITLE}`}>{tp("eraseDone")}</p>
          <Button type="button" variant="brand" accent="tags" size="lg" onClick={close} className="mt-5 w-full">
            {tc("done")}
          </Button>
        </div>
      ) : phase === "erasing" ? (
        <>
          <TapAnimation identity={identity} icon={Eraser} label={tp("eraseHold")} sub={tp("eraseHoldSub")} />
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
          <p className="text-sm text-white/70">{tp("eraseExplain")}</p>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          {mode === "web" ? (
            <SheetActions>
              <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void (chipErased ? record() : start())} className="w-full" data-testid="button-erase-now">
                {phase === "error" ? <RotateCw className="!size-5" /> : <Eraser className="!size-5" />}
                {phase === "error" ? tc("retry") : tp("eraseNow")}
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={close} className="w-full">
                {tc("cancel")}
              </Button>
            </SheetActions>
          ) : (
            // Another phone: the app can't erase; NFC Tools can, and the person tells us it is done.
            <>
              <StepList steps={(["eraseApp1", "eraseApp2", "eraseApp3"] as const).map((step) => ({ key: step, text: tp(step) }))} />
              <SheetActions>
                <Button type="button" variant="brand" accent="tags" size="lg" onClick={() => void record()} className="w-full" data-testid="button-erase-marked">
                  <Eraser className="!size-5" />
                  {tp("eraseAppDone")}
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={close} className="w-full">
                  {tc("cancel")}
                </Button>
              </SheetActions>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
