import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine, X } from "lucide-react";
import type { TagDetail, TagLimitedView } from "@shared/tagsApi";
import { CODE_HEADING_TOPBAR, TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/xpot/EmptyState";
import { useXpotModules } from "@/components/ModuleSwitch";
import { PieceBody } from "@/components/piece/PieceBody";
import { invalidatePieceViews, pieceSend, PieceProvider, type PieceContextValue } from "@/components/piece/PieceContext";
import { PieceFacts, PieceModelLine, PieceStatusChips } from "@/components/piece/PieceHeader";
import type { PieceViewer } from "@/components/piece/pieceView";
import { useViewerAccess } from "@/lib/adminMode";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { tagsMessages } from "@/i18n/messages/tags";
import { pieceCustodyMessages } from "@/i18n/messages/pieceCustody";
import { nfcMode } from "./webNfc";
import { cameFromInApp } from "@/lib/inAppHistory";
import { APP_BASE, errorText, lookupTag, pushRecent, tagsGet, useBanner } from "./lib";
import { Banner, Spinner, TopBar } from "./ui";
import { LimitedPiece } from "./LimitedPiece";

// One piece, opened by scanning it or from the list: the reseller side of the
// one piece screen (components/piece). The header says what it is, its three
// states (Digital, Physical stock, Chip), where it is and whose it is; then
// Customer & destination, Chip, Sale and Performance. A manager in management
// mode also gets Management, with a link to the admin piece page.

type Loaded =
  | { kind: "ok"; tag: TagDetail }
  /** A piece of the viewer's Organization they don't hold (shared/tagCustody.ts): what it is and where it is. */
  | { kind: "limited"; piece: TagLimitedView }
  | { kind: "not_found" }
  | { kind: "not_yours" };

async function fetchTag(code: string): Promise<Loaded> {
  const found = await lookupTag(code);
  if (!found.ok) return { kind: found.reason };
  const piece = await tagsGet<TagDetail | TagLimitedView>(`/api/xpot/tags/${found.id}`);
  return "limited" in piece ? { kind: "limited", piece } : { kind: "ok", tag: piece };
}

export default function TagScreen({ code, onClose }: {
  code: string;
  /** Set when shown in the desktop pane beside the pieces list. */
  onClose?: () => void;
}) {
  const t = useT(tagsMessages);
  const tc = useT(commonMessages);
  const tcu = useT(pieceCustodyMessages);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { banner, show } = useBanner();
  const access = useViewerAccess();
  const modules = useXpotModules();
  const queryKey = ["tags", "piece", code];
  // A phone without Web NFC (iPhone): written with NFC Tools, confirmed by a real tap.
  const manualFlow = nfcMode() === "app";
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchTag(code),
    staleTime: 0,
    // Written but not checked (iPhone + NFC Tools): a real tap confirms it on the server; watch for it.
    refetchInterval: (q) => {
      const status = q.state.data?.kind === "ok" ? q.state.data.tag.nfcStatus : null;
      return status === "programmed" || (manualFlow && (status === "not_programmed" || status === "failed")) ? 4000 : false;
    },
  });
  const tag = data?.kind === "ok" ? data.tag : null;

  useEffect(() => {
    if (tag) pushRecent({ kind: "xpot", value: tag.publicCode });
  }, [tag?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = useCallback(
    (detail: TagDetail) => {
      const next: Loaded = { kind: "ok", tag: detail };
      qc.setQueryData(queryKey, next);
    },
    [qc, code], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const viewer = useMemo<PieceViewer>(
    () => ({ surface: "field", canManage: access.canManage, isAdmin: access.isSuperAdmin, hasVisits: modules.includes("visits"), repId: access.me?.rep.id ?? null }),
    [access.canManage, access.isSuperAdmin, modules, access.me?.rep.id],
  );

  const closeButton = onClose ? (
    <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("closePane")} title={t("closePane")}>
      <X className="!size-5" />
    </Button>
  ) : undefined;
  // Back returns to where the piece was opened from (a list, a customer, the
  // dashboard); opened from outside (a scanned QR), it goes to My pieces.
  const back = onClose ? undefined : `${APP_BASE}/pieces`;
  const goBack = () => (cameFromInApp() ? window.history.back() : navigate(`${APP_BASE}/pieces`));

  if (isLoading) {
    return (
      <>
        <TopBar title={code} back={back} onBack={back ? goBack : undefined} right={closeButton} />
        <div className="flex justify-center py-20 text-white/40">
          <Spinner className="h-8 w-8" />
        </div>
      </>
    );
  }

  if (data?.kind === "limited") {
    return (
      <>
        <LimitedPiece
          piece={data.piece}
          back={back}
          onBack={back ? goBack : undefined}
          right={closeButton}
          onReceive={async (into) => {
            // Received into the viewer's own stock, the piece is theirs: the full screen takes over.
            const detail = await pieceSend<TagDetail>("POST", `/api/xpot/tags/${data.piece.id}/receive`, { into });
            const next: Loaded = { kind: "ok", tag: detail };
            qc.setQueryData(queryKey, next);
            invalidatePieceViews(qc);
            show({ tone: "ok", text: into === "house" ? tcu("received_house") : tcu("received_me") });
          }}
        />
        <Banner banner={banner} />
      </>
    );
  }

  if (error || !tag) {
    const readAnother = !onClose ? (
      <Button type="button" variant="secondary" onClick={() => navigate(APP_BASE)}>
        <ScanLine />
        {t("readAnother")}
      </Button>
    ) : undefined;
    return (
      <>
        <TopBar title={code} back={back} onBack={back ? goBack : undefined} right={closeButton} />
        {error ? (
          <ErrorState title={<span data-testid="text-tag-error">{t("loadFailed")}</span>} message={errorText(error, tc("requestFailed"))} onRetry={() => void refetch()} />
        ) : (
          <EmptyState
            tone="tags"
            icon={ScanLine}
            title={<span data-testid="text-tag-error">{data?.kind === "not_yours" ? t("notYours") : t("notFound", { code })}</span>}
            action={readAnother}
          />
        )}
      </>
    );
  }

  const context: PieceContextValue = {
    tag,
    viewer,
    changed,
    refresh: () => void refetch(),
    notify: show,
    banner,
  };

  return (
    <PieceProvider value={context}>
      <TopBar
        title={tag.publicCode}
        titleClassName={CODE_HEADING_TOPBAR}
        back={back}
        onBack={back ? goBack : undefined}
        right={closeButton}
        picture={<TagPieceVisual productType={tag.productType} face={tag.face} size="md" title={t(`face_${tag.face ?? "none"}` as "face_none")} />}
        sub={<PieceModelLine tag={tag} />}
      />
      <div className="-mt-1 mb-3 space-y-2" data-testid="piece-header">
        <PieceStatusChips tag={tag} />
        <PieceFacts tag={tag} />
      </div>
      <Banner banner={banner} />

      <PieceBody layout="stack" />

      {!onClose && (
        <Button type="button" variant="ghost" size="lg" onClick={() => navigate(APP_BASE)} className="mt-4 w-full">
          <ScanLine className="!size-5" />
          {t("readAnother")}
        </Button>
      )}
    </PieceProvider>
  );
}
