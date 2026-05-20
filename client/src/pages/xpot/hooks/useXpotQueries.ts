import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getXpotLoginPath, getXpotSection } from "@/lib/xpot";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { tabs } from "../utils";
import { useXpotShared } from "./useXpotShared";
import type { DashboardResponse, FullSalesLead, EnrichedSalesVisit, XpotMeResponse } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMutation = ReturnType<typeof useMutation<any, any, any, any>>;

function getHttpStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(/^(\d+):/);
  return match ? Number(match[1]) : null;
}

export function useXpotQueries() {
  const [pathname, setLocation] = useLocation();
  const { toast } = useToast();
  const { invalidateXpotData } = useXpotShared();
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const activeTab = useMemo(() => {
    const section = getXpotSection(pathname);
    if (!section) return "check-in";
    return tabs.some((tab) => tab.id === section) ? section : "check-in";
  }, [pathname]);

  const xpotMeQuery = useQuery<XpotMeResponse>({
    queryKey: ["/api/xpot/me"],
    retry: false,
    refetchOnMount: true,
  });

  const xpotMeStatus = getHttpStatus(xpotMeQuery.error);

  useEffect(() => {
    if (xpotMeStatus === 401 || xpotMeStatus === 403) {
      setLocation(getXpotLoginPath());
    }
  }, [xpotMeStatus, setLocation]);

  const dashboardQuery = useQuery<DashboardResponse>({ queryKey: ["/api/xpot/dashboard"], enabled: xpotMeQuery.isSuccess });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xpot/sync/flush");
      return response.json();
    },
    onSuccess: async (data) => {
      toast({ title: "Sync completed", description: `${data.leadsSynced} leads and ${data.opportunitiesSynced} opportunities synced.` });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.clear();
    setLocation(getXpotLoginPath());
  };

  const me = xpotMeQuery.data ?? null;
  const repName = me ? me.rep.displayName || me.user.email || "Xpot Rep" : "Xpot Rep";

  return {
    xpotMeQuery,
    me,
    repName,
    signOut,
    syncMutation,
    activeTab,
    pathname,
    setLocation,
    isOnline,
    dashboardQuery,
  };
}
