import { useState } from "react";
import { Home, PackageCheck, Undo2 } from "lucide-react";
import type { ReceiveTarget } from "@shared/tagCustody";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/xpot/ConfirmDialog";
import { InlineAlert } from "@/components/xpot/InlineAlert";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { pieceCustodyMessages } from "@/i18n/messages/pieceCustody";
import { errorText } from "@/pages/tags/lib";
import { CARD, CARD_ACCENT, EYEBROW_MUTED } from "@/pages/tags/ui";
import { usePiece, usePieceWrite } from "./PieceContext";

// Who holds the piece, from the piece screen (docs/TAG_CUSTODY_EXECUTION_PLAN.md):
// receive a printed piece into stock, and hand one back to the house. The
// server says what this viewer may do (tag.custody); nothing here guesses.
// Writing or testing the chip never shows up here: it never moves stock.

/** Receive a piece not received into stock yet: into the house's stock or the viewer's own. */
export function ReceivePanel({ targets, blocker, onReceive, management }: {
  targets: ReceiveTarget[];
  blocker: string | null;
  onReceive: (into: ReceiveTarget) => Promise<void>;
  /** The viewer receives for the house by default (management). */
  management: boolean;
}) {
  const tp = useT(pieceCustodyMessages);
  const tc = useT(commonMessages);
  const [busy, setBusy] = useState<ReceiveTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const receive = async (into: ReceiveTarget) => {
    setBusy(into);
    setError(null);
    try {
      await onReceive(into);
    } catch (err) {
      setError(errorText(err, tc("requestFailed")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={`${CARD_ACCENT} p-4`} data-testid="custody-receive">
      <p className={EYEBROW_MUTED}>{tp("receiveTitle")}</p>
      {blocker ? (
        <div className="mt-2" data-testid="custody-receive-blocked">
          <InlineAlert tone="warning">{tp(`receiveBlocked_${blocker}` as "receiveBlocked_batch_closed")}</InlineAlert>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-white/65">{management ? tp("receiveHint") : tp("receiveHintRep")}</p>
          {error ? <div className="mt-3"><InlineAlert tone="error">{error}</InlineAlert></div> : null}
          <div className="mt-3 flex flex-col gap-2">
            {targets.map((into, i) => (
              <Button
                key={into}
                type="button"
                variant={i === 0 ? "brand" : "secondary"}
                accent="tags"
                size={i === 0 ? "lg" : "default"}
                loading={busy === into}
                disabled={busy !== null}
                onClick={() => void receive(into)}
                className="w-full"
                data-testid={`button-receive-${into}`}
              >
                {into === "house" ? <Home className="!size-5" /> : <PackageCheck className="!size-5" />}
                {into === "house" ? tp("receiveHouse") : tp("receiveMe")}
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** The custody card of the full piece screen: receive (a pending piece), hand back (a piece the viewer holds). */
export function CustodyCard() {
  const { tag, viewer, notify } = usePiece();
  const tp = useT(pieceCustodyMessages);
  const tc = useT(commonMessages);
  const write = usePieceWrite();
  const [confirming, setConfirming] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const custody = tag.custody;
  if (!custody) return null;

  const receive = custody.receive;
  // Management hands pieces back from its own Transfer field (Management section).
  const canReturn = !viewer.canManage && custody.returnToHouse !== null && custody.returnToHouse.blocker === null;
  if (!receive && !canReturn) return null;

  if (receive) {
    return (
      <ReceivePanel
        targets={receive.targets}
        blocker={receive.blocker}
        management={receive.targets[0] === "house"}
        onReceive={async (into) => {
          await write("POST", `/api/xpot/tags/${tag.id}/receive`, { into });
          notify({ tone: "ok", text: into === "house" ? tp("received_house") : tp("received_me") });
        }}
      />
    );
  }

  const handBack = async () => {
    setReturnError(null);
    try {
      await write("POST", `/api/xpot/tags/${tag.id}/return-to-house`, {});
      notify({ tone: "ok", text: tp("returned") });
    } catch (err) {
      setReturnError(errorText(err, tc("requestFailed")));
      throw err;
    }
  };

  return (
    <section className={`${CARD} p-3`} data-testid="custody-return">
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="w-full" data-testid="button-return-to-house">
        <Undo2 className="!size-4" />
        {tp("returnToHouse")}
      </Button>
      <ConfirmDialog
        accent="tags"
        open={confirming}
        onOpenChange={setConfirming}
        title={tp("returnTitle")}
        description={tp("returnBody")}
        confirmLabel={tp("returnConfirm")}
        error={returnError}
        onConfirm={() => handBack()}
      />
    </section>
  );
}
