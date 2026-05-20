import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SalesSyncEvent } from "../types";

export type SyncStatusResponse = {
  events: SalesSyncEvent[];
  failedCount: number;
};

function getEventTimestamp(event: SalesSyncEvent) {
  const timestamp = event.lastAttemptAt ?? event.createdAt ?? null;
  return timestamp ? new Date(timestamp).getTime() : 0;
}

export function useSyncStatus() {
  const queryClient = useQueryClient();

  const query = useQuery<SyncStatusResponse>({
    queryKey: ["/api/xpot/sync/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/xpot/sync/status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: async ({ entityType, entityId }: { entityType: string; entityId: string }) => {
      const res = await apiRequest("POST", "/api/xpot/sync/retry", { entityType, entityId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/sync/status"] });
    },
  });

  const latestEventsByEntity = Array.from(
    (query.data?.events ?? []).reduce((map, event) => {
      const key = `${event.entityType}:${event.entityId}`;
      const current = map.get(key);

      if (!current || getEventTimestamp(event) > getEventTimestamp(current) || event.id > current.id) {
        map.set(key, event);
      }

      return map;
    }, new Map<string, SalesSyncEvent>()).values(),
  ).sort((a, b) => getEventTimestamp(b) - getEventTimestamp(a));

  const failedEvents = latestEventsByEntity.filter((event) => event.status === "failed");

  return {
    query,
    failedEvents,
    failedCount: failedEvents.length,
    retryMutation,
  };
}
