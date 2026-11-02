import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { PaneBar } from "@/components/xpot/MasterDetail";
import type { TagDetail } from "@shared/tagsApi";
import { useXpotModules } from "@/components/ModuleSwitch";
import { EmptyState } from "@/components/xpot/EmptyState";
import { BackLink } from "@/components/xpot/PageHeader";
import { PieceBody } from "@/components/piece/PieceBody";
import { PieceProvider, type PieceContextValue } from "@/components/piece/PieceContext";
import { PieceHeader } from "@/components/piece/PieceHeader";
import type { PieceViewer } from "@/components/piece/pieceView";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useViewerAccess } from "@/lib/adminMode";
import { AdminHttpError, ADMIN_TAGS_KEY, getJson, STALE_MS } from "./api";
import { Loading, LoadError } from "./pieces-shared";
import { useProductionAccess } from "./production-shared";
import { NfcProvisioningCard } from "./pieces-NfcProvisioningCard";
import { useT } from "@/i18n";
import { shellMessages } from "@/i18n/messages/shell";
import { manageTagsPiecesMessages } from "@/i18n/messages/manageTagsPieces";
import { adminTagsFlowMessages } from "@/i18n/messages/adminTagsFlow";
import { isTagPieceQueue } from "@shared/tagQueues";
import { pieceQueueCard } from "./overview-model";

// Admin › Tags › a piece: the management side of the one piece screen
// (components/piece), with every section. On a computer the working sections
// sit left and Management right; Performance and Activity run across the bottom.
// In Inventory's side pane (`onClose`) the sections stack in one column, with
// "Open full page" (this same page at /admin/tags/pieces/:id) and Close on top.

type Go = (path: string) => void;

function Back({ go }: { go: Go }) {
  const ts = useT(shellMessages);
  const tf = useT(adminTagsFlowMessages);
  // A piece opened from a Today queue goes back to that queue, not to Stock.
  const from = new URLSearchParams(window.location.search).get("from");
  if (isTagPieceQueue(from)) {
    return (
      <span data-testid="admin-piece-back">
        <BackLink onBack={() => go(`/overview/${from}`)}>{tf(pieceQueueCard(from).labelKey)}</BackLink>
      </span>
    );
  }
  return (
    <span data-testid="admin-piece-back">
      <BackLink onBack={() => go("/pieces")}>{ts("managePieces")}</BackLink>
    </span>
  );
}

export function PieceDetail({ id, go, onClose }: { id: string; go: Go; /** Shown in Inventory's side pane. */ onClose?: () => void }) {
  const t = useT(manageTagsPiecesMessages);
  const { toast } = useToast();
  const access = useViewerAccess();
  const modules = useXpotModules();
  const { prints } = useProductionAccess();
  const isDesktop = useIsDesktop();
  const queryKey = [ADMIN_TAGS_KEY, "piece", id];
  const { data: tag, isLoading, error, refetch } = useQuery<TagDetail>({
    queryKey,
    queryFn: () => getJson(`/api/xpot/tags/${encodeURIComponent(id)}`),
    staleTime: STALE_MS,
    retry: (count, err) => !(err instanceof AdminHttpError && err.status < 500) && count < 2,
  });
  const changed = useCallback((detail: TagDetail) => queryClient.setQueryData(queryKey, detail), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewer = useMemo<PieceViewer>(
    // Management URLs keep the piece in the workspace of whoever manages it: the platform, a partner or an owner (the
    // server scopes every call to their organization). The desk writer and the production notes stay the admin's.
    () => ({ surface: "admin", canManage: access.adminMode, isAdmin: access.isSuperAdmin, hasVisits: modules.includes("visits"), repId: access.me?.rep.id ?? null, producesPrints: prints }),
    [access.adminMode, access.isSuperAdmin, prints, modules, access.me?.rep.id],
  );

  const top = onClose ? <PaneBar fullHref={`/admin/tags/pieces/${encodeURIComponent(id)}`} onClose={onClose} testId="admin-piece-pane" /> : <Back go={go} />;
  if (isLoading) return onClose ? <div className="space-y-3">{top}<Loading rows={5} /></div> : <Loading rows={5} />;
  if (error || !tag) {
    const notFound = error instanceof AdminHttpError && error.status === 404;
    return (
      <div className="space-y-3">
        {top}
        {notFound ? (
          <EmptyState tone="tags" icon={Ban} title={t("notFound")} />
        ) : (
          <LoadError what={t("whatThisPiece")} error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const context: PieceContextValue = {
    tag,
    viewer,
    changed,
    refresh: () => void refetch(),
    notify: ({ tone, text }) => toast(tone === "error" ? { title: t("actionFailed"), description: text, variant: "destructive" } : { title: text }),
  };

  return (
    <PieceProvider value={context}>
      <div className="min-w-0 space-y-4" data-testid="admin-piece-detail">
        {top}
        <PieceHeader tag={tag} />
        <PieceBody
          layout={onClose || !isDesktop ? "stack" : "columns"}
          desktopWriter={
            <NfcProvisioningCard
              tagId={tag.id}
              publicCode={tag.publicCode}
              nfcUrl={tag.nfcUrl}
              retired={tag.status === "retired" || tag.stockStatus === "damaged"}
              onOpenWriters={() => go("/provisioners")}
            />
          }
        />
      </div>
    </PieceProvider>
  );
}
