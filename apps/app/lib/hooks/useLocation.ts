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
  // Wird beim Cleanup gesetzt: ein Abo, das erst NACH dem Unmount fertig wird,
  // darf nicht bestehen bleiben — sonst liefe die Ortung im Hintergrund weiter.
  const unmountedRef = useRef(false);

  const startWatch = useCallback(async () => {
    watchRef.current?.remove();
    const sub = await Location.watchPositionAsync(
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
    if (unmountedRef.current) {
      sub.remove();
      return;
    }
    watchRef.current = sub;
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

  // Abo bei Unmount aufräumen — inkl. der Markierung für ein noch ausstehendes
  // watchPositionAsync (s. startWatch).
  useEffect(
    () => () => {
      unmountedRef.current = true;
      watchRef.current?.remove();
    },
    []
  );

  return { location, status, request };
}
