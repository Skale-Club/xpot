import { useGeoContext } from "./GeoProvider";
import { queryClient } from "@/lib/queryClient";

export function useXpotShared() {
  const { geoState, loadCurrentLocation } = useGeoContext();

  const invalidateXpotData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/me"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/leads"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/visits"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/opportunities"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/xpot/admin/overview"] }),
    ]);
  };

  return { geoState, loadCurrentLocation, invalidateXpotData };
}
