// Gebrandeter MapLibre-Style auf Basis von OpenFreeMap (kostenlos, kein Key, kein Limit).
// Wir starten vom „liberty"-Style und überschreiben Farben für den Küsten-/Kirchenlook.
// Web + Native nutzen denselben Style.

import { colors } from "./theme";

export const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Cluster/Pin-Layer-Definitionen — von beiden Plattformen (web/native) konsumiert.
export const SOURCE_ID = "events";
export const CLUSTER_LAYER = "clusters";
export const CLUSTER_COUNT_LAYER = "cluster-count";
export const POINT_LAYER = "unclustered-point";

/** GeoJSON-Source-Konfig mit Clustering. */
export const sourceConfig = {
  type: "geojson" as const,
  cluster: true,
  clusterMaxZoom: 13,
  clusterRadius: 48,
};

/** Cluster-Kreise (Koralle, Größe nach Anzahl). */
export const clusterLayer = {
  id: CLUSTER_LAYER,
  type: "circle" as const,
  source: SOURCE_ID,
  filter: ["has", "point_count"] as any,
  paint: {
    "circle-color": colors.primary,
    "circle-opacity": 0.92,
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 32] as any,
    "circle-stroke-width": 3,
    "circle-stroke-color": "#FFFFFF",
  },
};

export const clusterCountLayer = {
  id: CLUSTER_COUNT_LAYER,
  type: "symbol" as const,
  source: SOURCE_ID,
  filter: ["has", "point_count"] as any,
  layout: {
    "text-field": ["get", "point_count_abbreviated"] as any,
    "text-font": ["Noto Sans Bold"] as any,
    "text-size": 14,
  },
  paint: {
    "text-color": "#FFFFFF",
  },
};

/** Einzel-Pins (Koralle). */
export const pointLayer = {
  id: POINT_LAYER,
  type: "circle" as const,
  source: SOURCE_ID,
  filter: ["!", ["has", "point_count"]] as any,
  paint: {
    "circle-color": colors.accent,
    "circle-radius": 8,
    "circle-stroke-width": 2.5,
    "circle-stroke-color": "#FFFFFF",
  },
};
