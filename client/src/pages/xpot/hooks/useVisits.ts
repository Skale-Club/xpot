import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { useXpotShared } from "./useXpotShared";
import { useXpotQueries } from "./useXpotQueries";
import type { EnrichedSalesVisit } from "../types";

export function useVisits() {
  const { toast } = useToast();
  const t = useT(checkinMessages);
  const { geoState, invalidateXpotData } = useXpotShared();
  const { xpotMeQuery } = useXpotQueries();

  const visitsQuery = useQuery<EnrichedSalesVisit[]>({ queryKey: ["/api/xpot/visits"], enabled: xpotMeQuery.isSuccess });

  const checkingInRef = useRef(false);

  const activeVisit = useMemo(() => {
    const currentId = xpotMeQuery.data?.activeVisit?.id;
    if (!currentId) return null;
    return visitsQuery.data?.find((visit) => visit.id === currentId) || xpotMeQuery.data?.activeVisit || null;
  }, [xpotMeQuery.data, visitsQuery.data]);

  const activeVisitStable = useMemo(() => {
    if (activeVisit) return activeVisit;
    if (checkingInRef.current) return xpotMeQuery.data?.activeVisit || null;
    return null;
  }, [activeVisit, xpotMeQuery.data?.activeVisit]);

  const checkOutMutation = useMutation({
    // The outcome picked on the check-out screen used to be dropped here, so
    // every visit was recorded as "completed".
    mutationFn: async (vars?: { status?: string }) => {
      if (!activeVisitStable?.id) throw new Error(t("noActiveVisitCheckOut"));
      const response = await apiRequest("POST", `/api/xpot/visits/${activeVisitStable.id}/check-out`, {
        lat: geoState.lat,
        lng: geoState.lng,
        status: vars?.status,
      });
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: t("visitCompleted"), variant: "success" });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("checkOutFailed"), description: error.message, variant: "destructive" });
    },
  });

  const cancelVisitMutation = useMutation({
    mutationFn: async () => {
      if (!activeVisitStable?.id) throw new Error(t("noActiveVisitCancel"));
      const response = await apiRequest("POST", `/api/xpot/visits/${activeVisitStable.id}/cancel`);
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: t("visitCancelled") });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("cancelVisitFailed"), description: error.message, variant: "destructive" });
    },
  });

  return {
    visitsQuery,
    activeVisit: activeVisitStable,
    checkingInRef,
    checkOutMutation,
    cancelVisitMutation,
  };
}
