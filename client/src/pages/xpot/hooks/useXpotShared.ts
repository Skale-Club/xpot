import { useGeoContext } from "./GeoProvider";
import { queryClient } from "@/lib/queryClient";

export function useXpotShared() {
  const { geoState, loadCurrentLocation, permission, isLocating, hasLocation, setLiveTracking } = useGeoContext();

  const invalidateXpotData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/opportunities"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/overview"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/consignments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/products"] }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/xpot/daily-route") }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/notifications"] }),
    ]);
  };

  return { geoState, loadCurrentLocation, invalidateXpotData, permission, isLocating, hasLocation, setLiveTracking };
}
