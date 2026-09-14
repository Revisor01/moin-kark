// Gebrandeter Küsten-Kartenstil für den Kirchenkreis Dithmarschen.
// Eigener, minimaler MapLibre-Style auf OpenFreeMap-Vektor-Tiles (kostenlos, kein Key).
// Nordsee-Blau Wasser, warmer Sand für Land, reduzierte Straßen, dezente Labels.
// Web + Native nutzen denselben Style UND dieselben Event-Layer: die Web-Karte
// nimmt die Layer-Objekte direkt, die native Karte holt sich die Paint-Werte
// per toNativeStyle() — so gibt es jede Farbe und jeden Radius nur einmal.

import { alpha, mapColors } from "./theme";

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Dithmarschen-Kartengrenzen + Startansicht. Kartengeometrie, kein Design-Wert.
export const DITHMARSCHEN = {
  center: [9.0, 54.13] as [number, number], // [lng, lat]
  zoom: 9.4,
  /**
   * Kartengrenzen als [west, south, east, north] — das flache Format, das
   * MapLibre auf beiden Plattformen erwartet. (Die frühere verschachtelte
   * SW/NE-Schreibweise akzeptierten die Typen ab @vis.gl/react-maplibre 8.1.2
   * nicht mehr, und nativ wurde sie ohnehin von Hand flachgeklopft.)
   */
  bounds: [8.3, 53.8, 9.6, 54.5] as [number, number, number, number],
};

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
      paint: { "background-color": mapColors.land },
    },
    // Grünflächen / Wald / Parks — dezentes Salzwiesen-Grün.
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: { "fill-color": mapColors.green, "fill-opacity": 0.7 },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": mapColors.green, "fill-opacity": 0.5 },
    },
    // Wasser — Nordsee-Blau.
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": mapColors.water },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": mapColors.water, "line-width": 1.2 },
    },
    // Gebäude — sehr dezent, erst ab Zoom 14.
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": mapColors.building, "fill-opacity": 0.6 },
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
        "line-color": mapColors.road,
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
        "line-color": mapColors.road,
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
        "line-color": mapColors.boundary,
        "line-width": 0.8,
        "line-dasharray": [3, 2],
        "line-opacity": 0.6,
      },
    },
    // Ortsnamen — ruhig, in Tinte mit Sand-Halo.
    //
    // Bis Zoom 12 nur Städte (`city`/`town`), darüber auch Dörfer.
    //
    // `rank` taugt hier NICHT zur Unterscheidung, obwohl es danach aussieht: Im
    // Ausschnitt um Hennstedt tragen Büsum, Meldorf, Albersdorf, Wesselburen
    // und Heide alle Rang 11 — und Weiler wie Rehm, Fiel, Lieth und Stelle
    // ebenfalls. Nach Rang gefiltert erschienen deshalb ausgerechnet die
    // Kleinstorte, während die Orte mit Terminen fehlten. Die Klasse trennt
    // sauber: `town` sind genau die Orte, um die es geht.
    //
    // `symbol-sort-key` nach Rang bleibt für den Fall, dass bei Platzmangel
    // zwischen gleichrangigen Beschriftungen entschieden werden muss.
    {
      id: "place-labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: [
        "match",
        ["get", "class"],
        ["city", "town"],
        true,
        ["village"],
        [">=", ["zoom"], 12],
        false,
      ],
      layout: {
        // Rückfall auf `name`: In den Kacheln über Dithmarschen ist `name:de`
        // bei 80 von 124 Orten LEER — darunter Büsum, Meldorf, Albersdorf,
        // Wesselburen und Heide. Mit `["get","name:de"]` allein blieben genau
        // die Orte namenlos, an denen Termine stattfinden; beschriftet waren
        // nur die wenigen Dörfer, die zufällig ein deutsches Namensfeld haben.
        // Die Namen sind hier ohnehin deutsch, `name` ist also kein Rückschritt.
        "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 13, 16],
        "text-max-width": 8,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
      },
      paint: {
        "text-color": mapColors.label,
        "text-halo-color": mapColors.land,
        "text-halo-width": 1.6,
      },
    },
  ],
};

// --- Fog of War + Umriss des Kirchenkreises (Paint, beide Plattformen) ---
export const fogPaint = { "fill-color": mapColors.fog, "fill-opacity": alpha.fog };
export const outlinePaint = { "line-color": mapColors.outline, "line-width": 3, "line-opacity": 0.9 };

// --- Standort-Marker („Du bist hier") ---
export const userMarker = {
  color: mapColors.user,
  ring: mapColors.ring,
  ringWidth: 3,
  haloOpacity: alpha.halo,
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
    "circle-color": mapColors.cluster,
    "circle-opacity": 0.94,
    "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26, 40, 34] as any,
    "circle-stroke-width": 3,
    "circle-stroke-color": mapColors.ring,
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
    // Die Zahl gehört fest auf ihren Kreis und darf nie ausgeblendet werden;
    // zugleich soll sie keine Ortsnamen verdrängen (sie liegt über ihnen und
    // gewönne sonst jede Kollision — genau daran fehlten die Namen der Orte
    // mit Terminen).
    "text-allow-overlap": true as any,
    "text-ignore-placement": true as any,
  },
  paint: { "text-color": mapColors.ring },
};

// Einzel-Pins: Koralle, weißer Ring.
export const pointLayer = {
  id: POINT_LAYER,
  type: "circle" as const,
  source: SOURCE_ID,
  filter: ["!", ["has", "point_count"]] as any,
  paint: {
    "circle-color": mapColors.pin,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 14, 9] as any,
    "circle-stroke-width": 2.5,
    "circle-stroke-color": mapColors.ring,
  },
};

/**
 * MapLibre RN v11 erwartet die Style-Properties in camelCase und Layout + Paint
 * in EINEM `style`-Objekt (`circle-color` → `circleColor`). Diese Umschreibung
 * erspart es, jeden Layer für die native Karte ein zweites Mal hinzuschreiben.
 */
export function toNativeStyle(...parts: Record<string, unknown>[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      out[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
    }
  }
  return out;
}
