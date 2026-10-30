import type { ReactNode } from "react";
import { EyeOff } from "lucide-react";
import type { ReceiveTarget } from "@shared/tagCustody";
import type { TagLimitedView } from "@shared/tagsApi";
import { CODE_HEADING_TOPBAR, TagModelChips, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { Pill, STOCK_STATUS_TONE, toneOf } from "@/components/xpot/StatusPill";
import { ReceivePanel } from "@/components/piece/CustodyCard";
import { useT } from "@/i18n";
import { manageTagsMessages } from "@/i18n/messages/manageTags";
import { pieceCustodyMessages } from "@/i18n/messages/pieceCustody";
import { pieceScreenMessages } from "@/i18n/messages/pieceScreen";
import { tagsMessages } from "@/i18n/messages/tags";
import { EYEBROW } from "@/components/xpot/surface";
import { CARD, TopBar } from "./ui";

// A piece of the viewer's Organization that is not theirs to work on: held by
// a colleague, by the house, or not received yet (shared/tagCustody.ts,
// pieceAccess "limited"). What it is and where it is; never its customer,
// link, chip or sale. A piece not received yet can be received from here.

export function LimitedPiece({ piece, back, onBack, right, onReceive }: {
  piece: TagLimitedView;
  back?: string;
  onBack?: () => void;
  right?: ReactNode;
  onReceive: (into: ReceiveTarget) => Promise<void>;
}) {
  const t = useT(tagsMessages);
  const tm = useT(manageTagsMessages);
  const ts = useT(pieceScreenMessages);
  const tp = useT(pieceCustodyMessages);
  const receive = piece.custody.receive;
  const holder = piece.stockStatus === "pending"
    ? tp("limitedHolder_pending")
    : piece.repId === null ? tp("limitedHolder_house") : tp("limitedHolder_rep", { name: piece.repName ?? `#${piece.repId}` });
  const stockLabel = (() => {
    const key = `stock_${piece.stockStatus}`;
    const label = tm(key as never);
    return label === key ? piece.stockStatus.replace(/_/g, " ") : label;
  })();

  return (
    <>
      <TopBar
        title={piece.publicCode}
        titleClassName={CODE_HEADING_TOPBAR}
        back={back}
        onBack={onBack}
        right={right}
        picture={<TagPieceVisual productType={piece.productType} face={piece.face} batchCode={piece.batchCode} size="md" title={t(`face_${piece.face ?? "none"}` as "face_none")} />}
        sub={<TagModelChips productType={piece.productType} face={piece.face} batchCode={piece.batchCode} />}
      />
      <div className="-mt-1 mb-3 space-y-2" data-testid="piece-limited">
        <span className="inline-flex items-center gap-1.5">
          <span className={EYEBROW}>{ts("dimStock")}</span>
          <Pill tone={toneOf(STOCK_STATUS_TONE, piece.stockStatus)}>{stockLabel}</Pill>
        </span>
        <p className="text-sm font-semibold text-white/80" data-testid="piece-limited-holder">{holder}</p>
      </div>
      <div className="space-y-3">
        {receive ? (
          <ReceivePanel targets={receive.targets} blocker={receive.blocker} management={receive.targets[0] === "house"} onReceive={onReceive} />
        ) : null}
        <section className={`${CARD} flex items-start gap-3 p-4`}>
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          <div className="space-y-1 text-sm text-white/60">
            <p>{tp("limitedNotYours")}</p>
            {!receive ? <p>{tp("limitedAskManager")}</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}
