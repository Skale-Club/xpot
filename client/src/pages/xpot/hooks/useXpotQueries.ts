import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getXpotSection } from "@/lib/xpot";
import { COMPUTER_QUERY } from "@/hooks/use-is-desktop";
import { apiRequest } from "@/lib/queryClient";
import { signOut as signOutAndLeave } from "@/lib/signOut";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { checkinMessages } from "@/i18n/messages/checkin";
import { tabs } from "../utils";
import { useXpotShared } from "./useXpotShared";
import type { DashboardResponse, FullSalesLead, EnrichedSalesVisit, XpotMeResponse } from "../types";

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
  const t = useT(checkinMessages);
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
    // Unknown paths fall back to the device's home: check-in on the phone,
    // the dashboard on a computer (where check-ins are not started).
    const fallback = typeof window !== "undefined" && window.matchMedia(COMPUTER_QUERY).matches ? "dashboard" : "check-in";
    const section = getXpotSection(pathname);
    if (!section) return fallback;
    return tabs.some((tab) => tab.id === section) ? section : fallback;
  }, [pathname]);

  const xpotMeQuery = useQuery<XpotMeResponse>({
    queryKey: ["/api/xpot/me"],
    retry: false,
    refetchOnMount: true,
  });

  const xpotMeStatus = getHttpStatus(xpotMeQuery.error);

  useEffect(() => {
    if ((xpotMeStatus === 401 || xpotMeStatus === 403) && pathname !== "/") {
      setLocation("/");
    }
  }, [xpotMeStatus, setLocation, pathname]);

  const dashboardQuery = useQuery<DashboardResponse>({ queryKey: ["/api/xpot/dashboard"], enabled: xpotMeQuery.isSuccess });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/xpot/sync/flush");
      return response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: t("syncCompleted"),
        description: t("syncSummary", {
          leads: t.plural("syncLeads", Number(data.leadsSynced) || 0),
          opportunities: t.plural("syncOpportunities", Number(data.opportunitiesSynced) || 0),
        }),
      });
      await invalidateXpotData();
    },
    onError: (error: Error) => {
      toast({ title: t("syncFailed"), description: error.message, variant: "destructive" });
    },
  });

  const signOut = () => signOutAndLeave(setLocation);

  const me = xpotMeQuery.data ?? null;
  const repName = me
    ? me.rep.displayName
      || [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim()
      || me.user.email
      || t("defaultRepName")
    : t("defaultRepName");

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
