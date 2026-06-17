import { useCallback, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "../filters";

export type LocationStatus = "idle" | "loading" | "granted" | "denied" | "error";

export function useLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");

  const request = useCallback(async (): Promise<LatLng | null> => {
    setStatus("loading");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("denied");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(loc);
      setStatus("granted");
      return loc;
    } catch {
      setStatus("error");
      return null;
    }
  }, []);

  return { location, status, request };
}
