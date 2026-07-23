import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { GeoState } from "./types";

// "unknown" = the Permissions API could not tell us (older Safari); we only
// learn the truth once getCurrentPosition either resolves or is refused.
export type GeoPermission = "unknown" | "prompt" | "granted" | "denied";

interface GeoContextValue {
  geoState: GeoState;
  setGeoState: Dispatch<SetStateAction<GeoState>>;
  loadCurrentLocation: () => Promise<void>;
  permission: GeoPermission;
  isLocating: boolean;
  hasLocation: boolean;
  setLiveTracking: Dispatch<SetStateAction<boolean>>;
}

const GeoContext = createContext<GeoContextValue | null>(null);

export function GeoProvider({ children }: { children: ReactNode }) {
  const [geoState, setGeoState] = useState<GeoState>({});
  const [permission, setPermission] = useState<GeoPermission>("unknown");
  const [isLocating, setIsLocating] = useState(false);
  const [liveTracking, setLiveTracking] = useState(false);

  const loadCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoState({ error: "Geolocation is not supported on this device." });
      setPermission("denied");
      return;
    }
    setIsLocating(true);
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoState({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
          });
          setPermission("granted");
          resolve();
        },
        (error) => {
          // Keep the last known fix: dropping it would bounce a rep who is
          // mid-search back to the "location required" gate over one timeout.
          setGeoState((prev) => ({ ...prev, error: error.message }));
          // A timeout or a lost fix is not a refusal — only code 1 is, and
          // conflating them would send the rep off to fix their iOS settings
          // when all they need is a clearer patch of sky.
          if (error.code === error.PERMISSION_DENIED) setPermission("denied");
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    });
    setIsLocating(false);
  }, []);

  // Read the current permission up front so the gate can tell "never asked"
  // from "blocked", and pick up changes made in the browser's own UI.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state as GeoPermission);
        status.onchange = () => setPermission(status.state as GeoPermission);
      })
      .catch(() => {
        // Not supported on this browser — we stay on "unknown" and find out
        // the moment the rep taps the button.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Already granted on a previous run: fetch silently, no prompt, no tap.
  useEffect(() => {
    if (permission === "granted" && geoState.lat == null && !geoState.error && !isLocating) {
      void loadCurrentLocation();
    }
  }, [permission, geoState.lat, geoState.error, isLocating, loadCurrentLocation]);

  // Continuous tracking is opt-in per screen (the check-in map turns it on)
  // rather than app-wide, because watchPosition keeps the GPS radio busy.
  useEffect(() => {
    if (!liveTracking || permission !== "granted" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setGeoState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (error) => {
        setGeoState((prev) => ({ ...prev, error: error.message }));
        if (error.code === error.PERMISSION_DENIED) setPermission("denied");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [liveTracking, permission]);

  const hasLocation = geoState.lat != null && geoState.lng != null;

  return (
    <GeoContext.Provider
      value={{ geoState, setGeoState, loadCurrentLocation, permission, isLocating, hasLocation, setLiveTracking }}
    >
      {children}
    </GeoContext.Provider>
  );
}

export function useGeoContext() {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error("useGeoContext must be used within GeoProvider");
  return ctx;
}
