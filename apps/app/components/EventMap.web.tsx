// Karte im Browser: MapLibre liegt in einem eigenen Paket, damit Liste und Kopf nicht auf gut 1 MB Kartencode warten.
import { Suspense, lazy } from "react";
import { View } from "react-native";
import { mapColors } from "../lib/theme";
import type { EventMapProps } from "./EventMap";

const WebMap = lazy(() => import("./WebMap"));

export default function EventMap(props: EventMapProps) {
  return (
    <Suspense fallback={<View style={{ flex: 1, backgroundColor: mapColors.water }} />}>
      <WebMap {...props} />
    </Suspense>
  );
}
