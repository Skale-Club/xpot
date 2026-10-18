import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { TagDetail, TagPieceActivity } from "@shared/tagsApi";
import { apiRequest } from "@/lib/queryClient";
import type { BannerState } from "@/pages/tags/lib";
import type { PieceViewer } from "./pieceView";

// What every section of the one piece screen shares: the piece, who is looking
// (PieceViewer), and how its host screen takes a change. The reseller screen
// keeps the piece in its own query and shows messages in its banner; the admin
// page uses its query and toasts. Sections call `changed` with the fresh piece
// the server answers, or `refresh` when the answer is something else.

export interface PieceContextValue {
  tag: TagDetail;
  viewer: PieceViewer;
  /** The server answered with the fresh piece: show it now. */
  changed: (detail: TagDetail) => void;
  /** Re-read the piece (a call that answers with something else, e.g. a sale cancel). */
  refresh: () => void;
  notify: (message: { tone: "ok" | "error"; text: string }) => void;
  /** The reseller screen's banner, repeated inside its pop-ups (the page banner sits behind them). */
  banner?: BannerState;
}

const PieceContext = createContext<PieceContextValue | null>(null);

export function PieceProvider({ value, children }: { value: PieceContextValue; children: ReactNode }) {
  return <PieceContext.Provider value={value}>{children}</PieceContext.Provider>;
}

export function usePiece(): PieceContextValue {
  const value = useContext(PieceContext);
  if (!value) throw new Error("usePiece outside PieceProvider");
  return value;
}

/** A JSON call with the app's view header ("viewing as a rep" when management mode is off). */
export async function pieceSend<T>(method: "POST" | "PATCH", url: string, body: unknown = {}): Promise<T> {
  const res = await apiRequest(method, url, body);
  return (await res.json()) as T;
}

/** Everything that shows this piece, or counts it, reads again: both screens, the lists, the dashboards. */
export function invalidatePieceViews(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["tags"] });
  void qc.invalidateQueries({ queryKey: ["admin-tags"] });
  void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/dashboard"] });
  void qc.invalidateQueries({ queryKey: ["/api/xpot/tags/by-lead"] });
}

/** Run a write that answers with the piece, then hand the piece to the host. Throws on failure (callers show it). */
export function usePieceWrite() {
  const { changed } = usePiece();
  const qc = useQueryClient();
  return useCallback(
    async (method: "POST" | "PATCH", url: string, body: unknown = {}) => {
      const detail = await pieceSend<TagDetail>(method, url, body);
      changed(detail);
      invalidatePieceViews(qc);
      return detail;
    },
    [changed, qc],
  );
}

/** The piece's sales and (management side) stock movements. */
export function usePieceActivity(tagId: string, updatedAt: string) {
  return useQuery<TagPieceActivity>({
    // updatedAt: a sale, a cancel or a transfer changes the piece, so its activity reads again.
    queryKey: ["tags", "piece-activity", tagId, updatedAt],
    queryFn: async () => (await apiRequest("GET", `/api/xpot/tags/${encodeURIComponent(tagId)}/activity`)).json() as Promise<TagPieceActivity>,
    staleTime: 30_000,
  });
}
