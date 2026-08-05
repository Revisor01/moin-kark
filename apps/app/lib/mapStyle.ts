// Gebrandeter Küsten-Kartenstil für den Kirchenkreis Dithmarschen.
// Eigener, minimaler MapLibre-Style auf OpenFreeMap-Vektor-Tiles (kostenlos, kein Key).
// Nordsee-Blau Wasser, warmer Sand für Land, reduzierte Straßen, dezente Labels.
// Web + Native nutzen denselben Style.

import { colors } from "./theme";

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Vollständiger Style als Objekt (statt URL) → volle Farbkontrolle.
export const MAP_STYLE: any = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    openmaptiles: {
      type: "vector",
      url: TILES,
    },
  },
  layers: [
    // Land / Hintergrund — warmer Sand.
    {
      id: "background",
      type: "background",
      paint: { "background-color": colors.mapLand },
    },
    // Grünflächen / Wald / Parks — dezentes Salzwiesen-Grün.
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: { "fill-color": colors.mapGreen, "fill-opacity": 0.7 },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": colors.mapGreen, "fill-opacity": 0.5 },
    },
    // Wasser — Nordsee-Blau.
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": colors.mapWater },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": colors.mapWater, "line-width": 1.2 },
    },
    // Gebäude — sehr dezent, erst ab Zoom 14.
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": "#EFE6D6", "fill-opacity": 0.6 },
    },
    // Straßen — reduziert: nur eine ruhige Sand-Linie, Hauptstraßen etwas kräftiger.
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["in", "class", "minor", "service", "track"],
      paint: {
        "line-color": colors.mapRoad,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 2],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", "class", "primary", "secondary", "tertiary", "trunk", "motorway"],
      paint: {
        "line-color": colors.mapRoad,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 2.5, 16, 6],
      },
    },
    // Grenzen — dezent gestrichelt.
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["<=", "admin_level", 6],
      paint: {
        "line-color": colors.borderStrong,
        "line-width": 0.8,
        "line-dasharray": [3, 2],
        "line-opacity": 0.6,
      },
    },
    // Ortsnamen — ruhig, in der Markenfarbe.
    {
      id: "place-labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["in", "class", "city", "town", "village"],
      layout: {
        "text-field": ["get", "name:de"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 13, 16],
        "text-max-width": 8,
      },
      paint: {
        "text-color": colors.mapLabel,
        "text-halo-color": colors.mapLand,
        "text-halo-width": 1.6,
      },
    },
  ],
};

// --- Event-Layer (Cluster + Pins) ---
export const SOURCE_ID = "events";
export const CLUSTER_LAYER = "clusters";
const CLUSTER_COUNT_LAYER = "cluster-count";
export const POINT_LAYER = "unclustered-point";

export const sourceConfig = {
  type: "geojson" as const,
  cluster: true,
  clusterMaxZoom: 13,
  clusterRadius: 48,
};

// Cluster-Kreise: Teal, weicher weißer Ring, Größe nach Anzahl.
export const clusterLayer = {
  id: CLUSTER_LAYER,
  type: "circle" as const,
  source: SOURCE_ID,
  filter: ["has", "point_count"] as any,
  paint: {
    "circle-color": colors.primary,
    "circle-opacity": 0.94,
    "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26, 40, 34] as any,
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
    "text-size": 13,
  },
  paint: { "text-color": "#FFFFFF" },
};

// Einzel-Pins: Koralle, weißer Ring.
export const pointLayer = {
  id: POINT_LAYER,
  type: "circle" as const,
  source: SOURCE_ID,
  filter: ["!", ["has", "point_count"]] as any,
  paint: {
    "circle-color": colors.accent,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 9] as any,
    "circle-stroke-width": 2.5,
    "circle-stroke-color": "#FFFFFF",
  },
};
