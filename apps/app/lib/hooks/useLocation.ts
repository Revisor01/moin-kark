import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import type { LatLng } from "../filters";
import {
  createLocationController,
  type LocationController,
  type LocationState,
  type LocationStatus,
} from "../locationController";

export type { LocationStatus };

// Wie lange eine zuletzt bekannte Position noch als erster Marker taugt.
const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;

const toLatLng = (pos: Location.LocationObject): LatLng => ({
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
});

// Dünne React-Hülle um den Controller (s. lib/locationController.ts): Die
// Ablauflogik lebt dort und ist ohne Gerät testbar; hier werden nur die echten
// expo-location-Aufrufe hereingereicht und der Zustand in React gespiegelt.
export function useLocation() {
  const [state, setState] = useState<LocationState>({ location: null, status: "idle" });
  const controllerRef = useRef<LocationController | null>(null);

  const getController = useCallback(() => {
    controllerRef.current ??= createLocationController({
      requestPermission: async () =>
        (await Location.requestForegroundPermissionsAsync()).granted,
      getLastKnown: async () => {
        const pos = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
        return pos ? toLatLng(pos) : null;
      },
      getCurrent: async (options) => {
        // `timeout` kennt LocationOptions nicht; im Web wird es aber an
        // navigator.geolocation durchgereicht, nativ ignoriert. Daher der Cast.
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          ...options,
        } as Location.LocationOptions);
        return toLatLng(pos);
      },
      watch: (onPosition, onError) =>
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            // Nur bei nennenswerter Bewegung / nicht zu häufig aktualisieren (Akku schonen).
            distanceInterval: 25, // Meter
            timeInterval: 5000, // ms
          },
          (pos) => onPosition(toLatLng(pos)),
          onError
        ),
      platform: Platform.OS === "web" ? "web" : "native",
      onState: setState,
    });
    return controllerRef.current;
  }, []);

  // Abo bei Unmount aufräumen; im Vordergrund ein totes Abo neu starten.
  useEffect(() => {
    const controller = getController();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") controller.onAppStateActive();
    });
    return () => {
      sub.remove();
      controller.destroy();
      controllerRef.current = null;
    };
  }, [getController]);

  const request = useCallback(() => getController().request(), [getController]);

  return { location: state.location, status: state.status, request };
}
