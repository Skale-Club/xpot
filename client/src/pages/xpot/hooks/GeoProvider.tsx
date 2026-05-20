import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { GeoState } from "./types";

interface GeoContextValue {
  geoState: GeoState;
  setGeoState: Dispatch<SetStateAction<GeoState>>;
  loadCurrentLocation: () => Promise<void>;
}

const GeoContext = createContext<GeoContextValue | null>(null);

export function GeoProvider({ children }: { children: ReactNode }) {
  const [geoState, setGeoState] = useState<GeoState>({});

  const loadCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setGeoState({ error: "Geolocation is not supported on this device." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (error) => {
        setGeoState({ error: error.message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  return (
    <GeoContext.Provider value={{ geoState, setGeoState, loadCurrentLocation }}>
      {children}
    </GeoContext.Provider>
  );
}

export function useGeoContext() {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error("useGeoContext must be used within GeoProvider");
  return ctx;
}
