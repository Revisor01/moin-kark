import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import type { LatLng } from "../filters";

export type LocationStatus = "idle" | "loading" | "granted" | "denied" | "error";

export function useLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  // Aktives Live-Abo (watchPositionAsync). Bei Unmount / Neu-Start sauber entfernen.
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Live-Tracking starten: Position folgt der Bewegung (Marker aktualisiert sich),
  // statt nur einmalig beim Start gemessen zu werden. Mehrfachaufruf ist ungefährlich —
  // ein bestehendes Abo wird zuvor entfernt.
  const startWatch = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        // Nur bei nennenswerter Bewegung / nicht zu häufig aktualisieren (Akku schonen).
        distanceInterval: 25, // Meter
        timeInterval: 5000, // ms
      },
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }
    );
  }, []);

  const request = useCallback(async (): Promise<LatLng | null> => {
    setStatus("loading");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("denied");
        return null;
      }
      // Sofort eine erste Position holen (Marker erscheint ohne Verzögerung) …
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(loc);
      setStatus("granted");
      // … und danach der Bewegung folgen.
      startWatch().catch(() => {});
      return loc;
    } catch {
      setStatus("error");
      return null;
    }
  }, [startWatch]);

  // Abo bei Unmount aufräumen.
  useEffect(() => () => watchRef.current?.remove(), []);

  return { location, status, request };
}
